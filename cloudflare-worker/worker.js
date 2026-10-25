/* ============================================================
   Rovant — Worker de Cloudflare para los APKs en R2
   GET  /apk/<archivo>.apk   -> descarga pública (adjunto)
   PUT  /apk/<archivo>.apk   -> subida (solo usuarios de Rovant)
   DELETE /apk/<archivo>.apk -> eliminar (solo usuarios de Rovant)
   GET/PUT/DELETE /media/<archivo> -> imágenes, videos, audio y PDF de los anuncios (guardados como anuncios/<archivo>)
   POST /ai/anuncio          -> DeepSeek (secreto DEEPSEEK_API_KEY). Dos modos:
        · {imagenes}  + X-User-Id                         -> borrador de anuncio con la tabla "cambios"
        · {version_instalada, version_nueva, apk_nombre?} -> aviso corto de actualización (la app, sin sesión)
   GET  /usage             -> bytes y archivos del bucket (solo usuarios de Rovant)
   POST /push/subscribe | /push/unsubscribe | /notify  -> ver push.js
   Bindings: BUCKET (R2). Variables: SUPABASE_URL, SUPABASE_ANON_KEY,
   ALLOWED_ORIGINS (opcional, separados por coma; por defecto "*")
   ============================================================ */
import { guardarSuscripcion, quitarSuscripcion, procesarWebhook } from "./push.js";

const MAX_BYTES = 100 * 1024 * 1024; // tope de Cloudflare para el cuerpo de una petición (planes Free y Pro)
const MEDIA_VALIDO = /^[A-Za-z0-9._-]{1,200}\.(png|jpe?g|gif|webp|mp4|webm|mov|mp3|ogg|wav|pdf)$/i;
const MEDIA_TIPOS = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", pdf: "application/pdf"
};
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

const ESTILOS = {
  acento: ["verde", "azul", "naranja", "morado", "rojo", "gris"],
  fuente: ["moderna", "elegante", "redondeada"],
  alineacion: ["izquierda", "centro"],
  fondo: ["limpio", "suave", "degradado"]
};

async function generarAnuncioIA(env, imagenes) {
  const sb = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` };
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/cambios?select=titulo,descripcion,categoria&order=created_at.desc&limit=40`, { headers: sb });
  if (!r.ok) return { status: 502, body: { error: "No se pudo leer la tabla 'cambios' de Supabase (" + r.status + ")" } };
  const cambios = await r.json();
  if (!Array.isArray(cambios) || !cambios.length) return { status: 404, body: { error: "La tabla 'cambios' no tiene registros" } };

  // variedad: un ángulo creativo al azar y los anuncios previos para no repetirlos
  const enfoques = [
    "historia corta: empieza por un momento real del usuario al conducir y cómo ahora es mejor",
    "lo más importante primero: destaca UNA novedad estrella y deja las demás como apoyo",
    "tono cercano y directo, como un mensaje de un amigo del equipo",
    "sobrio y premium: frases cortas, pocas palabras, mucha elegancia",
    "enfocado en seguridad y tranquilidad al volante",
    "enfocado en ahorrar tiempo y evitar sorpresas en la ruta",
    "celebrando: tono entusiasta pero sin exagerar ni signos de exclamación repetidos"
  ];
  const enfoque = enfoques[Math.floor(Math.random() * enfoques.length)];
  let previos = [];
  try {
    const p = await fetch(`${env.SUPABASE_URL}/rest/v1/anuncios?select=titulo,estilo&order=created_at.desc&limit=5`, { headers: sb });
    if (p.ok) previos = await p.json();
  } catch (e) { /* sin historial: no pasa nada */ }

  const sistema = `Eres el director creativo de anuncios de Rovant, una app de movilidad, control y productividad. Recibes una lista técnica de cambios y diseñas COMPLETO un anuncio profesional, minimalista y elegante para usuarios no técnicos, en español. Tú decides todo: título, texto, imagen, tipografía, color, alineación y fondo. Sé creativo y varía el enfoque; nada genérico.

CONTENIDO
- "titulo": específico a lo nuevo, máx. 70 caracteres (nada de "Novedades" o "Actualización" a secas).
- "texto": primera línea = subtítulo breve (máx. 90 caracteres). Después, de 3 a 6 líneas, cada una un ítem con este formato exacto: "<emoji> <Encabezado corto> — <qué cambió y qué gana el usuario, máx. 15 palabras>". Un solo emoji por ítem que represente exactamente esa mejora (🗺️ mapa, 🚦 semáforos, ⚡ velocidad, 🔒 sesión, 🎙️ voz, 📍 ubicación, 🐞 errores, 🔔 avisos...). Separa líneas con \n. Sin párrafos largos, sin jerga técnica, sin IDs. Agrupa cambios parecidos y omite lo irrelevante. Poco texto, mucho aire.
- "imagen": OBLIGATORIO. Elige SIEMPRE una imagen del catálogo (campo "archivo" EXACTO) y la que mejor combine con el mensaje. Nunca la dejes vacía.

DISEÑO ("estilo", elige un valor de cada lista, el que mejor transmita el mensaje; explora todas las opciones y evita caer siempre en verde + moderna + izquierda: el color y la tipografía deben reflejar el tono del anuncio, p. ej. azul para confianza, naranja para atención, morado para algo especial, elegante para un tono premium)
- "acento": ${ESTILOS.acento.join(" | ")}
- "fuente": ${ESTILOS.fuente.join(" | ")}
- "alineacion": ${ESTILOS.alineacion.join(" | ")}
- "fondo": ${ESTILOS.fondo.join(" | ")}

Responde SOLO un JSON: {"titulo":"","texto":"","imagen":"","estilo":{"acento":"","fuente":"","alineacion":"","fondo":""}}`;

  const ia = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.9,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sistema },
        { role: "user", content: "Cambios recientes (JSON):\n" + JSON.stringify(cambios) + "\n\nCatálogo de imágenes (JSON):\n" + JSON.stringify(imagenes)
          + "\n\nEnfoque creativo para ESTE anuncio: " + enfoque
          + (previos.length ? "\n\nAnuncios anteriores (NO repitas sus títulos, ni su estilo, ni la misma imagen si hay otra que encaje):\n" + JSON.stringify(previos) : "") }
      ]
    })
  });
  if (!ia.ok) return { status: 502, body: { error: "DeepSeek respondió " + ia.status } };
  try {
    const out = JSON.parse((await ia.json()).choices[0].message.content);
    const elegir = (k, v) => ESTILOS[k].includes(v) ? v : ESTILOS[k][0];
    const est = out.estilo || {};
    // la imagen es obligatoria: si la IA no eligió una válida, se usa la primera del catálogo
    const imagen = imagenes.some(i => i.archivo === out.imagen) ? out.imagen : (imagenes[0] ? imagenes[0].archivo : "");
    return { status: 200, body: {
      titulo: String(out.titulo || "").slice(0, 120),
      texto: String(out.texto || "").slice(0, 2000),
      imagen,
      estilo: { acento: elegir("acento", est.acento), fuente: elegir("fuente", est.fuente), alineacion: elegir("alineacion", est.alineacion), fondo: elegir("fondo", est.fondo) }
    } };
  } catch (e) {
    return { status: 502, body: { error: "La IA devolvió una respuesta no válida" } };
  }
}

/* ---------- Aviso de actualización (lo pide la app instalada, sin sesión) ----------
   POST /ai/anuncio  {version_instalada, version_nueva, apk_nombre?}  ->  {texto}
   Como lo llama cualquier celular con la app, se protege así:
   - formato de versión estricto (nada libre llega al prompt)
   - version_nueva debe ser la APK activa de Supabase (apk_versions.is_active)
   - máx. 10 peticiones por minuto por IP (binding AI_RATE_LIMITER)
   - la respuesta se guarda 24 h en caché por par de versiones: DeepSeek se llama una vez por par
   - DeepSeek tiene 8 s de plazo; si falla, la app muestra su texto de respaldo */
const VERSION_VALIDA = /^v?\d{1,4}(\.\d{1,4}){0,3}$/;
const APK_VALIDO = /^[A-Za-z0-9._-]{1,120}$/;
const sinV = v => String(v).trim().replace(/^v/i, "");

async function generarAvisoActualizacion(env, body) {
  const instalada = String(body.version_instalada ?? "").trim();
  const nueva = String(body.version_nueva ?? "").trim();
  const apk = body.apk_nombre == null ? "" : String(body.apk_nombre).trim();
  if (!VERSION_VALIDA.test(instalada) || !VERSION_VALIDA.test(nueva) || (apk && !APK_VALIDO.test(apk)))
    return { status: 400, body: { error: "Versiones no válidas" } };

  const sb = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` };
  const v = await fetch(`${env.SUPABASE_URL}/rest/v1/apk_versions?select=version&is_active=eq.true&limit=1`, { headers: sb });
  if (!v.ok) return { status: 502, body: { error: "No se pudo leer apk_versions (" + v.status + ")" } };
  const activa = (await v.json())[0];
  if (!activa || sinV(activa.version) !== sinV(nueva)) return { status: 400, body: { error: "Esa no es la versión vigente" } };

  const cache = caches.default;
  const clave = new Request(`https://cache.rovant.internal/ai-actualizar/${encodeURIComponent(sinV(instalada))}/${encodeURIComponent(sinV(nueva))}`);
  const guardado = await cache.match(clave);
  if (guardado) return { status: 200, body: await guardado.json() };

  // novedades reales (si se pueden leer) para que "mejoras" no sea vacío
  let novedades = [];
  try {
    const c = await fetch(`${env.SUPABASE_URL}/rest/v1/cambios?select=titulo&order=created_at.desc&limit=6`, { headers: sb });
    if (c.ok) novedades = (await c.json()).map(x => x.titulo).filter(Boolean);
  } catch (e) { /* sin novedades: el aviso sigue siendo válido */ }

  const sistema = `Eres el asistente de Rovant. El usuario tiene la versión ${sinV(instalada)} y hay una nueva ${sinV(nueva)} disponible${apk ? ` (archivo ${apk})` : ""}. Escribe un anuncio corto (máximo 2 líneas), amigable y persuasivo, invitando al usuario a actualizar. Menciona que la nueva versión tiene mejoras.`
    + (novedades.length ? ` Novedades reales para inspirarte, sin inventar otras: ${novedades.join("; ")}.` : "")
    + ` Responde solo con el texto del anuncio, en español, sin comillas, sin títulos ni listas.`;

  const ia = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.7,
      max_tokens: 120,
      messages: [{ role: "system", content: sistema }, { role: "user", content: "Escribe el anuncio." }]
    })
  });
  if (!ia.ok) return { status: 502, body: { error: "DeepSeek respondió " + ia.status } };
  const bruto = String((await ia.json()).choices?.[0]?.message?.content || "");
  const texto = bruto.replace(/^["'“”]+|["'“”]+$/g, "").split("\n").map(l => l.trim()).filter(Boolean).slice(0, 2).join("\n").slice(0, 280);
  if (!texto) return { status: 502, body: { error: "La IA devolvió un texto vacío" } };

  const salida = { texto };
  await cache.put(clave, new Response(JSON.stringify(salida), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=86400" } }));
  return { status: 200, body: salida };
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

    // ----- Anuncio redactado por IA (DeepSeek) a partir de la tabla "cambios" -----
    if (url.pathname === "/ai/anuncio" && req.method === "POST") {
      // Límite por IP (binding AI_RATE_LIMITER, ver wrangler.toml) antes de gastar saldo de DeepSeek
      if (env.AI_RATE_LIMITER) {
        const ip = req.headers.get("cf-connecting-ip") || "unknown";
        const { success } = await env.AI_RATE_LIMITER.limit({ key: ip });
        if (!success) return json({ error: "Demasiadas peticiones. Intenta de nuevo en un minuto." }, 429, h);
      } else {
        console.warn("AI_RATE_LIMITER no está configurado: /ai/anuncio sin límite de peticiones");
      }
      const body = await req.json().catch(() => ({}));
      if (!env.DEEPSEEK_API_KEY) return json({ error: "Falta el secreto DEEPSEEK_API_KEY en el Worker" }, 500, h);
      // Modo 1: aviso de actualización pedido por la app (público, ver generarAvisoActualizacion)
      if (body.version_instalada !== undefined || body.version_nueva !== undefined) {
        try {
          const r = await generarAvisoActualizacion(env, body);
          return json(r.body, r.status, h);
        } catch (e) {
          return json({ error: "No se pudo generar el aviso" }, 502, h);
        }
      }
      // Modo 2: borrador de anuncio desde la tabla "cambios" (solo usuarios de Rovant)
      if (!(await usuarioValido(req.headers.get("X-User-Id"), env))) return json({ error: "No autorizado" }, 401, h);
      const imagenes = (Array.isArray(body.imagenes) ? body.imagenes : []).slice(0, 50)
        .filter(i => i && typeof i.archivo === "string" && typeof i.descripcion === "string")
        .map(i => ({ archivo: i.archivo.slice(0, 120), descripcion: i.descripcion.slice(0, 300) }));
      const res = await generarAnuncioIA(env, imagenes);
      return json(res.body, res.status, h);
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

    // ----- Archivos de anuncios (imagen, video, audio, PDF) -----
    const mm = url.pathname.match(/^\/media\/([^/]+)$/);
    if (mm) {
      const nombre = decodeURIComponent(mm[1]);
      if (!MEDIA_VALIDO.test(nombre)) return json({ error: "Nombre o tipo de archivo no permitido" }, 400, h);
      const clave = "anuncios/" + nombre;
      const tipo = MEDIA_TIPOS[nombre.split(".").pop().toLowerCase()];

      if (req.method === "GET") {
        const obj = await env.BUCKET.get(clave, { range: req.headers });   // admite Range (video)
        if (!obj) return json({ error: "Archivo no encontrado" }, 404, h);
        const cab = { ...h, "Content-Type": tipo, "Accept-Ranges": "bytes", "ETag": obj.httpEtag, "Cache-Control": "public, max-age=3600" };
        if (obj.range) {
          const ini = obj.range.offset ?? 0;
          const fin = obj.range.length !== undefined ? ini + obj.range.length - 1 : obj.size - 1;
          return new Response(obj.body, { status: 206, headers: { ...cab, "Content-Range": `bytes ${ini}-${fin}/${obj.size}`, "Content-Length": String(fin - ini + 1) } });
        }
        return new Response(obj.body, { headers: { ...cab, "Content-Length": String(obj.size) } });
      }
      if (req.method === "PUT") {
        if (!(await usuarioValido(req.headers.get("X-User-Id"), env))) return json({ error: "No autorizado" }, 401, h);
        const largo = Number(req.headers.get("Content-Length") || 0);
        if (!largo || largo > MAX_BYTES) return json({ error: "El archivo supera el límite de 100 MB" }, 413, h);
        if (await env.BUCKET.head(clave)) return json({ error: "Ya existe un archivo con ese nombre" }, 409, h);
        await env.BUCKET.put(clave, req.body, { httpMetadata: { contentType: tipo } });
        return json({ ok: true, key: nombre }, 201, h);
      }
      if (req.method === "DELETE") {
        if (!(await usuarioValido(req.headers.get("X-User-Id"), env))) return json({ error: "No autorizado" }, 401, h);
        await env.BUCKET.delete(clave);
        return json({ ok: true }, 200, h);
      }
      return json({ error: "Método no permitido" }, 405, h);
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
