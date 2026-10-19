/* ============================================================
   VARIABLES GLOBALES
   ============================================================ */
let usuarioActual = null;
let usuariosEquipo = [];
let configuracionUsuario = null;
let departamentoSeleccionado = "";

/* ============================================================
   AVATARES
   ============================================================ */
function obtenerAvatar(index) {
  const avatares = [
    "../../Iconos/Avatar/avatar1.png",
    "../../Iconos/Avatar/avatar2.png",
    "../../Iconos/Avatar/avatar3.png",
    "../../Iconos/Avatar/avatar4.png"
  ];
  return avatares[index % avatares.length];
}

function obtenerAvatarUsuario(index = 0) {
  if (configuracionUsuario && configuracionUsuario.avatar_url) {
    const file = configuracionUsuario.avatar_url;
    if (file.startsWith('../') || file.startsWith('http')) return file;
    return '../../Iconos/Avatar/' + file;
  }
  try {
    const sesionRaw = sessionStorage.getItem('rovant_user');
    if (sesionRaw) {
      const s = JSON.parse(sesionRaw);
      if (s.avatar_file) return '../../Iconos/Avatar/' + s.avatar_file;
      if (s.avatar_url && (s.avatar_url.startsWith('../') || s.avatar_url.startsWith('http'))) return s.avatar_url;
    }
  } catch (e) { /* ignorar */ }
  return obtenerAvatar(index);
}

/* ============================================================
   NAVEGACIÓN SIDEBAR / CERRAR SESIÓN
   ============================================================ */
function inicializarNavegacion() {
  document.querySelectorAll(".nav-item").forEach(item => {
    if (item.id === "btnCerrarSesion") return;
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
      item.classList.add("active");
    });
  });
}

function inicializarCerrarSesion() {
  const btnCerrar = document.getElementById("btnCerrarSesion");
  if (!btnCerrar) return;
  btnCerrar.addEventListener("click", (e) => {
    e.preventDefault();
    sessionStorage.clear();
    localStorage.clear();
    window.location.href = "../../index.html";
  });
}

/* ============================================================
   USUARIO DEL HEADER
   ============================================================ */
function renderUsuarioActual(u, index = 0) {
  if (!u) return;
  const headerName = document.getElementById("headerUserName");
  const headerRole = document.getElementById("headerUserRole");
  const headerAvatar = document.getElementById("headerAvatar");
  if (headerName) headerName.textContent = u.nombre || "Usuario";
  if (headerRole) headerRole.textContent = u.cargo || "Sin cargo";
  if (headerAvatar) headerAvatar.src = obtenerAvatarUsuario(index);
}

function obtenerUsuarioLogueado() {
  try {
    const raw = sessionStorage.getItem("rovant_user") || localStorage.getItem("rovant_user");
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn("⚠️ Error al parsear usuario:", e); }
  const nombreAlt = sessionStorage.getItem("nombreUsuario") || localStorage.getItem("nombreUsuario");
  if (nombreAlt) return { nombre: nombreAlt };
  return null;
}

async function cargarConfiguracionUsuario(userId) {
  if (!userId || typeof supabaseClient === "undefined") return null;
  try {
    const { data, error } = await supabaseClient.from("configuracion_usuario").select("*").eq("user_id", userId).maybeSingle();
    if (error) return null;
    return data;
  } catch (e) { return null; }
}

/* ============================================================
   CLASIFICACIÓN DE INTEGRANTES
   El rol y el departamento se derivan del campo "cargo"
   (p. ej. "Jefe de Desarrollo", "Subjefe de Operaciones").
   Si la tabla tiene columnas "departamento" o "rol", se usan.
   ============================================================ */
function normalizar(t) {
  return (t || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function obtenerRol(u) {
  const rol = normalizar(u.rol);
  if (rol.includes("subjefe")) return "subjefe";
  if (rol.includes("jefe") || rol.includes("director")) return "jefe";
  if (rol.includes("empleado")) return "empleado";

  const c = normalizar(u.cargo);
  if (/sub\s*-?\s*jefe|subdirector|coordinador/.test(c)) return "subjefe";
  if (/jefe|director|gerente|ceo|lider/.test(c)) return "jefe";
  return "empleado";
}

function esDireccionGeneral(u) {
  return /director general|gerente general|ceo|presidente/.test(normalizar(u.cargo));
}

function obtenerDepartamento(u) {
  if (u.departamento) return u.departamento;
  const m = (u.cargo || "").match(/\bde\s+(.+)$/i);
  return m ? m[1].trim() : "General";
}

/* ============================================================
   CARGA DE DATOS (SUPABASE)
   ============================================================ */
async function cargarDatosDesdeSupabase() {
  const chart = document.getElementById("orgChart");
  try {
    if (typeof supabaseClient === "undefined") throw new Error("Supabase no disponible");

    const usuarioLogueado = obtenerUsuarioLogueado();
    if (usuarioLogueado && usuarioLogueado.id) {
      configuracionUsuario = await cargarConfiguracionUsuario(usuarioLogueado.id);
    }

    const { data: usuarios, error } = await supabaseClient.from("usuarios_rovant").select("*");
    if (error) throw error;

    usuariosEquipo = usuarios || [];

    if (usuarioLogueado) {
      usuarioActual =
        (usuarioLogueado.id && usuariosEquipo.find(u => String(u.id) === String(usuarioLogueado.id))) ||
        (usuarioLogueado.usuario && usuariosEquipo.find(u => u.usuario === usuarioLogueado.usuario)) ||
        (usuarioLogueado.nombre && usuariosEquipo.find(u => u.nombre === usuarioLogueado.nombre)) ||
        null;
    }
    if (!usuarioActual && usuariosEquipo.length) usuarioActual = usuariosEquipo[0];
    if (usuarioActual) renderUsuarioActual(usuarioActual, usuariosEquipo.indexOf(usuarioActual));

    renderTodo();
  } catch (err) {
    console.error("Error al cargar equipo:", err);
    if (chart) chart.innerHTML = `<div class="org-empty" style="color:#D32F2F">Error al cargar el equipo.</div>`;
  }
}

/* ============================================================
   RENDER
   ============================================================ */
function escapeHtml(t) {
  return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const ICONO_CORONA = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7l5 5 5-8 5 8 5-5-2 12H4z"/></svg>`;
const ICONO_USUARIO = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
const ICONO_GRUPO = `<svg class="d-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
const ICONO_FLECHA = `<svg class="d-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>`;

function nodoHTML(u) {
  const rol = u._rol;
  const avatar = obtenerAvatar(usuariosEquipo.indexOf(u));
  const etiqueta = rol === "jefe" ? "Jefe" : rol === "subjefe" ? "Subjefe" : "Empleado";
  const icono = rol === "jefe" ? ICONO_CORONA : rol === "subjefe" ? ICONO_USUARIO : "";

  if (rol === "empleado") {
    return `
      <div class="org-node rol-empleado">
        <img class="node-avatar" src="${avatar}" alt="">
        <div class="node-info">
          <span class="node-cargo">${escapeHtml(u.nombre)}</span>
          <span class="role-badge">${etiqueta}</span>
        </div>
      </div>`;
  }
  return `
    <div class="org-node rol-${rol}">
      <img class="node-avatar" src="${avatar}" alt="">
      <div class="node-info">
        <span class="node-cargo">${escapeHtml(u.cargo || etiqueta)}</span>
        <span class="node-name">${escapeHtml(u.nombre)}</span>
        <span class="role-badge">${icono}${etiqueta}</span>
      </div>
    </div>`;
}

function renderTodo() {
  usuariosEquipo.forEach(u => { u._rol = obtenerRol(u); u._dep = obtenerDepartamento(u); });
  renderResumen();
  renderDepartamentos();
  renderOrganigrama();
}

function renderResumen() {
  const cuenta = r => usuariosEquipo.filter(u => u._rol === r).length;
  document.getElementById("totalIntegrantes").textContent = usuariosEquipo.length;
  document.getElementById("countJefes").textContent = cuenta("jefe");
  document.getElementById("countSubjefes").textContent = cuenta("subjefe");
  document.getElementById("countEmpleados").textContent = cuenta("empleado");
}

function listaDepartamentos() {
  const mapa = new Map();
  usuariosEquipo.forEach(u => {
    if (esDireccionGeneral(u)) return;
    mapa.set(u._dep, (mapa.get(u._dep) || 0) + 1);
  });
  return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
}

function renderDepartamentos() {
  const deps = listaDepartamentos();
  const lista = document.getElementById("deptList");
  const select = document.getElementById("filtroDepartamento");

  lista.innerHTML = deps.length
    ? deps.map(([nombre, n]) => `
        <button class="dept-item ${nombre === departamentoSeleccionado ? "selected" : ""}" data-dep="${escapeHtml(nombre)}">
          ${ICONO_GRUPO}
          <span class="d-text"><span class="d-name">${escapeHtml(nombre)}</span><span class="d-count">${n} integrante${n === 1 ? "" : "s"}</span></span>
          ${ICONO_FLECHA}
        </button>`).join("")
    : `<div class="org-empty">Sin departamentos</div>`;

  select.innerHTML = `<option value="">Todos los departamentos</option>` +
    deps.map(([nombre]) => `<option value="${escapeHtml(nombre)}" ${nombre === departamentoSeleccionado ? "selected" : ""}>${escapeHtml(nombre)}</option>`).join("");
}

function renderOrganigrama() {
  const chart = document.getElementById("orgChart");
  if (!usuariosEquipo.length) {
    chart.innerHTML = `<div class="org-empty">No hay integrantes registrados.</div>`;
    return;
  }

  const direccion = usuariosEquipo.filter(esDireccionGeneral);
  const resto = usuariosEquipo.filter(u => !esDireccionGeneral(u) && (!departamentoSeleccionado || u._dep === departamentoSeleccionado));

  const deps = new Map();
  resto.forEach(u => {
    if (!deps.has(u._dep)) deps.set(u._dep, { jefe: [], subjefe: [], empleado: [] });
    deps.get(u._dep)[u._rol].push(u);
  });

  const fila = arr => `<div class="org-branches">${arr.map(u => `<div class="org-branch">${nodoHTML(u)}</div>`).join("")}</div>`;

  const ramas = [...deps.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([, g]) => {
    const niveles = [g.jefe, g.subjefe, g.empleado].filter(n => n.length).map(fila);
    return `<div class="org-branch">${niveles.join('<div class="org-stem"></div>')}</div>`;
  });

  let html = "";
  if (direccion.length) {
    html += fila(direccion);
    if (ramas.length) html += `<div class="org-stem"></div>`;
  }
  if (ramas.length) html += `<div class="org-branches">${ramas.join("")}</div>`;

  chart.innerHTML = html || `<div class="org-empty">No hay integrantes en este departamento.</div>`;
}

function seleccionarDepartamento(nombre) {
  departamentoSeleccionado = nombre === departamentoSeleccionado ? "" : nombre;
  renderDepartamentos();
  renderOrganigrama();
}

function inicializarFiltros() {
  document.getElementById("filtroDepartamento").addEventListener("change", e => {
    departamentoSeleccionado = e.target.value;
    renderDepartamentos();
    renderOrganigrama();
  });
  document.getElementById("deptList").addEventListener("click", e => {
    const btn = e.target.closest(".dept-item");
    if (btn) seleccionarDepartamento(btn.dataset.dep);
  });
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

  if (userInfo) userInfo.addEventListener("click", (e) => {
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

  const onStart = (e) => {
    if (window.innerWidth > 1100) return;
    dragging = true; startX = (e.touches ? e.touches[0].clientX : e.clientX);
    currentX = startX; sidebar.style.transition = "none";
  };

  const onMove = (e) => {
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
  inicializarNavegacion();
  inicializarCerrarSesion();
  inicializarMenuMovil();
  inicializarArrastreMenu();
  inicializarFiltros();
  await cargarDatosDesdeSupabase();
});
