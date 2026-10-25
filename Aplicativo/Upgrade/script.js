/* ============================================================
   VARIABLES GLOBALES
   ============================================================ */
let usuarioActual = null;
let usuariosEquipo = [];
let configuracionUsuario = null;
let todasLasVersiones = []; // Para el buscador

/* ============================================================
   AVATAR POR DEFECTO (rotativo)
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
    sessionStorage.clear();
    localStorage.clear();
    window.location.href = "../../index.html";
  });
}

/* ============================================================
   RENDER USUARIO ACTUAL EN EL HEADER
   ============================================================ */
function renderUsuarioActual(u, index = 0) {
  if (!u) return;
  const nombre = u.nombre || "Usuario";
  const cargo = u.cargo || "Sin cargo";
  const avatar = obtenerAvatarUsuario(index);

  const headerName = document.getElementById("headerUserName");
  const headerRole = document.getElementById("headerUserRole");
  const headerAvatar = document.getElementById("headerAvatar");

  if (headerName) headerName.textContent = nombre;
  if (headerRole) headerRole.textContent = cargo;
  if (headerAvatar) headerAvatar.src = avatar;
}

/* ============================================================
   OBTENER USUARIO LOGUEADO
   ============================================================ */
function obtenerUsuarioLogueado() {
  try {
    const rovantUserStr = sessionStorage.getItem("rovant_user") || localStorage.getItem("rovant_user");
    if (rovantUserStr) return JSON.parse(rovantUserStr);
  } catch (e) { console.warn("⚠️ Error al parsear usuario:", e); }

  const nombreAlternativo = sessionStorage.getItem("nombreUsuario") || localStorage.getItem("nombreUsuario");
  if (nombreAlternativo) return { nombre: nombreAlternativo };
  return null;
}

/* ============================================================
   CARGAR CONFIGURACIÓN DEL USUARIO
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
   CARGAR DATOS DESDE SUPABASE (USUARIO)
   ============================================================ */
async function cargarDatosDesdeSupabase() {
  try {
    if (typeof supabaseClient === "undefined") return;
    const usuarioLogueado = obtenerUsuarioLogueado();
    if (usuarioLogueado && usuarioLogueado.id) {
      configuracionUsuario = await cargarConfiguracionUsuario(usuarioLogueado.id);
    }

    const { data: usuarios, error: errUsuarios } = await supabaseClient.from("usuarios_rovant").select("id, nombre, cargo, usuario");
    if (errUsuarios) { console.error("Error usuarios:", errUsuarios); return; }

    usuariosEquipo = usuarios || [];
    if (usuarioLogueado && usuarioLogueado.id) usuarioActual = usuariosEquipo.find(u => String(u.id) === String(usuarioLogueado.id));
    if (!usuarioActual && usuarioLogueado && usuarioLogueado.usuario) usuarioActual = usuariosEquipo.find(u => u.usuario === usuarioLogueado.usuario);
    if (!usuarioActual && usuarioLogueado && usuarioLogueado.nombre) usuarioActual = usuariosEquipo.find(u => u.nombre === usuarioLogueado.nombre);
    
    let indexActual = 0;
    if (!usuarioActual && usuariosEquipo.length > 0) {
      usuarioActual = usuariosEquipo[0];
    } else if (usuarioActual) {
      indexActual = usuariosEquipo.indexOf(usuarioActual);
    }
    if (usuarioActual) renderUsuarioActual(usuarioActual, indexActual);
  } catch (err) { console.error("Error general:", err); }
}

/* ============================================================
   CARGAR Y RENDERIZAR HISTORIAL DE VERSIONES (TABLA)
   ============================================================ */
async function cargarHistorialVersiones() {
  const tbody = document.getElementById('tablaVersionesBody');
  if (!tbody || typeof supabaseClient === "undefined") return;

  try {
    const { data: versiones, error } = await supabaseClient
      .from('apk_versions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    todasLasVersiones = versiones || [];
    await cargarR2Config().catch(e => console.warn(e.message));
    renderizarTablaVersiones(todasLasVersiones);

  } catch (error) {
    console.error("Error al cargar historial:", error);
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #D32F2F; padding: 20px;">Error al cargar las versiones.</td></tr>`;
  }
}

function renderizarTablaVersiones(versiones) {
  const tbody = document.getElementById('tablaVersionesBody');
  if (!tbody) return;

  if (!versiones || versiones.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #666; padding: 20px;">No hay versiones subidas aún.</td></tr>`;
    return;
  }

  tbody.innerHTML = versiones.map((v, index) => {
    const fecha = new Date(v.created_at);
    const dia = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    const hora = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    
    const sizeMB = v.file_size ? (v.file_size / (1024 * 1024)).toFixed(1) + ' MB' : 'N/A';
    
    const isActive = v.is_active;
    const badgeClass = isActive ? 'active' : '';
    const statusClass = isActive ? 'active' : 'inactive';
    const statusText = isActive ? 'Activa' : 'Inactiva';
    const currentLabel = isActive ? '<span class="version-current">Versión actual</span>' : '';

    const avatarSrc = obtenerAvatar(index);
    const publicUrl = urlDescargaApk(v.file_path, v.file_name);

    return `
      <tr>
        <td>
          <span class="badge-version ${badgeClass}">${v.version}</span>
          ${currentLabel}
        </td>
        <td>
          <div class="user-cell">
            <img src="${avatarSrc}" alt="User" class="table-avatar">
            <div class="user-details">
              <span class="t-name">${v.uploaded_by_name || 'Desconocido'}</span>
            </div>
          </div>
        </td>
        <td>
          <div class="date-cell">
            <svg viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <div>${dia}<br><span>${hora}</span></div>
          </div>
        </td>
        <td>
          <div class="size-cell">
            <svg viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            ${sizeMB}
          </div>
        </td>
        <td><span class="status ${statusClass}"><span class="dot"></span>${statusText}</span></td>
        <td>
          <div class="actions-cell">
            <button class="action-btn" title="Descargar" onclick="window.open('${publicUrl}', '_blank')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="action-btn action-delete" title="Eliminar" onclick="pedirEliminarApk(${v.id})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
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
   ELIMINAR APK (R2 / Supabase Storage + registro)
   ============================================================ */
let apkPorEliminar = null;

function pedirEliminarApk(id) {
  const v = todasLasVersiones.find(x => String(x.id) === String(id));
  if (!v) return;
  apkPorEliminar = v;
  document.getElementById('confirmDelText').textContent = v.is_active
    ? `La versión ${v.version} es la APK activa. Si la eliminas, el botón de descarga quedará sin APK hasta que selecciones otra. Esta acción no se puede deshacer.`
    : `Se eliminará la versión ${v.version} (${v.file_name || 'APK'}). Esta acción no se puede deshacer.`;
  document.getElementById('confirmDelOverlay').classList.add('show');
}

function cerrarConfirmEliminar() {
  apkPorEliminar = null;
  document.getElementById('confirmDelOverlay').classList.remove('show');
}

async function eliminarApkConfirmado() {
  const v = apkPorEliminar;
  if (!v) return;
  const btn = document.getElementById('confirmDelOk');
  btn.disabled = true; btn.textContent = 'Eliminando...';
  try {
    // 1) registro primero: si la base de datos lo bloquea, el archivo no se toca.
    // Sin permiso (RLS) Supabase no da error: borra 0 filas, por eso se pide devolver lo borrado.
    const { data: borrados, error: dbErr } = await supabaseClient.from('apk_versions').delete().eq('id', v.id).select();
    if (dbErr) throw dbErr;
    if (!borrados || !borrados.length) {
      throw new Error('Supabase no permitió borrar el registro (falta la política de DELETE en apk_versions). Ejecuta Aplicativo/Upgrade/apk_versions_permisos.sql en el SQL Editor.');
    }

    // 2) archivo
    if (v.file_path && v.file_path.startsWith('r2/')) {
      await cargarR2Config();
      const user = obtenerUsuarioLogueado();
      const userId = (user && user.id) || (usuarioActual && usuarioActual.id) || '';
      if (!userId) throw new Error('No se encontró tu sesión. Cierra sesión y vuelve a entrar.');
      const resp = await fetch(`${R2_WORKER_URL}/apk/${encodeURIComponent(v.file_path.slice(3))}`, {
        method: 'DELETE', headers: { 'X-User-Id': String(userId) }
      });
      if (!resp.ok) {
        let msg = 'No se pudo eliminar el archivo (' + resp.status + ')';
        try { msg = (await resp.json()).error || msg; } catch (e) { /* ignorar */ }
        throw new Error(msg);
      }
    } else if (v.file_path) {
      const { error: stErr } = await supabaseClient.storage.from('apks').remove([v.file_path]);
      if (stErr) throw stErr;
    }
    cerrarConfirmEliminar();
    await cargarHistorialVersiones();
  } catch (error) {
    console.error('Error al eliminar APK:', error);
    cerrarConfirmEliminar();
    mostrarModal('Error al eliminar', error.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Eliminar';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const ok = document.getElementById('confirmDelOk');
  const cancel = document.getElementById('confirmDelCancel');
  const ov = document.getElementById('confirmDelOverlay');
  if (ok) ok.addEventListener('click', eliminarApkConfirmado);
  if (cancel) cancel.addEventListener('click', cerrarConfirmEliminar);
  if (ov) ov.addEventListener('click', e => { if (e.target === ov) cerrarConfirmEliminar(); });
});

/* ============================================================
   LÓGICA PARA SUBIR APK A SUPABASE Y MODAL
   ============================================================ */
function mostrarModal(titulo, mensaje, esError = false) {
  const overlay = document.getElementById('modalOverlay');
  if (!overlay) return;
  const icon = overlay.querySelector('.modal-icon');
  const title = overlay.querySelector('.modal-title');
  
  if (esError) {
    icon.textContent = '❌';
    title.style.color = '#D32F2F';
  } else {
    icon.textContent = '🎉';
    title.style.color = '#0C2543';
  }
  title.textContent = titulo;
  overlay.querySelector('.modal-text').textContent = mensaje;
  overlay.classList.add('show');
}

document.addEventListener("DOMContentLoaded", () => {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  if (dropzone && fileInput) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evento => {
      dropzone.addEventListener(evento, (e) => { e.preventDefault(); e.stopPropagation(); });
    });

    dropzone.addEventListener('dragover', () => dropzone.classList.add('dragover'));
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files.length > 0) procesarSubidaAPK(e.dataTransfer.files[0]);
    });
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) procesarSubidaAPK(e.target.files[0]);
    });
  }

  const closeBtn = document.getElementById('modalCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const overlay = document.getElementById('modalOverlay');
      if (overlay) overlay.classList.remove('show');
      if (!overlay.querySelector('.modal-title').style.color.includes('D32F2F')) {
        cargarHistorialVersiones();
      }
    });
  }

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const texto = e.target.value.toLowerCase();
      const filtradas = todasLasVersiones.filter(v => 
        v.version.toLowerCase().includes(texto) || 
        (v.uploaded_by_name && v.uploaded_by_name.toLowerCase().includes(texto))
      );
      renderizarTablaVersiones(filtradas);
    });
  }

  cargarHistorialVersiones();
});

async function procesarSubidaAPK(archivo) {
  if (!archivo.name.endsWith('.apk')) return mostrarModal('Error', 'Solo se permiten archivos con extensión .apk', true);
  if (archivo.size > 100 * 1024 * 1024) return mostrarModal('Error', 'El archivo supera el límite de 100 MB.', true);

  // --- ARREGLO DE NOMBRE ---
  // 1. Intentar sacarlo de la sesión
  const user = obtenerUsuarioLogueado();
  let nombreSubidor = user ? user.nombre : null;
  
  // 2. Si falla, leerlo directamente del HTML del header
  if (!nombreSubidor || nombreSubidor === 'Desconocido') {
      const headerNameEl = document.getElementById("headerUserName");
      if (headerNameEl && headerNameEl.textContent.trim() !== "" && headerNameEl.textContent.trim() !== "Cargando...") {
          nombreSubidor = headerNameEl.textContent.trim();
      }
  }
  
  // 3. Respaldo final por si acaso
  if (!nombreSubidor) nombreSubidor = 'Desconocido';
  // -------------------------

  const timestamp = Date.now();
  const nombreLimpio = archivo.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const rutaArchivo = `${timestamp}_${nombreLimpio}`;
  
  const matchVersion = archivo.name.match(/v?\d+\.\d+(\.\d+)?/);
  const versionDetectada = matchVersion ? matchVersion[0] : 'v' + timestamp;

  try {
    const dropzone = document.getElementById('dropzone');
    if (dropzone) dropzone.querySelector('.dz-title').textContent = 'Subiendo APK... (Espera)';
    
    // Subida a Cloudflare R2 a través del Worker (URL leída de Supabase)
    await cargarR2Config();
    const userId = (user && user.id) || (usuarioActual && usuarioActual.id) || '';
    if (!userId) throw new Error('No se encontró tu sesión. Cierra sesión y vuelve a entrar.');
    const resp = await fetch(`${R2_WORKER_URL}/apk/${encodeURIComponent(rutaArchivo)}`, {
      method: 'PUT',
      headers: { 'X-User-Id': String(userId), 'Content-Type': 'application/vnd.android.package-archive' },
      body: archivo
    });
    if (!resp.ok) {
      let msg = 'No se pudo subir el APK (' + resp.status + ')';
      try { msg = (await resp.json()).error || msg; } catch (e) { /* ignorar */ }
      throw new Error(msg);
    }
    const uploadData = { path: 'r2/' + rutaArchivo };

    const { error: dbError } = await supabaseClient.from('apk_versions').insert([{
      version: versionDetectada,
      file_name: archivo.name,
      file_path: uploadData.path,
      file_size: archivo.size,
      uploaded_by_name: nombreSubidor, // Aquí irá "Juan David"
      is_active: false
    }]);

    if (dbError) throw dbError;

    mostrarModal('¡Éxito!', 'El APK se ha subido y registrado correctamente.');
    
  } catch (error) {
    console.error('Error detallado en la subida:', error);
    mostrarModal('Error al subir', error.message, true);
  } finally {
    const dropzone = document.getElementById('dropzone');
    if (dropzone) dropzone.querySelector('.dz-title').textContent = 'Arrastra tu APK aquí';
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
  }
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  inicializarNavegacion();
  inicializarCerrarSesion();
  inicializarMenuMovil();
  inicializarArrastreMenu();
  await cargarDatosDesdeSupabase();
});