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
   USUARIOS (tabla registro_usuarios_app) EN ÁRBOL POR JERARQUÍA
   La jerarquía vive en la columna "jerarquia": novato | privilegio | crack
   - novato: cuenta nueva; todo lo que reporta pasa por validación.
   - privilegio: sus reportes (p. ej. tiempos de un semáforo) no se validan.
   - crack: igual que privilegio, más la insignia de verificado por Rovant.
   ============================================================ */
const TABLA = "registro_usuarios_app";
const COLUMNAS = "id, nombre_completo, correo_electronico, jerarquia";
const NIVEL_INICIAL = "novato";
const NIVELES = [
  { id: "crack", nombre: "Crack", detalle: "Miembro fiel" },
  { id: "privilegio", nombre: "Privilegio", detalle: "Sin validación" },
  { id: "novato", nombre: "Novato", detalle: "En pruebas" }
];
const ICONO_INSIGNIA = `<svg class="usr-insignia" viewBox="0 0 24 24" fill="currentColor" aria-label="Verificado por Rovant"><title>Verificado por el equipo Rovant</title><path d="M12 2l2.4 1.8 3-.2 1 2.8 2.5 1.7-.8 2.9.8 2.9-2.5 1.7-1 2.8-3-.2L12 22l-2.4-1.8-3 .2-1-2.8-2.5-1.7.8-2.9-.8-2.9 2.5-1.7 1-2.8 3 .2z"/><path d="M8.5 12.2l2.3 2.3 4.7-4.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
let usuarios = [];

function nombreDe(u) { return u.nombre_completo || ""; }
function correoDe(u) { return u.correo_electronico || ""; }
function nivelDe(u) { return NIVELES.some(n => n.id === u.jerarquia) ? u.jerarquia : NIVEL_INICIAL; }

function nodoHTML(u) {
  const nivel = nivelDe(u);
  const opciones = NIVELES.map(n =>
    `<option value="${n.id}" ${nivel === n.id ? "selected" : ""}>${n.nombre} · ${n.detalle}</option>`).join("");
  return `<div class="arb-nodo nivel-${nivel}">
      <div class="usr-item">
        <span class="usr-avatar">${escapeHtml(iniciales(nombreDe(u)))}</span>
        <div class="usr-datos">
          <span class="usr-nombre">${escapeHtml(nombreDe(u) || "Sin nombre")}${nivel === "crack" ? ICONO_INSIGNIA : ""}</span>
          <span class="usr-correo">${escapeHtml(correoDe(u) || "Sin correo")}</span>
          <select class="usr-jerarquia" data-id="${escapeHtml(u.id)}" title="Cambiar jerarquía">
            ${opciones}
          </select>
        </div>
      </div>
    </div>`;
}

function iniciales(nombre) {
  return (nombre || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

function renderUsuarios() {
  const q = normalizar(document.getElementById("buscador").value);
  const lista = usuarios
    .filter(u => !q || normalizar(`${nombreDe(u)} ${correoDe(u)}`).includes(q))
    .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), "es"));
  document.getElementById("usrTotal").textContent = `${lista.length} de ${usuarios.length} usuario${usuarios.length === 1 ? "" : "s"}`;
  const cont = document.getElementById("usrList");
  if (!lista.length) { cont.innerHTML = `<div class="org-empty">Sin resultados.</div>`; return; }

  const niveles = NIVELES
    .map(n => ({ ...n, gente: lista.filter(u => nivelDe(u) === n.id) }))
    .filter(n => n.gente.length);
  cont.innerHTML = `<div class="arbol">` + niveles.map((n, i) => `
      ${i ? `<div class="arb-tallo"></div>` : ""}
      <div class="arb-nivel">
        <span class="arb-etiqueta">${n.nombre} · ${n.detalle} · ${n.gente.length}</span>
        <div class="arb-fila">${n.gente.map(nodoHTML).join("")}</div>
      </div>`).join("") + `</div>`;
}

async function cambiarJerarquia(id, valor, select) {
  const u = usuarios.find(x => String(x.id) === String(id));
  if (!u) return;
  select.disabled = true;
  const { data, error } = await supabaseClient.from(TABLA).update({ jerarquia: valor }).eq("id", u.id).select(COLUMNAS);
  select.disabled = false;
  if (error || !data || !data.length) {
    console.error("Error al guardar jerarquía:", error);
    alert("No se pudo guardar la jerarquía. Ejecuta Usuarios/permisos.sql en el SQL Editor de Supabase.");
    renderUsuarios();
    return;
  }
  u.jerarquia = data[0].jerarquia;
  renderUsuarios();
}

async function cargarUsuarios() {
  const cont = document.getElementById("usrList");
  try {
    let { data, error } = await supabaseClient.from(TABLA).select(COLUMNAS);
    if (error && /jerarquia/i.test(error.message || "")) {
      // La columna aún no existe: todos salen como novatos.
      ({ data, error } = await supabaseClient.from(TABLA).select("id, nombre_completo, correo_electronico"));
    }
    if (error) throw error;
    usuarios = data || [];
    renderUsuarios();
  } catch (err) {
    console.error("Error al cargar usuarios:", err);
    cont.innerHTML = `<div class="org-empty" style="color:#D32F2F">${escapeHtml((err && err.message) || "Error al cargar los usuarios")}</div>`;
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
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  inicializarCerrarSesion();
  inicializarMenuMovil();
  inicializarArrastreMenu();
  document.getElementById("buscador").addEventListener("input", renderUsuarios);
  document.getElementById("usrList").addEventListener("change", e => {
    const sel = e.target.closest(".usr-jerarquia");
    if (sel) cambiarJerarquia(sel.dataset.id, sel.value, sel);
  });
  cargarHeaderUsuario();
  await cargarUsuarios();
});
