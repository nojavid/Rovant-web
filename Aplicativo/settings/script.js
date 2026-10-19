/* =========================================================
   1) ESCALADO RESPONSIVO
   ========================================================= */
function fitStage() {
  const stage = document.getElementById('stage');
  const baseW = 1512;
  const baseH = 1300;

  if (window.innerWidth <= 768) {
    stage.style.transform = 'none';
    stage.style.marginLeft = '0';
    stage.style.marginBottom = '0';
    return;
  }

  const availableW = window.innerWidth;
  const scale = availableW / baseW;

  stage.style.transform = 'scale(' + scale + ')';
  stage.style.transformOrigin = 'top center';

  const extraW = (baseW * scale) - baseW;
  const extraH = (baseH * scale) - baseH;
  stage.style.marginLeft = (extraW / 2) + 'px';
  stage.style.marginBottom = extraH + 'px';
}
window.addEventListener('resize', fitStage);
window.addEventListener('load', fitStage);
fitStage();

/* =========================================================
   2) VARIABLES GLOBALES
   ========================================================= */
const avatarsWrap = document.getElementById('avatarsWrap');
const mainAvatar  = document.getElementById('mainAvatar');
let sesion        = null;

const AVATARES = [
  'avatar1.png',
  'avatar2.png',
  'avatar3.png',
  'avatar4.png'
];

/* =========================================================
   3) CARGAR AVATARES DINÁMICAMENTE
   ========================================================= */
AVATARES.forEach((file, i) => {
  const item = document.createElement('div');
  item.className = 'avatar-item';
  item.dataset.file = file;

  const img = document.createElement('img');
  img.src = '../../Iconos/Avatar/' + file;
  img.alt = 'Avatar ' + (i + 1);
  img.loading = 'eager';
  img.decoding = 'async';
  img.dataset.file = file;
  item.appendChild(img);

  const check = document.createElement('div');
  check.className = 'avatar-check hidden';
  check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  item.appendChild(check);

  item.addEventListener('click', () => {
    document.querySelectorAll('.avatar-check').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.avatar-item').forEach(it => it.classList.remove('selected'));
    check.classList.remove('hidden');
    item.classList.add('selected');
    cambiarAvatarGrande(img.src);
    guardarAvatar(file, img.src);
  });

  avatarsWrap.appendChild(item);
});

/* =========================================================
   4) CAMBIO DE AVATAR GRANDE SIN PIXELADO
   ========================================================= */
function cambiarAvatarGrande(src) {
  const img = new Image();
  img.decoding = 'async';
  img.loading = 'eager';
  img.onload = () => {
    mainAvatar.style.opacity = '0';
    setTimeout(() => {
      mainAvatar.src = src;
      mainAvatar.style.imageRendering = 'auto';
      mainAvatar.style.opacity = '1';
    }, 120);
  };
  img.src = src;
}

/* =========================================================
   5) MARCAR AVATAR SELECCIONADO
   ========================================================= */
function marcarAvatarSeleccionado(fileName) {
  if (!fileName) return;
  document.querySelectorAll('.avatar-item').forEach(item => {
    const check = item.querySelector('.avatar-check');
    const img   = item.querySelector('img');
    if (item.dataset.file === fileName) {
      check.classList.remove('hidden');
      item.classList.add('selected');
      if (img) cambiarAvatarGrande(img.src);
    } else {
      check.classList.add('hidden');
      item.classList.remove('selected');
    }
  });
}

/* =========================================================
   6) GUARDAR AVATAR
   ========================================================= */
async function guardarAvatar(fileName, fullSrc) {
  if (!sesion || !sesion.id) return;

  try {
    const { error } = await supabaseClient
      .from('configuracion_usuario')
      .upsert(
        {
          user_id: sesion.id,
          avatar_url: fileName,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      console.error('Error guardando avatar:', error.message);
    } else {
      console.log('✅ Avatar guardado:', fileName);
    }

    sesion.avatar_file = fileName;
    sesion.avatar_url  = fullSrc;
    sessionStorage.setItem('rovant_user', JSON.stringify(sesion));
  } catch (e) {
    console.error('Error inesperado:', e);
  }
}

/* =========================================================
   7) CARGAR CONFIGURACIÓN GUARDADA
   ========================================================= */
async function cargarConfiguracion() {
  if (!sesion || !sesion.id) return;

  try {
    const { data, error } = await supabaseClient
      .from('configuracion_usuario')
      .select('*')
      .eq('user_id', sesion.id)
      .maybeSingle();

    if (error) {
      console.warn('Error cargando configuración:', error.message);
      return;
    }

    if (!data) {
      console.log('ℹ️ No hay configuración guardada aún');
      actualizarPillPopup();
      if (sesion.avatar_file) marcarAvatarSeleccionado(sesion.avatar_file);
      return;
    }

    if (data.avatar_url) {
      marcarAvatarSeleccionado(data.avatar_url);
      sesion.avatar_file = data.avatar_url;
      sesion.avatar_url  = '../../Iconos/Avatar/' + data.avatar_url;
    }

    if (data.nombre) {
      document.getElementById('displayName').textContent   = data.nombre;
      document.getElementById('rowNameValue').textContent  = data.nombre;
      sesion.nombre = data.nombre;
    }

    if (data.usuario) {
      const handle = '@' + data.usuario;
      document.getElementById('displayHandle').textContent  = handle;
      document.getElementById('rowHandleValue').textContent = handle;
      sesion.usuario = data.usuario;
    }

    if (data.tema) {
      const pill = document.querySelector('.card-3 .row[data-action="tema"] .pill');
      if (pill) pill.textContent = data.tema;
    }

    {
      // siempre desactivadas salvo que el miembro las haya activado y el navegador lo permita
      const act = data.notificaciones === 'Sí' && RovantAvisos.permisoConcedido();
      const pill = document.querySelector('.card-3 .row[data-action="notificaciones"] .pill');
      if (pill) pill.textContent = act ? 'Sí' : 'No';
    }

    actualizarPillPopup();
    sessionStorage.setItem('rovant_user', JSON.stringify(sesion));
    console.log('✅ Configuración cargada:', data);
  } catch (e) {
    console.warn('Error cargando configuración:', e);
  }
}

/* =========================================================
   8) CARGAR DATOS DEL USUARIO
   ========================================================= */
async function cargarDatosUsuario() {
  try {
    const sesionRaw = sessionStorage.getItem('rovant_user');
    if (!sesionRaw) {
      console.warn('⚠️ No hay sesión en sessionStorage.');
      return;
    }

    try {
      sesion = JSON.parse(sesionRaw);
    } catch (e) {
      console.error('Sesión corrupta:', e);
      sessionStorage.removeItem('rovant_user');
      return;
    }

    console.log('✅ Sesión encontrada:', sesion);

    const nombre    = sesion.nombre  || 'Usuario';
    const apellido  = sesion.apellido || '';
    const username  = sesion.usuario ? '@' + sesion.usuario : '@usuario';
    const nombreCompleto = (nombre + ' ' + apellido).trim() || 'Usuario';

    document.getElementById('displayName').textContent    = nombreCompleto;
    document.getElementById('displayHandle').textContent  = username;
    document.getElementById('rowNameValue').textContent   = nombreCompleto;
    document.getElementById('rowHandleValue').textContent = username;

    if (sesion.avatar_file) {
      marcarAvatarSeleccionado(sesion.avatar_file);
    } else if (sesion.avatar_url) {
      cambiarAvatarGrande(sesion.avatar_url);
    }

    await cargarConfiguracion();
  } catch (err) {
    console.error('❌ Error inesperado:', err);
  }
}

/* =========================================================
   9) MODAL GENÉRICO
   ========================================================= */
const modalOverlay  = document.getElementById('modalOverlay');
const modalTitle    = document.getElementById('modalTitle');
const modalSubtitle = document.getElementById('modalSubtitle');
const modalBody     = document.getElementById('modalBody');
const modalCancel   = document.getElementById('modalCancel');
const modalSave     = document.getElementById('modalSave');

let accionActual = null;

function abrirModal(config) {
  accionActual = config.action;
  modalTitle.textContent    = config.title;
  modalSubtitle.textContent = config.subtitle || '';
  modalBody.innerHTML       = config.body;
  modalOverlay.classList.add('activo');

  const firstInput = modalBody.querySelector('input');
  if (firstInput) setTimeout(() => firstInput.focus(), 200);

  modalBody.querySelectorAll('.option').forEach(opt => {
    opt.addEventListener('click', () => {
      modalBody.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  modalBody.querySelectorAll('.toggle-pass').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = modalBody.querySelector('#' + btn.dataset.target);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  const inputNueva     = modalBody.querySelector('#modalPassNueva');
  const inputConfirmar = modalBody.querySelector('#modalPassConfirmar');
  const feedbackNueva  = modalBody.querySelector('#feedbackNueva');
  const feedbackConfirmar = modalBody.querySelector('#feedbackConfirmar');

  function validarConfirmar() {
    if (!inputConfirmar || !feedbackConfirmar) return;
    const v = inputConfirmar.value;
    if (v.length === 0) {
      feedbackConfirmar.textContent = '';
      feedbackConfirmar.className = 'feedback';
    } else if (v === inputNueva.value) {
      feedbackConfirmar.textContent = '✅ Coinciden';
      feedbackConfirmar.className = 'feedback ok';
    } else {
      feedbackConfirmar.textContent = '❌ No coinciden';
      feedbackConfirmar.className = 'feedback error';
    }
  }

  if (inputNueva && feedbackNueva) {
    inputNueva.addEventListener('input', () => {
      const v = inputNueva.value;
      if (v.length === 0) {
        feedbackNueva.textContent = 'Mínimo 8 caracteres';
        feedbackNueva.className = 'feedback';
      } else if (v.length < 8) {
        feedbackNueva.textContent = `❌ ${v.length}/8 caracteres`;
        feedbackNueva.className = 'feedback error';
      } else {
        feedbackNueva.textContent = `✅ ${v.length} caracteres`;
        feedbackNueva.className = 'feedback ok';
      }
      if (inputConfirmar.value) validarConfirmar();
    });
  }

  if (inputConfirmar) inputConfirmar.addEventListener('input', validarConfirmar);
}

function cerrarModal() {
  modalOverlay.classList.remove('activo');
  accionActual = null;
  modalBody.innerHTML = '';
}

modalCancel.addEventListener('click', cerrarModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) cerrarModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('activo')) cerrarModal();
});

/* =========================================================
   9.1) MODAL DE AVISO / ERROR (fondo 90%)
   ========================================================= */
const avisoOverlay = document.getElementById('avisoOverlay');
const avisoIcon    = document.getElementById('avisoIcon');
const avisoTitle   = document.getElementById('avisoTitle');
const avisoMessage = document.getElementById('avisoMessage');
const avisoBtn     = document.getElementById('avisoBtn');

function mostrarAviso(titulo, mensaje, tipo = 'error') {
  avisoIcon.textContent  = tipo === 'exito' ? '✅' : '⚠️';
  avisoTitle.textContent = titulo;
  avisoMessage.innerHTML = mensaje;

  avisoOverlay.classList.remove('exito');
  if (tipo === 'exito') avisoOverlay.classList.add('exito');

  avisoOverlay.classList.add('activo');
}

function cerrarAviso() {
  avisoOverlay.classList.remove('activo');
  avisoOverlay.classList.remove('exito');
}

avisoBtn.addEventListener('click', cerrarAviso);
avisoOverlay.addEventListener('click', (e) => {
  if (e.target === avisoOverlay) cerrarAviso();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && avisoOverlay.classList.contains('activo')) cerrarAviso();
});

/* =========================================================
   10) MODALES ESPECÍFICOS
   ========================================================= */
function abrirModalNombre() {
  const actual = document.getElementById('displayName').textContent;
  abrirModal({
    action: 'nombre',
    title: 'Cambiar nombre',
    subtitle: 'Este nombre se mostrará en tu perfil',
    body: `
      <label for="modalNombre">Nuevo nombre</label>
      <input type="text" id="modalNombre" value="${actual.replace(/"/g, '&quot;')}" maxlength="60">
    `
  });
}

function abrirModalUsuario() {
  const actual = document.getElementById('displayHandle').textContent.replace('@', '');
  abrirModal({
    action: 'usuario',
    title: 'Cambiar usuario',
    subtitle: 'Solo letras, números y guión bajo',
    body: `
      <label for="modalUsuario">Nuevo usuario</label>
      <input type="text" id="modalUsuario" value="${actual.replace(/"/g, '&quot;')}" maxlength="30">
      <div class="feedback" id="feedbackUsuario">Solo letras, números y _</div>
    `
  });

  const input    = document.getElementById('modalUsuario');
  const feedback = document.getElementById('feedbackUsuario');
  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (!v) {
      feedback.textContent = 'Solo letras, números y _';
      feedback.className = 'feedback';
    } else if (/^[a-zA-Z0-9_]+$/.test(v)) {
      feedback.textContent = '✅ Válido';
      feedback.className = 'feedback ok';
    } else {
      feedback.textContent = '❌ Solo letras, números y _';
      feedback.className = 'feedback error';
    }
  });
}

function abrirModalPassword() {
  abrirModal({
    action: 'password',
    title: 'Cambiar contraseña',
    subtitle: 'Debe tener mínimo 8 caracteres',
    body: `
      <label for="modalPassActual">Contraseña actual</label>
      <div class="input-wrap">
        <input type="password" id="modalPassActual">
        <button type="button" class="toggle-pass" data-target="modalPassActual">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>

      <label for="modalPassNueva">Nueva contraseña</label>
      <div class="input-wrap">
        <input type="password" id="modalPassNueva">
        <button type="button" class="toggle-pass" data-target="modalPassNueva">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
      <div class="feedback" id="feedbackNueva">Mínimo 8 caracteres</div>

      <label for="modalPassConfirmar">Confirmar nueva contraseña</label>
      <div class="input-wrap">
        <input type="password" id="modalPassConfirmar">
        <button type="button" class="toggle-pass" data-target="modalPassConfirmar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
      <div class="feedback" id="feedbackConfirmar"></div>
    `
  });
}

function abrirModalTema() {
  const pill = document.querySelector('.card-3 .row[data-action="tema"] .pill');
  const actual = pill ? pill.textContent.trim() : 'Claro';
  abrirModal({
    action: 'tema',
    title: 'Tema de la app',
    subtitle: 'Elige el estilo que prefieras',
    body: `
      <label>Selecciona un tema</label>
      <div class="options">
        <button type="button" class="option ${actual === 'Claro' ? 'selected' : ''}" data-value="Claro">Claro</button>
        <button type="button" class="option ${actual === 'Oscuro' ? 'selected' : ''}" data-value="Oscuro">Oscuro</button>
        <button type="button" class="option ${actual === 'Auto' ? 'selected' : ''}" data-value="Auto">Auto</button>
      </div>
    `
  });
}

function actualizarPillPopup() {
  const p = document.getElementById('pillPopup');
  if (p && sesion) p.textContent = RovantAvisos.popupInicioActivo(sesion.id) ? 'Sí' : 'No';
}

function abrirModalPopupInicio() {
  const actual = RovantAvisos.popupInicioActivo(sesion && sesion.id) ? 'Sí' : 'No';
  abrirModal({
    action: 'popup_inicio',
    title: 'Aviso al iniciar sesión',
    subtitle: 'Popup con tus tareas pendientes al entrar',
    body: `
      <label>Mostrar popup al iniciar sesión</label>
      <div class="options">
        <button type="button" class="option ${actual === 'Sí' ? 'selected' : ''}" data-value="Sí">Sí</button>
        <button type="button" class="option ${actual === 'No' ? 'selected' : ''}" data-value="No">No</button>
      </div>
    `
  });
}

function abrirModalNotificaciones() {
  const pill = document.querySelector('.card-3 .row[data-action="notificaciones"] .pill');
  const actual = pill ? pill.textContent.trim() : 'No';
  abrirModal({
    action: 'notificaciones',
    title: 'Permiso de notificaciones',
    subtitle: 'Elige si quieres recibir notificaciones',
    body: `
      <label>Permitir notificaciones</label>
      <div class="options">
        <button type="button" class="option ${actual === 'Sí' ? 'selected' : ''}" data-value="Sí">Sí</button>
        <button type="button" class="option ${actual === 'No' ? 'selected' : ''}" data-value="No">No</button>
      </div>
    `
  });
}

/* =========================================================
   11) ABRIR MODALES AL HACER CLIC EN LAS FILAS
   ========================================================= */
document.querySelectorAll('.row.clickable').forEach(row => {
  row.addEventListener('click', () => {
    const action = row.dataset.action;
    if (action === 'nombre')         abrirModalNombre();
    if (action === 'usuario')        abrirModalUsuario();
    if (action === 'password')       abrirModalPassword();
    if (action === 'tema')           abrirModalTema();
    if (action === 'notificaciones') abrirModalNotificaciones();
    if (action === 'popup_inicio')   abrirModalPopupInicio();
  });
});

/* =========================================================
   12) GUARDAR SEGÚN ACCIÓN
   ========================================================= */
modalSave.addEventListener('click', async () => {
  if (!accionActual || !sesion) return;

  try {
    /* ---------- NOMBRE ---------- */
    if (accionActual === 'nombre') {
      const nuevo = document.getElementById('modalNombre').value.trim();
      if (!nuevo) { mostrarAviso('Campo vacío', 'Escribe un nombre.'); return; }

      const { error } = await supabaseClient.from('configuracion_usuario').upsert(
        { user_id: sesion.id, nombre: nuevo, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      if (error) { mostrarAviso('Error', error.message); return; }

      document.getElementById('displayName').textContent  = nuevo;
      document.getElementById('rowNameValue').textContent = nuevo;
      sesion.nombre = nuevo;
      sessionStorage.setItem('rovant_user', JSON.stringify(sesion));
      console.log('✅ Nombre actualizado:', nuevo);
      cerrarModal();
    }

    /* ---------- USUARIO ---------- */
    else if (accionActual === 'usuario') {
      const nuevo = document.getElementById('modalUsuario').value.trim();
      if (!nuevo) { mostrarAviso('Campo vacío', 'Escribe un usuario.'); return; }
      if (!/^[a-zA-Z0-9_]+$/.test(nuevo)) {
        mostrarAviso('Usuario inválido', 'Solo letras, números y guión bajo.');
        return;
      }

      const { error } = await supabaseClient.from('configuracion_usuario').upsert(
        { user_id: sesion.id, usuario: nuevo, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      if (error) { mostrarAviso('Error', error.message); return; }

      const handle = '@' + nuevo;
      document.getElementById('displayHandle').textContent  = handle;
      document.getElementById('rowHandleValue').textContent = handle;
      sesion.usuario = nuevo;
      sessionStorage.setItem('rovant_user', JSON.stringify(sesion));
      console.log('✅ Usuario actualizado:', nuevo);
      cerrarModal();
    }

    /* ---------- CONTRASEÑA ---------- */
    else if (accionActual === 'password') {
      const actual    = document.getElementById('modalPassActual').value.trim();
      const nueva     = document.getElementById('modalPassNueva').value.trim();
      const confirmar = document.getElementById('modalPassConfirmar').value.trim();

      if (!actual || !nueva || !confirmar) {
        mostrarAviso('Campos incompletos', 'Por favor, completa todos los campos.');
        return;
      }
      if (nueva.length < 8) {
        mostrarAviso('Contraseña muy corta', 'La nueva contraseña debe tener al menos 8 caracteres.');
        return;
      }
      if (nueva !== confirmar) {
        mostrarAviso('No coinciden', 'La nueva contraseña y su confirmación no coinciden.');
        return;
      }
      if (nueva === actual) {
        mostrarAviso('Contraseña igual', 'La nueva contraseña debe ser diferente a la actual.');
        return;
      }

      const { data, error } = await supabaseClient.rpc('cambiar_password_usuario', {
        p_user_id: sesion.id,
        p_password_actual: actual,
        p_password_nueva: nueva
      });

      if (error) {
        mostrarAviso('Error del servidor', 'No se pudo conectar. Intenta de nuevo.');
        console.error(error);
        return;
      }

      // 👇 Contraseña actual incorrecta (o error del RPC)
      if (!data || !data.ok) {
        const msg = (data && data.error) ? data.error : 'La contraseña actual no es correcta.';
        mostrarAviso('Contraseña incorrecta', msg);
        return;
      }

      // Éxito
      cerrarModal();
      mostrarAviso('¡Contraseña actualizada!', 'Tu contraseña fue cambiada correctamente.', 'exito');
      console.log('✅ Contraseña actualizada');
    }

    /* ---------- TEMA ---------- */
    else if (accionActual === 'tema') {
      const sel = document.querySelector('.modal-body .option.selected');
      if (!sel) { mostrarAviso('Sin selección', 'Selecciona una opción.'); return; }
      const valor = sel.dataset.value;

      const { error } = await supabaseClient.from('configuracion_usuario').upsert(
        { user_id: sesion.id, tema: valor, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      if (error) { console.warn('Error guardando tema:', error.message); }

      const pill = document.querySelector('.card-3 .row[data-action="tema"] .pill');
      if (pill) pill.textContent = valor;

      console.log('✅ Tema actualizado:', valor);
      cerrarModal();
    }

    /* ---------- NOTIFICACIONES ---------- */
    else if (accionActual === 'notificaciones') {
      const sel = document.querySelector('.modal-body .option.selected');
      if (!sel) { mostrarAviso('Sin selección', 'Selecciona una opción.'); return; }
      let valor = sel.dataset.value;

      if (valor === 'Sí') {
        const permiso = await RovantAvisos.pedirPermiso();
        if (permiso !== 'granted') {
          valor = 'No';
          mostrarAviso('Notificaciones bloqueadas', 'Debes aceptar el permiso de notificaciones del navegador para activarlas.');
        } else {
          RovantAvisos.sonarNotificacion();
        }
      }

      const { error } = await supabaseClient.from('configuracion_usuario').upsert(
        { user_id: sesion.id, notificaciones: valor, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      if (error) { console.warn('Error guardando notificaciones:', error.message); }

      const pill = document.querySelector('.card-3 .row[data-action="notificaciones"] .pill');
      if (pill) pill.textContent = valor;

      console.log('✅ Notificaciones actualizadas:', valor);
      cerrarModal();
    }

    /* ---------- POPUP DE INICIO ---------- */
    else if (accionActual === 'popup_inicio') {
      const sel = document.querySelector('.modal-body .option.selected');
      if (!sel) { mostrarAviso('Sin selección', 'Selecciona una opción.'); return; }
      RovantAvisos.setPopupInicio(sesion.id, sel.dataset.value === 'Sí');
      actualizarPillPopup();
      cerrarModal();
    }

  } catch (e) {
    console.error('Error en modalSave:', e);
    mostrarAviso('Error inesperado', 'Algo salió mal. Intenta de nuevo.');
  }
});

/* =========================================================
   13) EJECUTAR AL CARGAR
   ========================================================= */
window.addEventListener('load', cargarDatosUsuario);