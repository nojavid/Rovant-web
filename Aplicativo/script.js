/* ============================================================
   VARIABLES GLOBALES
   ============================================================ */
let usuarioActual = null;
let usuariosEquipo = [];
let tareas = [];
let configuracionUsuario = null;
let tabActiva = "grupo";
const avataresEquipo = {};   // user_id -> archivo/URL de avatar

/* ============================================================
   AVATAR POR DEFECTO (rotativo)
   ============================================================ */
function obtenerAvatar(index) {
  const avatares = [
    "../Iconos/Avatar/avatar1.png",
    "../Iconos/Avatar/avatar2.png",
    "../Iconos/Avatar/avatar3.png",
    "../Iconos/Avatar/avatar4.png"
  ];
  return avatares[index % avatares.length];
}

function avatarDeUsuario(userId, index = 0) {
  const f = avataresEquipo[userId];
  if (!f) return obtenerAvatar(index);
  return (f.startsWith('../') || f.startsWith('http')) ? f : '../Iconos/Avatar/' + f;
}

/* ============================================================
   OBTENER RUTA DEL AVATAR GUARDADO
   ============================================================ */
function obtenerAvatarUsuario(index = 0) {
  if (configuracionUsuario && configuracionUsuario.avatar_url) {
    const file = configuracionUsuario.avatar_url;
    if (file.startsWith('../') || file.startsWith('http')) return file;
    return '../Iconos/Avatar/' + file;
  }
  try {
    const sesionRaw = sessionStorage.getItem('rovant_user');
    if (sesionRaw) {
      const s = JSON.parse(sesionRaw);
      if (s.avatar_file) return '../Iconos/Avatar/' + s.avatar_file;
      if (s.avatar_url && (s.avatar_url.startsWith('../') || s.avatar_url.startsWith('http'))) return s.avatar_url;
    }
  } catch (e) { /* ignorar */ }
  return obtenerAvatar(index);
}

/* ============================================================
   CARGAR Y MOSTRAR APKS CON BOTÓN DE SELECCIÓN
   ============================================================ */
async function cargarApksDisponibles() {
  const contenedor = document.getElementById('listaApks');
  if (!contenedor || typeof supabaseClient === "undefined") return;

  try {
    const { data: apks, error } = await supabaseClient
      .from('apk_versions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!apks || apks.length === 0) {
      contenedor.innerHTML = `
        <div class="empty-state">
          <div class="empty-circle">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 4h6l4 4v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
              <path d="M14 4v4h4" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            </svg>
          </div>
          <p class="empty-text">No hay APKs subidos aún</p>
        </div>
      `;
      return;
    }

    contenedor.innerHTML = apks.map(apk => {
      const fecha = new Date(apk.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      const sizeMB = apk.file_size ? (apk.file_size / (1024 * 1024)).toFixed(1) + ' MB' : 'N/A';
      const esActivo = apk.is_active; 

      // Si está activo, mostramos un botón verde. Si no, uno azul.
      const btnClass = esActivo ? 'btn-selected' : 'btn-select';
      const btnText = esActivo ? 'Seleccionado ✓' : 'Seleccionar';

      return `
        <div class="apk-item ${esActivo ? 'apk-active' : ''}">
          <div class="apk-info">
            <span class="apk-version">${apk.version}</span>
            <span class="apk-meta">${sizeMB} • ${fecha}</span>
          </div>
          <button class="${btnClass}" onclick="seleccionarApk(${apk.id})" ${esActivo ? 'disabled' : ''}>
            ${esActivo ? '<svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 12.5 10 17.5 19 7.5"></polyline></svg><span class="btn-selected-text">Seleccionado</span>' : 'Seleccionar'}
          </button>
        </div>
      `;
    }).join('');

  } catch (error) {
    console.error("Error al cargar APKs:", error);
    contenedor.innerHTML = `<p style="text-align:center; color:#D32F2F; padding:20px;">Error al cargar los APKs.</p>`;
  }
}

/* ============================================================
   SELECCIONAR APK PARA DESCARGA
   ============================================================ */
async function seleccionarApk(idSeleccionado) {
  try {
    // 1. Quitar la selección a TODOS los apks
    await supabaseClient
      .from('apk_versions')
      .update({ is_active: false })
      .neq('id', 0); // Afecta a todos

    // 2. Poner el seleccionado como activo
    await supabaseClient
      .from('apk_versions')
      .update({ is_active: true })
      .eq('id', idSeleccionado);

    // 3. Mostrar el modal de éxito
    const overlay = document.getElementById('modalOverlay');
    if (overlay) overlay.classList.add('show');

    // 4. Recargar la lista para pintar el botón verde
    await cargarApksDisponibles();

  } catch (error) {
    console.error("Error al seleccionar APK:", error);
    alert("Hubo un error al seleccionar el APK.");
  }
}

// Cerrar el modal
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const overlay = document.getElementById('modalOverlay');
      if (overlay) overlay.classList.remove('show');
    });
  }
});

/* ============================================================
   RENDER DE TAREAS
   ============================================================ */
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const ESTADOS_TAREA = {
  iniciar:   { texto: "Por iniciar", badge: "badge-pending" },
  proceso:   { texto: "En proceso",  badge: "badge-progress" },
  revision:  { texto: "En revisión", badge: "badge-review" },
  terminada: { texto: "Terminada",   badge: "badge-done" }
};

async function cargarTareasDesdeSupabase() {
  const { data, error } = await supabaseClient
    .from("tareas_rovant")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("No se pudieron cargar las tareas:", error.message);
    tareas = [];
    return;
  }

  tareas = (data || []).map(r => {
    const asignados = (r.asignados || []).map(String);
    const idx = usuariosEquipo.findIndex(u => String(u.id) === asignados[0]);
    const persona = idx >= 0 ? usuariosEquipo[idx] : null;
    const est = ESTADOS_TAREA[r.estado] || ESTADOS_TAREA.iniciar;
    const esYo = persona && usuarioActual && String(persona.id) === String(usuarioActual.id);
    return {
      nombre: r.titulo,
      estado: est.texto,
      badge: est.badge,
      completa: r.estado === "terminada",
      asignados,
      fecha: r.fecha
        ? new Date(r.fecha + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
        : "Sin fecha",
      persona: persona ? persona.nombre + (asignados.length > 1 ? ` +${asignados.length - 1}` : "") : "Sin asignar",
      avatar: persona ? (esYo ? obtenerAvatarUsuario(idx) : avatarDeUsuario(persona.id, idx)) : obtenerAvatar(0)
    };
  });
}

function renderTareas() {
  const contenedor = document.getElementById("taskList");
  if (!contenedor) return;

  let filtradas = tareas;

  if (tabActiva === "completas") {
    filtradas = tareas.filter(t => t.completa);
  } else if (tabActiva === "mis") {
    const yo = usuarioActual ? String(usuarioActual.id) : null;
    filtradas = tareas.filter(t => yo && t.asignados.includes(yo));
  }

  if (filtradas.length === 0) {
    contenedor.innerHTML = `
      <div class="empty-state empty-state-tasks">
        <div class="empty-circle">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
            <line x1="4" y1="9" x2="20" y2="9" stroke="currentColor" stroke-width="1.6"/>
            <line x1="4" y1="14" x2="20" y2="14" stroke="currentColor" stroke-width="1.6"/>
            <line x1="10" y1="4" x2="10" y2="20" stroke="currentColor" stroke-width="1.6"/>
            <polyline points="12.5 16.5 14 18 17 14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          </svg>
        </div>
        <p class="empty-text">No hay tareas</p>
      </div>
    `;
    return;
  }

  contenedor.innerHTML = filtradas.map(t => `
    <div class="task-item">
      <div class="task-name-row">
        <span class="task-name">${escHtml(t.nombre)}</span>
        <span class="task-badge ${t.badge}">${t.estado}</span>
      </div>
      <div class="task-meta">
        <img src="../Iconos/calendario.png" alt="Fecha">
        <span class="meta-text">${t.fecha}</span>
        <img src="${t.avatar}" alt="${escHtml(t.persona)}" class="meta-avatar">
        <span class="meta-text">${escHtml(t.persona)}</span>
      </div>
    </div>
  `).join("");
}

/* ============================================================
   TABS DE TAREAS
   ============================================================ */
function inicializarTabs() {
  document.querySelectorAll(".task-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".task-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      tabActiva = btn.dataset.tab;
      renderTareas();
    });
  });
}

/* ============================================================
   NAVEGACIÓN SIDEBAR
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

/* ============================================================
   CERRAR SESIÓN
   ============================================================ */
function inicializarCerrarSesion() {
  const btnCerrar = document.getElementById("btnCerrarSesion");
  if (!btnCerrar) return;

  btnCerrar.addEventListener("click", (e) => {
    e.preventDefault();
    sessionStorage.removeItem("rovant_user");
    sessionStorage.removeItem("nombreUsuario");
    sessionStorage.removeItem("usuario");

    localStorage.removeItem("rovant_user");
    localStorage.removeItem("rovant_userId");
    localStorage.removeItem("rovant_userUsuario");
    localStorage.removeItem("nombreUsuario");
    localStorage.removeItem("usuario");

    window.location.href = "../index.html";
  });
}

/* ============================================================
   RENDER USUARIO ACTUAL EN EL HEADER Y BIENVENIDA
   ============================================================ */
function renderUsuarioActual(u, index = 0) {
  if (!u) return;

  const nombre = u.nombre || "Usuario";
  const cargo = u.cargo || "Sin cargo";
  const avatar = obtenerAvatarUsuario(index);

  const headerName = document.getElementById("headerUserName");
  const headerRole = document.getElementById("headerUserRole");
  const headerAvatar = document.getElementById("headerAvatar");
  const welcomeName = document.getElementById("welcomeUserName");

  if (headerName) headerName.textContent = nombre;
  if (headerRole) headerRole.textContent = cargo;
  if (headerAvatar) headerAvatar.src = avatar;
  if (welcomeName) welcomeName.textContent = nombre;
}

/* ============================================================
   RENDER LISTA DE MIEMBROS DEL EQUIPO
   ============================================================ */
function renderEquipo(lista) {
  const contenedor = document.querySelector(".team-list");
  if (!contenedor) return;

  if (!lista || lista.length === 0) {
    contenedor.innerHTML = '<div style="text-align:center;color:#999;font-size:12px;padding:20px 0;">Sin miembros</div>';
    return;
  }

  contenedor.innerHTML = lista.map((u, i) => {
    const nombre = u.nombre || "Usuario";
    const cargo = u.cargo || "Sin cargo";
    const esYo = usuarioActual && String(u.id) === String(usuarioActual.id);
    const avatar = esYo ? obtenerAvatarUsuario(i) : avatarDeUsuario(u.id, i);

    return `
      <div class="team-member">
        <img src="${avatar}" alt="${nombre}" class="tm-avatar">
        <div class="tm-info">
          <span class="tm-name">${nombre}</span>
          <span class="tm-role">${cargo}</span>
        </div>
      </div>
    `;
  }).join("");
}

/* ============================================================
   OBTENER USUARIO LOGUEADO
   ============================================================ */
function obtenerUsuarioLogueado() {
  try {
    const rovantUserStr = sessionStorage.getItem("rovant_user");
    if (rovantUserStr) return JSON.parse(rovantUserStr);
  } catch (e) { console.warn("⚠️ Error al parsear rovant_user:", e); }

  try {
    const rovantUserStrLS = localStorage.getItem("rovant_user");
    if (rovantUserStrLS) return JSON.parse(rovantUserStrLS);
  } catch (e) { console.warn("⚠️ Error al parsear rovant_user de localStorage:", e); }

  const nombreAlternativo = sessionStorage.getItem("nombreUsuario") || localStorage.getItem("nombreUsuario");
  if (nombreAlternativo) return { nombre: nombreAlternativo };
  return null;
}

/* ============================================================
   CARGAR CONFIGURACIÓN DEL USUARIO (avatar guardado)
   ============================================================ */
async function cargarConfiguracionUsuario(userId) {
  if (!userId || typeof supabaseClient === "undefined") return null;
  try {
    const { data, error } = await supabaseClient.from("configuracion_usuario").select("*").eq("user_id", userId).maybeSingle();
    if (error) { console.warn("No se pudo cargar configuración:", error.message); return null; }
    return data;
  } catch (e) { return null; }
}

/* ============================================================
   CARGAR DATOS DESDE SUPABASE (INICIO)
   ============================================================ */
async function cargarDatosDesdeSupabase() {
  try {
    if (typeof supabaseClient === "undefined") return;

    // 1) Usuario logueado
    const usuarioLogueado = obtenerUsuarioLogueado();
    if (usuarioLogueado && usuarioLogueado.id) {
      configuracionUsuario = await cargarConfiguracionUsuario(usuarioLogueado.id);
    }

    // 2) Lista de usuarios
    const { data: usuarios, error: errUsuarios } = await supabaseClient
      .from("usuarios_rovant")
      .select("id, nombre, cargo, usuario");

    if (errUsuarios) { console.error("Error al traer usuarios:", errUsuarios); return; }

    usuariosEquipo = usuarios || [];

    // 3) Avatares de todos los usuarios
    const { data: cfgs } = await supabaseClient.from("configuracion_usuario").select("user_id, avatar_url");
    (cfgs || []).forEach(c => { avataresEquipo[c.user_id] = c.avatar_url; });

    // 4) Encontrar usuario actual
    if (usuarioLogueado && usuarioLogueado.id) {
      usuarioActual = usuariosEquipo.find(u => String(u.id) === String(usuarioLogueado.id));
    }
    if (!usuarioActual && usuarioLogueado && usuarioLogueado.usuario) {
      usuarioActual = usuariosEquipo.find(u => u.usuario === usuarioLogueado.usuario);
    }
    if (!usuarioActual && usuarioLogueado && usuarioLogueado.nombre) {
      usuarioActual = usuariosEquipo.find(u => u.nombre === usuarioLogueado.nombre);
    }

    let indexActual = 0;
    if (!usuarioActual && usuariosEquipo.length > 0) {
      usuarioActual = usuariosEquipo[0];
    } else if (usuarioActual) {
      indexActual = usuariosEquipo.indexOf(usuarioActual);
    }

    // 5) Renderizar
    if (usuarioActual) renderUsuarioActual(usuarioActual, indexActual);
    renderEquipo(usuariosEquipo);

    // 6) Tareas y APKs
    await cargarTareasDesdeSupabase();
    renderTareas();
    await cargarApksDisponibles();

  } catch (err) {
    console.error("Error general al cargar datos:", err);
  }
}

/* ============================================================
   MENÚ DESPLEGABLE MÓVIL
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

  if (userInfo) {
    userInfo.addEventListener("click", (e) => {
      if (window.innerWidth <= 1100) {
        e.stopPropagation();
        sidebar.classList.contains("open") ? cerrarMenu() : abrirMenu();
      }
    });
  }

  if (overlay) overlay.addEventListener("click", cerrarMenu);

  sidebar.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      if (window.innerWidth <= 1100) cerrarMenu();
    });
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100) cerrarMenu();
  });
}

/* ============================================================
   ARRASTRE DEL MENÚ (swipe para cerrar)
   ============================================================ */
function inicializarArrastreMenu() {
  const sidebar = document.getElementById("sidebar");
  const handle = document.getElementById("sidebarDragHandle");
  const overlay = document.getElementById("menuOverlay");
  if (!sidebar || !handle) return;

  let startX = 0;
  let currentX = 0;
  let dragging = false;
  const umbralCierre = 80;

  const onStart = (e) => {
    if (window.innerWidth > 1100) return;
    dragging = true;
    startX = (e.touches ? e.touches[0].clientX : e.clientX);
    currentX = startX;
    sidebar.style.transition = "none";
  };

  const onMove = (e) => {
    if (!dragging) return;
    currentX = (e.touches ? e.touches[0].clientX : e.clientX);
    const delta = currentX - startX;
    if (delta < 0) return;

    sidebar.style.transform = `translateX(${delta}px)`;
    if (overlay) {
      const opacidad = Math.max(0, 0.5 - (delta / 300) * 0.5);
      overlay.style.opacity = opacidad;
    }
    if (e.cancelable) e.preventDefault();
  };

  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    const delta = currentX - startX;
    sidebar.style.transition = "";
    sidebar.style.transform = "";
    if (overlay) overlay.style.opacity = "";

    if (delta > umbralCierre) {
      sidebar.classList.remove("open");
      if (overlay) overlay.classList.remove("show");
      document.body.classList.remove("menu-open");
      document.body.style.overflow = "";
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
  inicializarTabs();
  inicializarNavegacion();
  inicializarCerrarSesion();
  inicializarMenuMovil();
  inicializarArrastreMenu();

  await cargarDatosDesdeSupabase();
});