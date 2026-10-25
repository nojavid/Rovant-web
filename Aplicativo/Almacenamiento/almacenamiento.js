/* ============================================================
   UTILIDADES
   ============================================================ */
function escapeHtml(t) {
  return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function normalizar(t) {
  return (t || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/* ============================================================
   NAVEGACIÓN / SESIÓN
   ============================================================ */
function inicializarCerrarSesion() {
  const btn = document.getElementById("btnCerrarSesion");
  if (!btn) return;
  btn.addEventListener("click", e => {
    e.preventDefault();
    sessionStorage.clear();
    localStorage.clear();
    window.location.href = "../../index.html";
  });
}

function obtenerUsuarioLogueado() {
  try {
    const raw = sessionStorage.getItem("rovant_user") || localStorage.getItem("rovant_user");
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignorar */ }
  return null;
}

async function cargarHeaderUsuario() {
  const u = obtenerUsuarioLogueado();
  if (!u) return;
  document.getElementById("headerUserName").textContent = u.nombre || "Usuario";
  document.getElementById("headerUserRole").textContent = u.cargo || "Sin cargo";
  let avatar = null;
  try {
    if (u.id) {
      const { data } = await supabaseClient.from("configuracion_usuario").select("avatar_url").eq("user_id", u.id).maybeSingle();
      if (data && data.avatar_url) avatar = data.avatar_url;
    }
  } catch (e) { /* ignorar */ }
  if (!avatar) avatar = u.avatar_file || u.avatar_url;
  if (avatar) {
    document.getElementById("headerAvatar").src =
      (avatar.startsWith("../") || avatar.startsWith("http")) ? avatar : "../../Iconos/Avatar/" + avatar;
  }
}

/* ============================================================
   MENÚ DESPLEGABLE MÓVIL Y ARRASTRE
   ============================================================ */
function inicializarMenuMovil() {
  const sidebar = document.getElementById("sidebar");
  const userInfo = document.getElementById("userInfoToggle");
  const overlay = document.getElementById("menuOverlay");
  if (!sidebar) return;

  const abrirMenu = () => {
    sidebar.classList.add("open");
    if (overlay) overlay.classList.add("show");
    document.body.classList.add("menu-open");
    document.body.style.overflow = "hidden";
  };
  const cerrarMenu = () => {
    sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("show");
    document.body.classList.remove("menu-open");
    document.body.style.overflow = "";
  };

  if (userInfo) userInfo.addEventListener("click", e => {
    if (window.innerWidth <= 1100) {
      e.stopPropagation();
      sidebar.classList.contains("open") ? cerrarMenu() : abrirMenu();
    }
  });
  if (overlay) overlay.addEventListener("click", cerrarMenu);
  sidebar.querySelectorAll(".nav-item").forEach(item => item.addEventListener("click", () => { if (window.innerWidth <= 1100) cerrarMenu(); }));
  window.addEventListener("resize", () => { if (window.innerWidth > 1100) cerrarMenu(); });
}

function inicializarArrastreMenu() {
  const sidebar = document.getElementById("sidebar");
  const handle = document.getElementById("sidebarDragHandle");
  const overlay = document.getElementById("menuOverlay");
  if (!sidebar || !handle) return;

  let startX = 0, currentX = 0, dragging = false;
  const umbralCierre = 80;

  const onStart = e => {
    if (window.innerWidth > 1100) return;
    dragging = true; startX = (e.touches ? e.touches[0].clientX : e.clientX);
    currentX = startX; sidebar.style.transition = "none";
  };
  const onMove = e => {
    if (!dragging) return;
    currentX = (e.touches ? e.touches[0].clientX : e.clientX);
    const delta = currentX - startX;
    if (delta < 0) return;
    sidebar.style.transform = `translateX(${delta}px)`;
    if (overlay) overlay.style.opacity = Math.max(0, 0.5 - (delta / 300) * 0.5);
    if (e.cancelable) e.preventDefault();
  };
  const onEnd = () => {
    if (!dragging) return; dragging = false;
    const delta = currentX - startX;
    sidebar.style.transition = ""; sidebar.style.transform = ""; if (overlay) overlay.style.opacity = "";
    if (delta > umbralCierre) {
      sidebar.classList.remove("open"); if (overlay) overlay.classList.remove("show");
      document.body.classList.remove("menu-open"); document.body.style.overflow = "";
    }
  };

  handle.addEventListener("touchstart", onStart, { passive: true });
  handle.addEventListener("touchmove", onMove, { passive: false });
  handle.addEventListener("touchend", onEnd);
  handle.addEventListener("touchcancel", onEnd);
  handle.addEventListener("mousedown", onStart);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onEnd);
}

/* ============================================================
   ALMACENAMIENTO DE SUPABASE Y CLOUDFLARE R2
   ============================================================ */
const LIMITES = {
  db: 500 * 1024 * 1024,
  storage: 1024 * 1024 * 1024
};

// Cloudflare R2: 10 GB gratis al mes (plan gratuito)
LIMITES.r2 = 10 * 1024 * 1024 * 1024;

// ⚠️ URL de tu Worker de Cloudflare recién desplegado
const WORKER_URL = "https://rovant-apk.nojavid-finix.workers.dev";

async function cargarR2Config() {
  return WORKER_URL;
}

async function consultarR2() {
  const u = obtenerUsuarioLogueado();
  if (!u || !u.id) throw new Error("No hay sesión activa.");
  const base = await cargarR2Config();
  
  // Hacemos la petición al endpoint /usage enviando el ID del usuario
  const r = await fetch(base + "/usage", { headers: { "X-User-Id": u.id } });
  
  if (!r.ok) throw new Error(r.status === 404
    ? "El Worker de Cloudflare aún no tiene /usage: vuelve a desplegarlo (wrangler deploy)."
    : "El Worker respondió " + r.status + ".");
  return r.json();
}

function formatearBytes(b) {
  b = Number(b) || 0;
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return b.toFixed(i === 0 ? 0 : 2) + " " + u[i];
}

function tarjetaUso(titulo, usado, limite, detalle) {
  const pct = Math.min(100, (usado / limite) * 100);
  const libre = Math.max(0, limite - usado);
  const nivel = pct >= 90 ? "alto" : pct >= 70 ? "medio" : "bajo";
  return `<div class="sem-card alm-card">
      <div class="alm-head">
        <span class="alm-titulo">${escapeHtml(titulo)}</span>
        <span class="alm-pct ${nivel}">${pct.toFixed(1)}% usado</span>
      </div>
      <div class="alm-barra"><div class="alm-barra-fill ${nivel}" style="width:${pct}%"></div></div>
      <div class="alm-cifras">
        <div><b>${formatearBytes(libre)}</b><span>disponibles</span></div>
        <div><b>${formatearBytes(usado)}</b><span>usados</span></div>
        <div><b>${formatearBytes(limite)}</b><span>límite del plan</span></div>
      </div>
      ${detalle || ""}
    </div>`;
}

async function cargarAlmacenamiento() {
  const lista = document.getElementById("almLista");
  const status = document.getElementById("almStatus");
  status.textContent = "";
  const { data, error } = await supabaseClient.rpc("uso_almacenamiento");
  if (error || !data) {
    lista.innerHTML = `<div class="org-empty">No se pudo consultar el almacenamiento. Ejecuta almacenamiento.sql en el SQL Editor de Supabase.</div>`;
    status.textContent = error ? error.message : "";
    return;
  }
  const buckets = Array.isArray(data.buckets) ? data.buckets : [];
  const detalleBuckets = buckets.length
    ? `<ul class="alm-buckets">${buckets.map(b =>
        `<li><span>${escapeHtml(b.nombre)}</span><span>${b.archivos} archivo(s) · ${formatearBytes(b.bytes)}</span></li>`).join("")}</ul>`
    : "";
  const usadoTotal = Number(data.db_bytes) + Number(data.storage_bytes);
  lista.innerHTML =
    tarjetaUso("Almacenamiento general", usadoTotal, LIMITES.db + LIMITES.storage).replace("alm-card", "alm-card alm-general") +
    tarjetaUso("Base de datos", Number(data.db_bytes), LIMITES.db) +
    tarjetaUso("Archivos (Storage)", Number(data.storage_bytes), LIMITES.storage, detalleBuckets);
  document.getElementById("almNota").textContent =
    "Los APK nuevos se guardan en Cloudflare R2 y no cuentan en el Storage de Supabase. Consultado: " + new Date().toLocaleString("es-CO");
  cargarR2();
}

async function cargarR2() {
  const cont = document.getElementById("r2Lista");
  cont.innerHTML = `<div class="org-loading">Consultando Cloudflare R2...</div>`;
  try {
    const d = await consultarR2();
    cont.innerHTML = tarjetaUso("Bucket rovant-apk", Number(d.bytes), LIMITES.r2,
      `<ul class="alm-buckets"><li><span>APK guardados</span><span>${d.archivos} archivo(s) · ${formatearBytes(d.bytes)}</span></li></ul>`)
      .replace("alm-card", "alm-card alm-general");
    document.getElementById("r2Nota").textContent = "Límite de 10 GB del plan gratuito de R2. Consultado: " + new Date().toLocaleString("es-CO");
  } catch (e) {
    cont.innerHTML = `<div class="org-empty">${escapeHtml(e.message)}</div>`;
    document.getElementById("r2Nota").textContent = "";
  }
}

/* ============================================================
   MIGRAR APKs DE SUPABASE STORAGE A CLOUDFLARE R2
   Por cada versión con file_path antiguo (sin "r2/"): descarga -> sube al Worker ->
   verifica el tamaño en R2 -> actualiza apk_versions -> recién ahí borra de Supabase.
   Si algo falla, ese APK queda intacto en Supabase.
   ============================================================ */
async function tamanoEnR2(nombre) {
  const ctl = new AbortController();
  const r = await fetch(`${R2_WORKER_URL}/apk/${encodeURIComponent(nombre)}`, { signal: ctl.signal });
  const n = r.ok ? Number(r.headers.get("Content-Length")) : -1;
  ctl.abort();
  return n;
}

async function migrarApksAR2() {
  const btn = document.getElementById("btnMigrar");
  const out = document.getElementById("migLog");
  const log = t => { out.textContent += t + "\n"; };
  const u = obtenerUsuarioLogueado();
  if (!u || !u.id) return alert("No hay sesión activa.");

  const { data: filas, error } = await supabaseClient.from("apk_versions").select("id, file_name, file_path, file_size");
  if (error) return alert("No se pudo leer apk_versions: " + error.message);
  const pend = (filas || []).filter(v => v.file_path && !v.file_path.startsWith("r2/"));
  if (!pend.length) { out.textContent = "No hay APKs en Supabase: todo ya está en R2."; return; }
  if (!confirm(`Se moverán ${pend.length} APK de Supabase a Cloudflare R2 y se BORRARÁN de Supabase una vez verificados. ¿Continuar?`)) return;

  btn.disabled = true; out.textContent = "";
  await cargarR2Config();
  let ok = 0, fallos = 0;
  for (const v of pend) {
    const etiqueta = v.file_name || v.file_path;
    try {
      log(`→ ${etiqueta}: descargando...`);
      const { data: blob, error: eDesc } = await supabaseClient.storage.from("apks").download(v.file_path);
      if (eDesc || !blob) throw new Error(eDesc ? eDesc.message : "no se pudo descargar");
      if (blob.size > 100 * 1024 * 1024) throw new Error("supera 100 MB (límite del Worker)");

      const base = v.file_path.split("/").pop().replace(/[^A-Za-z0-9._-]/g, "_");
      const nombre = base.toLowerCase().endsWith(".apk") ? base : base + ".apk";
      log(`   subiendo a R2 como ${nombre}...`);
      const resp = await fetch(`${R2_WORKER_URL}/apk/${encodeURIComponent(nombre)}`, {
        method: "PUT",
        headers: { "X-User-Id": String(u.id), "Content-Type": "application/vnd.android.package-archive" },
        body: blob
      });
      if (!resp.ok && resp.status !== 409) {
        let m = "HTTP " + resp.status;
        try { m = (await resp.json()).error || m; } catch (e) { /* ignorar */ }
        throw new Error(m);
      }
      if (await tamanoEnR2(nombre) !== blob.size) throw new Error("el tamaño en R2 no coincide, no se borra el original");

      const { error: eUp } = await supabaseClient.from("apk_versions").update({ file_path: "r2/" + nombre }).eq("id", v.id);
      if (eUp) throw new Error("no se pudo actualizar el registro: " + eUp.message);

      const { error: eDel } = await supabaseClient.storage.from("apks").remove([v.file_path]);
      if (eDel) log(`   ⚠ copiado, pero no se pudo borrar de Supabase: ${eDel.message}`);
      log(`✔ ${etiqueta} migrado`);
      ok++;
    } catch (e) {
      log(`✖ ${etiqueta}: ${e.message}`);
      fallos++;
    }
  }
  log(`\nListo: ${ok} migrado(s), ${fallos} con error.`);
  btn.disabled = false;
  cargarAlmacenamiento();
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  inicializarCerrarSesion();
  inicializarMenuMovil();
  inicializarArrastreMenu();
  document.getElementById("btnActualizar").addEventListener("click", cargarAlmacenamiento);
  document.getElementById("btnMigrar").addEventListener("click", migrarApksAR2);
  cargarHeaderUsuario();
  await cargarAlmacenamiento();
});