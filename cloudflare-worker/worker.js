/* ============================================================
   Rovant — Worker de Cloudflare para los APKs en R2
   GET  /apk/<archivo>.apk   -> descarga pública (adjunto)
   PUT  /apk/<archivo>.apk   -> subida (solo usuarios de Rovant)
   DELETE /apk/<archivo>.apk -> eliminar (solo usuarios de Rovant)
   GET  /usage               -> bytes y archivos del bucket (solo usuarios de Rovant)
   POST /push/subscribe | /push/unsubscribe | /notify  -> ver push.js
   Bindings: BUCKET (R2). Variables: SUPABASE_URL, SUPABASE_ANON_KEY,
   ALLOWED_ORIGINS (opcional, separados por coma; por defecto "*")
   ============================================================ */
import { guardarSuscripcion, quitarSuscripcion, procesarWebhook } from "./push.js";

const MAX_BYTES = 100 * 1024 * 1024; // tope de Cloudflare para el cuerpo de una petición (planes Free y Pro)
const NOMBRE_VALIDO = /^[A-Za-z0-9._-]{1,200}\.apk$/;

function cors(req, env) {
  const permitidos = (env.ALLOWED_ORIGINS || "*").split(",").map(s => s.trim());
  const origen = req.headers.get("Origin") || "";
  const ok = permitidos.includes("*") || permitidos.includes(origen);
  return {
    "Access-Control-Allow-Origin": ok ? (permitidos.includes("*") ? "*" : origen) : permitidos[0],
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-User-Id",
    "Access-Control-Expose-Headers": "Content-Disposition, Content-Length",
    "Vary": "Origin"
  };
}

const json = (obj, status, h) =>
  new Response(JSON.stringify(obj), { status, headers: { ...h, "Content-Type": "application/json" } });

// El usuario debe existir en usuarios_rovant (misma tabla que usa el login)
async function usuarioValido(id, env) {
  if (!id || !/^[0-9a-fA-F-]{1,64}$/.test(id)) return false;
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/usuarios_rovant?id=eq.${encodeURIComponent(id)}&select=id`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` }
  });
  if (!r.ok) return false;
  const filas = await r.json();
  return Array.isArray(filas) && filas.length === 1;
}

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });

    const url = new URL(req.url);

    // ----- Web Push (notificaciones en segundo plano) -----
    if (url.pathname === "/notify" && req.method === "POST") {
      if (!env.WEBHOOK_SECRET || req.headers.get("x-webhook-secret") !== env.WEBHOOK_SECRET) return json({ error: "No autorizado" }, 401, h);
      const ev = await req.json().catch(() => null);
      if (!ev || !ev.table) return json({ error: "Evento inválido" }, 400, h);
      const enviados = await procesarWebhook(env, ev);
      return json({ ok: true, enviados }, 200, h);
    }
    if ((url.pathname === "/push/subscribe" || url.pathname === "/push/unsubscribe") && req.method === "POST") {
      const uid = req.headers.get("X-User-Id");
      if (!(await usuarioValido(uid, env))) return json({ error: "No autorizado" }, 401, h);
      const body = await req.json().catch(() => ({}));
      const res = url.pathname === "/push/subscribe"
        ? await guardarSuscripcion(env, uid, body.subscription)
        : await quitarSuscripcion(env, uid, body.endpoint || "");
      return json(res, res.ok ? 200 : 400, h);
    }

    // ----- Uso del bucket (para la página Almacenamiento) -----
    if (url.pathname === "/usage" && req.method === "GET") {
      if (!(await usuarioValido(req.headers.get("X-User-Id"), env))) return json({ error: "No autorizado" }, 401, h);
      let bytes = 0, archivos = 0, cursor;
      do {
        const lote = await env.BUCKET.list({ cursor, limit: 1000 });
        for (const o of lote.objects) { bytes += o.size; archivos++; }
        cursor = lote.truncated ? lote.cursor : undefined;
      } while (cursor);
      return json({ bytes, archivos }, 200, h);
    }

    const m = url.pathname.match(/^\/apk\/([^/]+)$/);
    if (!m) return json({ error: "No encontrado" }, 404, h);
    const nombre = decodeURIComponent(m[1]);
    if (!NOMBRE_VALIDO.test(nombre)) return json({ error: "Nombre de archivo inválido" }, 400, h);

    if (req.method === "GET") {
      const obj = await env.BUCKET.get(nombre);
      if (!obj) return json({ error: "APK no encontrado" }, 404, h);
      const descarga = (url.searchParams.get("name") || nombre).replace(/[^A-Za-z0-9._-]/g, "_");
      return new Response(obj.body, {
        headers: {
          ...h,
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Length": String(obj.size),
          "Content-Disposition": `attachment; filename="${descarga}"`,
          "ETag": obj.httpEtag,
          "Cache-Control": "public, max-age=300"
        }
      });
    }

    if (req.method === "PUT") {
      if (!(await usuarioValido(req.headers.get("X-User-Id"), env))) return json({ error: "No autorizado" }, 401, h);
      const largo = Number(req.headers.get("Content-Length") || 0);
      if (!largo || largo > MAX_BYTES) return json({ error: "El archivo supera el límite de 100 MB" }, 413, h);
      if (await env.BUCKET.head(nombre)) return json({ error: "Ya existe un archivo con ese nombre" }, 409, h);
      await env.BUCKET.put(nombre, req.body, {
        httpMetadata: { contentType: "application/vnd.android.package-archive" }
      });
      return json({ ok: true, key: nombre }, 201, h);
    }

    if (req.method === "DELETE") {
      if (!(await usuarioValido(req.headers.get("X-User-Id"), env))) return json({ error: "No autorizado" }, 401, h);
      await env.BUCKET.delete(nombre);
      return json({ ok: true }, 200, h);
    }

    return json({ error: "Método no permitido" }, 405, h);
  }
};
