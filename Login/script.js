// ===== LOGIN + CAMBIO DE CONTRASEÑA (MODAL) - ROVANT =====

document.addEventListener('DOMContentLoaded', () => {
    // Elementos del login
    const btnLogin = document.getElementById('btnLogin');
    const inputUsuario = document.getElementById('usuario');
    const inputPassword = document.getElementById('password');

    // Elementos del modal de cambio
    const overlay = document.getElementById('overlay');
    const inputActual = document.getElementById('passActual');
    const inputNueva = document.getElementById('passNueva');
    const inputConfirmar = document.getElementById('passConfirmar');
    const btnCambiar = document.getElementById('btnCambiar');
    const feedbackNueva = document.getElementById('feedbackNueva');
    const feedbackConfirmar = document.getElementById('feedbackConfirmar');

    // Elementos del modal de éxito
    const overlayExito = document.getElementById('overlayExito');
    const btnOkExito = document.getElementById('btnOkExito');

    // ============================================================
    // Si ya hay sesión activa y NO debe cambiar contraseña, ir directo
    // ============================================================
    const sesionGuardada = sessionStorage.getItem('rovant_user');
    if (sesionGuardada) {
        try {
            const u = JSON.parse(sesionGuardada);
            if (u && !u.debe_cambiar_password) {
                window.location.href = '../Aplicativo/Aplicativo.html';
                return;
            }
        } catch (e) {
            sessionStorage.removeItem('rovant_user');
        }
    }

    // ============================================================
    // LOGIN
    // ============================================================
    async function iniciarSesion() {
        const usuario = inputUsuario.value.trim();
        const password = inputPassword.value.trim();

        if (!usuario) {
            alert('Por favor, ingresa tu usuario.');
            inputUsuario.focus();
            return;
        }
        if (!password) {
            alert('Por favor, ingresa tu contraseña.');
            inputPassword.focus();
            return;
        }

        btnLogin.disabled = true;
        btnLogin.textContent = 'Verificando...';

        try {
            const { data, error } = await supabaseClient.rpc('verificar_login', {
                p_usuario: usuario,
                p_password: password
            });

            if (error) throw error;

            if (!data || !data.ok) {
                alert((data && data.error) || 'Usuario o contraseña incorrectos');
                inputPassword.value = '';
                inputPassword.focus();
                return;
            }

            sessionStorage.setItem('rovant_recien_logueado', '1');   // sonido + popup de bienvenida
            sessionStorage.setItem('rovant_user', JSON.stringify({
                id: data.id,
                nombre: data.nombre,
                cargo: data.cargo,
                usuario: data.usuario,
                debe_cambiar_password: data.debe_cambiar_password
            }));

            if (data.debe_cambiar_password) {
                abrirModal(password);
            } else {
                window.location.href = '../Aplicativo/Aplicativo.html';
            }

        } catch (err) {
            console.error('Error login:', err);
            alert('Error al conectar con el servidor. Intenta de nuevo.');
        } finally {
            btnLogin.disabled = false;
            btnLogin.textContent = 'Iniciar sesión';
        }
    }

    // ============================================================
    // MODAL - Abrir / Cerrar
    // ============================================================
    function abrirModal(passwordActual) {
        inputActual.value = passwordActual || '';
        inputNueva.value = '';
        inputConfirmar.value = '';

        // Resetear estados visuales
        inputNueva.classList.remove('input-error', 'input-ok');
        inputConfirmar.classList.remove('input-error', 'input-ok');
        feedbackNueva.textContent = 'Mínimo 8 caracteres';
        feedbackNueva.className = 'pass-feedback';
        feedbackConfirmar.textContent = '';
        feedbackConfirmar.className = 'pass-feedback';

        overlay.classList.add('activo');
        setTimeout(() => inputNueva.focus(), 300);
    }

    function cerrarModal() {
        overlay.classList.remove('activo');
        inputActual.value = '';
        inputNueva.value = '';
        inputConfirmar.value = '';
    }

    // ============================================================
    // MOSTRAR / OCULTAR CONTRASEÑA (OJO)
    // ============================================================
    document.querySelectorAll('.toggle-pass').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            const eyeOpen = btn.querySelector('.eye-open');
            const eyeClosed = btn.querySelector('.eye-closed');

            if (input.type === 'password') {
                input.type = 'text';
                eyeOpen.style.display = 'none';
                eyeClosed.style.display = 'block';
            } else {
                input.type = 'password';
                eyeOpen.style.display = 'block';
                eyeClosed.style.display = 'none';
            }
        });
    });

    // ============================================================
    // VALIDACIÓN EN TIEMPO REAL (NUEVA CONTRASEÑA)
    // ============================================================
    function actualizarFeedbackNueva() {
        const val = inputNueva.value;

        if (val.length === 0) {
            feedbackNueva.textContent = 'Mínimo 8 caracteres';
            feedbackNueva.className = 'pass-feedback';
            inputNueva.classList.remove('input-error', 'input-ok');
            return;
        }

        if (val.length < 8) {
            feedbackNueva.textContent = `❌ ${val.length}/8 caracteres — faltan ${8 - val.length}`;
            feedbackNueva.className = 'pass-feedback error';
            inputNueva.classList.add('input-error');
            inputNueva.classList.remove('input-ok');
        } else {
            feedbackNueva.textContent = `✅ ${val.length} caracteres — ¡Perfecto!`;
            feedbackNueva.className = 'pass-feedback ok';
            inputNueva.classList.add('input-ok');
            inputNueva.classList.remove('input-error');
        }
    }

    // ============================================================
    // VALIDACIÓN CONFIRMAR (coincidencia)
    // ============================================================
    function actualizarFeedbackConfirmar() {
        const val = inputConfirmar.value;

        if (val.length === 0) {
            feedbackConfirmar.textContent = '';
            feedbackConfirmar.className = 'pass-feedback';
            inputConfirmar.classList.remove('input-error', 'input-ok');
            return;
        }

        if (val !== inputNueva.value) {
            feedbackConfirmar.textContent = '❌ Las contraseñas no coinciden';
            feedbackConfirmar.className = 'pass-feedback error';
            inputConfirmar.classList.add('input-error');
            inputConfirmar.classList.remove('input-ok');
        } else {
            feedbackConfirmar.textContent = '✅ Las contraseñas coinciden';
            feedbackConfirmar.className = 'pass-feedback ok';
            inputConfirmar.classList.add('input-ok');
            inputConfirmar.classList.remove('input-error');
        }
    }

    inputNueva.addEventListener('input', () => {
        actualizarFeedbackNueva();
        if (inputConfirmar.value.length > 0) actualizarFeedbackConfirmar();
    });
    inputConfirmar.addEventListener('input', actualizarFeedbackConfirmar);

    // ============================================================
    // CAMBIO DE CONTRASEÑA
    // ============================================================
    async function guardarPassword() {
        const sesion = JSON.parse(sessionStorage.getItem('rovant_user') || 'null');
        if (!sesion) {
            cerrarModal();
            alert('Sesión expirada. Vuelve a iniciar sesión.');
            return;
        }

        const actual = inputActual.value.trim();
        const nueva = inputNueva.value.trim();
        const confirmar = inputConfirmar.value.trim();

        if (!actual || !nueva || !confirmar) {
            alert('Completa todos los campos');
            return;
        }
        if (nueva.length < 8) {
            alert('La contraseña debe tener al menos 8 caracteres');
            inputNueva.focus();
            return;
        }
        if (nueva !== confirmar) {
            alert('La nueva contraseña y la confirmación no coinciden');
            inputConfirmar.focus();
            return;
        }
        if (nueva === actual) {
            alert('La nueva contraseña debe ser diferente a la actual');
            inputNueva.focus();
            return;
        }

        btnCambiar.disabled = true;
        btnCambiar.textContent = 'Guardando...';

        try {
            const { data, error } = await supabaseClient.rpc('cambiar_password', {
                p_usuario: sesion.usuario,
                p_password_actual: actual,
                p_password_nueva: nueva
            });

            if (error) throw error;

            if (!data || !data.ok) {
                alert((data && data.error) || 'No se pudo cambiar la contraseña');
                return;
            }

            // Actualizar sesión
            sesion.debe_cambiar_password = false;
            sessionStorage.setItem('rovant_user', JSON.stringify(sesion));

            // 🔹 Cerrar modal de cambio y mostrar modal de ÉXITO (fondo 90%)
            cerrarModal();
            overlayExito.classList.add('activo');

        } catch (err) {
            console.error('Error cambio password:', err);
            alert('Error al conectar con el servidor. Intenta de nuevo.');
        } finally {
            btnCambiar.disabled = false;
            btnCambiar.textContent = 'Guardar contraseña';
        }
    }

    // ============================================================
    // BOTÓN OK DEL MODAL DE ÉXITO
    // ============================================================
    btnOkExito.addEventListener('click', () => {
        window.location.href = '../Aplicativo/Aplicativo.html';
    });

    // ============================================================
    // EVENTOS
    // ============================================================
    btnLogin.addEventListener('click', iniciarSesion);
    inputUsuario.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') iniciarSesion();
    });
    inputPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') iniciarSesion();
    });

    btnCambiar.addEventListener('click', guardarPassword);
    inputActual.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') inputNueva.focus();
    });
    inputNueva.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') inputConfirmar.focus();
    });
    inputConfirmar.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') guardarPassword();
    });
});