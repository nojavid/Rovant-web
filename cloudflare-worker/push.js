/* ============================================================
   Notificaciones push en segundo plano (Web Push + VAPID)
   - /push/subscribe y /push/unsubscribe: el navegador registra su suscripción
   - /notify: lo llama un Database Webhook de Supabase cuando cambia una tarea
   Secretos del Worker: SUPABASE_SERVICE_KEY, VAPID_PRIVATE_KEY, WEBHOOK_SECRET
   Variables: VAPID_PUBLIC_KEY, VAPID_SUBJECT
   ============================================================ */
import { buildPushPayload } from "@block65/webcrypto-web-push";

const COLS = { iniciar: "Por iniciar", proceso: "En proceso", revision: "En revisión", terminada: "Terminada" };
const PRIO = { alta: "Alta", media: "Media", baja: "Baja" };
const URL_TAREAS = "Aplicativo/Tareas/Tareas.html";

// Acceso a Supabase con la clave de servicio (solo vive en el Worker)
const sb = (env, path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
  ...init,
  headers: {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...(init.headers || {})
  }
});

/* ---------- Suscripciones ---------- */
export async function guardarSuscripcion(env, userId, sub) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return { ok: false, detail: "Suscripción incompleta" };
  if (!/^https:\/\//.test(sub.endpoint)) return { ok: false, detail: "Endpoint inválido" };
  if (!env.SUPABASE_SERVICE_KEY) return { ok: false, detail: "Falta el secreto SUPABASE_SERVICE_KEY en el Worker" };
  const r = await sb(env, "push_subscriptions?on_conflict=endpoint", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth })
  });
  return r.ok ? { ok: true } : { ok: false, detail: `Supabase respondió ${r.status}: ${(await r.text()).slice(0, 200)}` };
}

export async function quitarSuscripcion(env, userId, endpoint) {
  const r = await sb(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
  return r.ok ? { ok: true } : { ok: false, detail: `Supabase respondió ${r.status}` };
}

/* ---------- Envío ---------- */
async function enviar(env, avisos) {
  if (!avisos.length) return 0;
  const ids = [...new Set(avisos.map(a => a.userId))];
  const r = await sb(env, `push_subscriptions?user_id=in.(${ids.map(encodeURIComponent).join(",")})&select=*`);
  if (!r.ok) return 0;
  const subs = await r.json();
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  let enviados = 0;

  await Promise.all(subs.map(async s => {
    for (const a of avisos.filter(x => String(x.userId) === String(s.user_id))) {
      try {
        const payload = await buildPushPayload(
          { data: JSON.stringify({ title: a.title, body: a.body, url: URL_TAREAS, tag: a.tag }), options: { ttl: 3600 } },
          { endpoint: s.endpoint, expirationTime: null, keys: { auth: s.auth, p256dh: s.p256dh } },
          vapid
        );
        const res = await fetch(s.endpoint, payload);
        if (res.status === 404 || res.status === 410) {
          await sb(env, `push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" });
          break;
        }
        if (res.ok) enviados++;
      } catch (e) { /* una suscripción mala no frena a las demás */ }
    }
  }));
  return enviados;
}

/* ---------- Qué avisar según el cambio ---------- */
async function nombres(env) {
  const r = await sb(env, "usuarios_rovant?select=id,nombre");
  const m = {};
  if (r.ok) (await r.json()).forEach(u => { m[String(u.id)] = u.nombre; });
  return m;
}

async function construirAvisos(env, ev) {
  const nom = await nombres(env);
  const nombreDe = id => nom[String(id)] || "Alguien";
  const arr = v => (Array.isArray(v) ? v.map(String) : []);
  const out = [];
  const add = (userId, title, body, tag) => out.push({ userId, title, body, tag });

  if (ev.table === "comentarios_tarea" && ev.type === "INSERT") {
    const c = ev.record;
    const r = await sb(env, `tareas_rovant?id=eq.${encodeURIComponent(c.tarea_id)}&select=titulo,asignados`);
    const t = r.ok ? (await r.json())[0] : null;
    if (!t) return out;
    arr(t.asignados).filter(id => id !== String(c.user_id))
      .forEach(id => add(id, `${c.autor || "Alguien"} comentó en "${t.titulo}"`, c.texto, "com-" + c.id));
    return out;
  }

  if (ev.table !== "tareas_rovant") return out;
  const n = ev.record, o = ev.old_record;

  if (ev.type === "INSERT") {
    const quien = n.actualizado_por || (n.creado_por ? nombreDe(n.creado_por) : "Alguien");
    arr(n.asignados).filter(id => nombreDe(id) !== quien && id !== String(n.creado_por))
      .forEach(id => add(id, "Nueva tarea para ti", `${quien} te asignó "${n.titulo}" (${COLS[n.estado] || n.estado}, prioridad ${PRIO[n.prioridad] || n.prioridad}).`, "t-" + n.id));
    return out;
  }

  if (ev.type === "DELETE") {
    arr(o.asignados).forEach(id => add(id, "Tarea eliminada", `Se eliminó "${o.titulo}".`, "t-" + o.id));
    return out;
  }

  if (ev.type === "UPDATE") {
    const quien = n.actualizado_por || "Alguien";
    const nuevos = arr(n.asignados), viejos = arr(o && o.asignados);
    const sinDetalle = !o || o.titulo === undefined;   // falta REPLICA IDENTITY FULL
    nuevos.filter(id => nombreDe(id) !== quien).forEach(id => {
      if (!sinDetalle && !viejos.includes(id)) return add(id, "Te asignaron una tarea", `${quien} te asignó "${n.titulo}".`, "t-" + n.id);
      if (sinDetalle) return add(id, "Tarea actualizada", `"${n.titulo}" tuvo cambios.`, "t-" + n.id);
      const c = [];
      if (n.estado !== o.estado) c.push(`la movió de ${COLS[o.estado] || o.estado} a ${COLS[n.estado] || n.estado}`);
      if (n.prioridad !== o.prioridad) c.push(`cambió la prioridad a ${PRIO[n.prioridad] || n.prioridad}`);
      if (n.titulo !== o.titulo) c.push(`cambió el título (antes "${o.titulo}")`);
      if (n.fecha !== o.fecha) c.push(`cambió la fecha a ${n.fecha || "sin fecha"}`);
      if (n.dias !== o.dias) c.push(`cambió la duración a ${n.dias} ${n.dias === 1 ? "día" : "días"}`);
      if (n.etiqueta !== o.etiqueta) c.push(`cambió la etiqueta a ${n.etiqueta}`);
      const otros = nuevos.filter(x => !viejos.includes(x) && x !== id).map(nombreDe);
      if (otros.length) c.push(`asignó también a ${otros.join(", ")}`);
      if (c.length) add(id, n.estado !== o.estado ? `Tarea movida a ${COLS[n.estado] || n.estado}` : "Tarea actualizada", `${quien} ${c.join(" y ")}: "${n.titulo}".`, "t-" + n.id);
    });
    if (!sinDetalle) viejos.filter(id => !nuevos.includes(id) && nombreDe(id) !== quien)
      .forEach(id => add(id, "Te quitaron de una tarea", `${quien} te quitó de "${n.titulo}".`, "t-" + n.id));
  }
  return out;
}

export async function procesarWebhook(env, ev) {
  const avisos = await construirAvisos(env, ev);
  return enviar(env, avisos);
}
