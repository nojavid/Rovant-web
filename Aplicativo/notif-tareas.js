/* ============================================================
   NOTIFICACIONES DE TAREAS — se carga en todas las páginas del aplicativo
   Escucha en tiempo real (Supabase Realtime) tareas_rovant y comentarios_tarea,
   compara contra la última copia conocida y avisa qué se hizo y quién lo hizo.
   Solo avisa si el usuario activó las notificaciones en Setting y el navegador
   dio permiso. Requiere avisos.js y config.js (supabaseClient) cargados antes.
   ============================================================ */
/* ---------- Push en segundo plano: registro del dispositivo ---------- */
const RovantPush = (() => {
  const BASE = document.currentScript.src;                      // .../Aplicativo/notif-tareas.js
  const SW_URL = new URL("../sw.js", BASE).href;
  const soporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const uid = () => { try { return String((JSON.parse(sessionStorage.getItem("rovant_user") || "null") || {}).id || ""); } catch (e) { return ""; } };

  const aBytes = b64 => {
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  };

  async function clavePublica() {
    try { const c = sessionStorage.getItem("rovant_vapid"); if (c) return c; } catch (e) { /* ignorar */ }
    const { data } = await supabaseClient.from("configuracion_app").select("valor").eq("clave", "vapid_public_key").maybeSingle();
    const k = data && data.valor;
    if (!k || /PEGA_AQUI/.test(k)) throw new Error("Falta vapid_public_key en configuracion_app");
    try { sessionStorage.setItem("rovant_vapid", k); } catch (e) { /* ignorar */ }
    return k;
  }

  async function registro() {
    await navigator.serviceWorker.register(SW_URL);
    return navigator.serviceWorker.ready;
  }

  async function post(ruta, cuerpo) {
    await cargarR2Config();                                     // URL del Worker (desde Supabase)
    const r = await fetch(R2_WORKER_URL + ruta, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": uid() },
      body: JSON.stringify(cuerpo)
    });
    if (!r.ok) {
      let detalle = "";
      try { detalle = (await r.json()).detail || ""; } catch (e) { /* ignorar */ }
      throw new Error("El servidor rechazó la suscripción (" + r.status + ")" + (detalle ? ": " + detalle : ""));
    }
  }

  async function activa() {
    if (!soporta) return false;
    try { const reg = await navigator.serviceWorker.getRegistration(SW_URL); return !!(reg && await reg.pushManager.getSubscription()); }
    catch (e) { return false; }
  }

  // Registra este dispositivo para recibir avisos con la web cerrada
  async function activar() {
    if (!soporta || Notification.permission !== "granted" || !uid()) return false;
    const reg = await registro();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(await clavePublica()) });
    await post("/push/subscribe", { subscription: sub.toJSON() });
    return true;
  }

  async function desactivar() {
    if (!soporta) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = reg && await reg.pushManager.getSubscription();
      if (!sub) return;
      await post("/push/unsubscribe", { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    } catch (e) { /* ignorar */ }
  }

  // El service worker avisa cuando llega un push: reproduce el sonido si la web está abierta
  if (soporta) navigator.serviceWorker.addEventListener("message", e => {
    if (e.data && e.data.type === "rovant-push" && typeof RovantAvisos !== "undefined") RovantAvisos.sonarNotificacion();
  });

  return { soporta, activar, desactivar, activa };
})();

const RovantTareasNoti = (() => {
  const COLS = { iniciar: "Por iniciar", proceso: "En proceso", revision: "En revisión", terminada: "Terminada" };
  const PRIO = { alta: "Alta", media: "Media", baja: "Baja" };

  let snap = null;            // Map id -> tarea conocida
  let tieneAutor = false;     // ¿existe la columna tareas_rovant.actualizado_por?
  let activo = false;
  let pushActivo = false;     // si hay push, el aviso llega por push y no por esta pestaña
  let propioTs = 0;
  let nombres = {};
  let pendiente = null;

  const yo = () => { try { return JSON.parse(sessionStorage.getItem("rovant_user") || "null"); } catch (e) { return null; } };
  const miId = () => String((yo() || {}).id || "");
  const miNombre = () => (yo() || {}).nombre || "";
  const nombreDe = id => nombres[String(id)] || "Alguien";

  // Campos extra para escribir quién hizo el cambio (solo si la columna existe)
  const autor = () => (tieneAutor && miNombre() ? { actualizado_por: miNombre() } : {});
  const marcarPropio = () => { propioTs = Date.now(); };

  const norm = r => ({
    id: r.id, t: r.titulo, e: r.estado, p: r.prioridad, f: r.fecha || "", d: r.dias || 1, tag: r.etiqueta,
    av: (r.asignados || []).map(String), by: r.actualizado_por || "", cb: r.creado_por ? String(r.creado_por) : ""
  });

  async function leer() {
    const [t, c] = await Promise.all([
      supabaseClient.from("tareas_rovant").select("*"),
      supabaseClient.from("comentarios_tarea").select("id, tarea_id, user_id, autor, texto")
    ]);
    if (t.error || c.error) return null;
    const m = new Map();
    (t.data || []).forEach(r => m.set(r.id, { ...norm(r), com: [] }));
    (c.data || []).forEach(x => { const k = m.get(x.tarea_id); if (k) k.com.push(x); });
    return m;
  }

  function diferencias(antes, ahora) {
    const me = miId();
    const mias = t => t.av.includes(me);
    const propio = Date.now() - propioTs < 4000;
    const hizoYo = t => (t.by ? t.by === miNombre() : propio);
    const quien = t => (t.by || "Alguien");
    const av = [];

    ahora.forEach((t, id) => {
      const a = antes.get(id);
      if (!a) {
        if (mias(t) && !hizoYo(t)) av.push(["Nueva tarea para ti", `${quien(t)} te asignó "${t.t}" (${COLS[t.e] || t.e}, prioridad ${PRIO[t.p] || t.p}).`]);
        return;
      }
      if (mias(t)) {
        t.com.filter(c => !a.com.some(x => x.id === c.id) && String(c.user_id) !== me)
          .forEach(c => av.push([`${c.autor || "Alguien"} comentó en "${t.t}"`, c.texto]));
      }
      if (hizoYo(t)) return;
      if (mias(t) && !mias(a)) { av.push(["Te asignaron una tarea", `${quien(t)} te asignó "${t.t}".`]); return; }
      if (!mias(t) && mias(a)) { av.push(["Te quitaron de una tarea", `${quien(t)} te quitó de "${t.t}".`]); return; }
      if (!mias(t)) return;

      const cambios = [];
      if (t.e !== a.e) cambios.push(`la movió de ${COLS[a.e] || a.e} a ${COLS[t.e] || t.e}`);
      if (t.p !== a.p) cambios.push(`cambió la prioridad a ${PRIO[t.p] || t.p}`);
      if (t.t !== a.t) cambios.push(`cambió el título (antes "${a.t}")`);
      if (t.f !== a.f) cambios.push(`cambió la fecha a ${t.f || "sin fecha"}`);
      if (t.d !== a.d) cambios.push(`cambió la duración a ${t.d} ${t.d === 1 ? "día" : "días"}`);
      if (t.tag !== a.tag) cambios.push(`cambió la etiqueta a ${t.tag}`);
      const otros = t.av.filter(x => !a.av.includes(x) && x !== me).map(nombreDe);
      if (otros.length) cambios.push(`asignó también a ${otros.join(", ")}`);

      if (cambios.length) {
        const titulo = t.e !== a.e ? `Tarea movida a ${COLS[t.e] || t.e}` : "Tarea actualizada";
        av.push([titulo, `${quien(t)} ${cambios.join(" y ")}: "${t.t}".`]);
      }
    });

    antes.forEach((a, id) => {
      if (!ahora.has(id) && mias(a) && !propio) av.push(["Tarea eliminada", `Se eliminó "${a.t}".`]);
    });
    return av;
  }

  async function refrescar() {
    const ahora = await leer();
    if (!ahora) return;
    const antes = snap;
    snap = ahora;
    if (!antes || !activo || pushActivo) return;
    diferencias(antes, ahora).slice(0, 3).forEach(([t, b]) => RovantAvisos.notificar(t, b));
  }

  const programar = () => { clearTimeout(pendiente); pendiente = setTimeout(refrescar, 300); };

  async function preferencia() {
    const u = yo();
    if (!u || !u.id) return false;
    let pref = RovantAvisos.prefNoti(u.id);
    try {
      const { data } = await supabaseClient.from("configuracion_usuario").select("*").eq("user_id", u.id).maybeSingle();
      if (data && data.notificaciones) pref = data.notificaciones;
    } catch (e) { /* usa la local */ }
    return pref === "Sí" && RovantAvisos.permisoConcedido();
  }

  async function iniciar() {
    if (typeof supabaseClient === "undefined" || typeof RovantAvisos === "undefined") return;
    const u = yo();
    if (!u || !u.id) return;

    // la columna "actualizado_por" es opcional
    const probe = await supabaseClient.from("tareas_rovant").select("actualizado_por").limit(1);
    tieneAutor = !probe.error;

    const us = await supabaseClient.from("usuarios_rovant").select("id, nombre");
    (us.data || []).forEach(x => { nombres[String(x.id)] = x.nombre; });

    activo = await preferencia();
    if (activo) {
      // asegura que este dispositivo esté registrado para push (una vez por sesión)
      try {
        if (!sessionStorage.getItem("rovant_push_ok")) { await RovantPush.activar(); sessionStorage.setItem("rovant_push_ok", "1"); }
      } catch (e) { console.warn("Push:", e.message); }
      pushActivo = await RovantPush.activa();
    }
    snap = await leer();

    supabaseClient.channel("noti-tareas-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "tareas_rovant" }, programar)
      .on("postgres_changes", { event: "*", schema: "public", table: "comentarios_tarea" }, programar)
      .subscribe();

    // al volver a la pestaña: recupera cambios y relee la preferencia
    document.addEventListener("visibilitychange", async () => {
      if (document.hidden) return;
      activo = await preferencia();
      pushActivo = activo && await RovantPush.activa();
      programar();
    });
  }

  window.addEventListener("load", () => { iniciar().catch(e => console.warn("Notificaciones de tareas:", e)); });

  return { autor, marcarPropio };
})();
