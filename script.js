// ============================
// REGISTRO DEL SERVICE WORKER (PWA)
// ============================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((registration) => {
        console.log('✅ Service Worker registrado:', registration.scope);
      })
      .catch((error) => {
        console.error('❌ Error al registrar el Service Worker:', error);
      });
  });
}

// ============================
// LÓGICA DE DESCARGA DEL APK (BLINDADA)
// ============================
document.addEventListener('DOMContentLoaded', () => {
  const btnDescargar = document.getElementById('btnDescargarMain');
  
  if (!btnDescargar) {
    console.error("❌ ERROR: No se encontró el botón con id 'btnDescargarMain' en tu index.html.");
    return;
  }

  btnDescargar.addEventListener('click', async (e) => {
    e.preventDefault(); // Evita que la página salte
    
    console.log("1. Clic detectado. Conectando con Supabase...");

    if (typeof supabaseClient === "undefined") {
      alert("Error crítico: No se cargó config.js. Revisa que la ruta <script src='Login/config.js'> sea correcta.");
      return;
    }

    try {
      console.log("2. Buscando APK activo en la base de datos...");
      
      const { data, error } = await supabaseClient
        .from('apk_versions')
        .select('file_path, file_name')
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error("Error devuelto por Supabase:", error);
        throw error;
      }

      console.log("3. Respuesta de Supabase:", data);

      if (data && data.file_path) {
        await cargarR2Config();
        const url = urlDescargaApk(data.file_path, data.file_name);
        console.log("4. Enlace generado:", url);
        
        // Inicia la descarga abriendo el enlace en la misma ventana
        window.location.href = url;
      } else {
        console.warn("No se encontró ningún APK con is_active = true.");
        alert("No hay ningún APK seleccionado para descargar. Entra al panel de control, selecciona uno e intenta de nuevo.");
      }
    } catch (error) {
      console.error("Error atrapado en el Catch:", error);
      alert("Hubo un error al intentar descargar el APK.");
    }
  });
});


// ============================
// DISEÑO RESPONSIVO Y COORDENADAS
// ============================
const BASE = {
  W: 1512,
  H: 982,
  cabecera: { h: 70 },
  logoHeader: { x: 70, y: 18, w: 170, h: 36 },
  nav: { gap: 40, fontSize: 15 },
  lineaActiva: { h: 3 },
  menuHamburguesa: { x: 1386, y: 20, w: 24, h: 30 },
  logoPrincipal: { x: 146, y: 180, w: 400, h: 86 },
  textoPrincipal: { x: 146, y: 320, w: 520, fontSize: 24 },
  subtitulo: { x: 146, y: 494, fontSize: 16 },
  btnDescarga: { x: 143, y: 594, w: 347, h: 91, fontSize: 20 },
  iconoAndroid: { w: 42, h: 42 },
  iconoDescarga: { w: 32, h: 32 },
  publicidad: { right: 0, y: 120, w: 700 }
};

const MOVIL = {
  W: 428,
  H: 926,
  cabecera: { h: 50 },
  logoHeader: { x: 142, y: 12, w: 100, h: 22 },
  menuHamburguesa: { x: 380, y: 15, w: 18, h: 18 },
  logoPrincipal: { x: 85, y: 90, w: 258, h: 56 },
  textoPrincipal: { x: 52, y: 165, w: 324, fontSize: 16 },
  subtitulo: { x: 52, y: 289, fontSize: 14 },
  btnDescarga: { x: 108, y: 369, w: 212, h: 55, fontSize: 13 },
  iconoAndroid: { w: 26, h: 26 },
  iconoDescarga: { w: 19, h: 20 },
  publicidad: { x: -20, y: 479, w: 430 }
};

let PUB_RATIO = 700 / 657;

function ajustar() {
  const ancho = window.innerWidth;
  const esMovil = ancho <= 768;
  const cfg = esMovil ? MOVIL : BASE;
  const sx = ancho / cfg.W;

  const cabecera = document.querySelector('.cabecera');
  if (cabecera) cabecera.style.height = (cfg.cabecera.h * sx) + 'px';

  const logoHeader = document.querySelector('.logo-header');
  if (logoHeader) {
    logoHeader.style.left = (cfg.logoHeader.x * sx) + 'px';
    logoHeader.style.top = (cfg.logoHeader.y * sx) + 'px';
    logoHeader.style.width = (cfg.logoHeader.w * sx) + 'px';
    logoHeader.style.height = (cfg.logoHeader.h * sx) + 'px';
  }

  const menuPc = document.querySelector('.menu-pc');
  const menuHamb = document.querySelector('.menu-hamburguesa');

  if (menuPc && menuHamb) {
    if (esMovil) {
      menuPc.style.display = 'none';
      menuHamb.style.display = 'block';
      menuHamb.style.left = (cfg.menuHamburguesa.x * sx) + 'px';
      menuHamb.style.top = (cfg.menuHamburguesa.y * sx) + 'px';
      menuHamb.style.width = (cfg.menuHamburguesa.w * sx) + 'px';
      menuHamb.style.height = (cfg.menuHamburguesa.h * sx) + 'px';
    } else {
      menuHamb.style.display = 'none';
      menuPc.style.display = 'flex';
      menuPc.style.justifyContent = 'center';
      menuPc.style.paddingLeft = '0';
      menuPc.style.paddingRight = '0';
      menuPc.style.gap = (BASE.nav.gap * sx) + 'px';

      document.querySelectorAll('.menu-pc .nav-link').forEach((link) => {
        link.style.fontSize = (BASE.nav.fontSize * sx) + 'px';
      });

      const bordeLogo = (BASE.logoHeader.x + BASE.logoHeader.w) * sx;
      const centroDisponible = (bordeLogo + ancho) / 2;
      const centroViewport = ancho / 2;
      const desplazamiento = centroDisponible - centroViewport;

      if (desplazamiento >= 0) {
        menuPc.style.paddingLeft = desplazamiento + 'px';
      } else {
        menuPc.style.paddingRight = Math.abs(desplazamiento) + 'px';
      }

      const linea = document.querySelector('.linea-activa');
      const activo = document.querySelector('.menu-pc .nav-link.activo');
      if (activo && linea) {
        const rect = activo.getBoundingClientRect();
        const parent = activo.parentElement.getBoundingClientRect();
        linea.style.left = (rect.left - parent.left) + 'px';
        linea.style.width = rect.width + 'px';
        linea.style.height = (BASE.lineaActiva.h * sx) + 'px';
        linea.style.bottom = (8 * sx) + 'px';
      }
    }
  }

  const logoPrin = document.querySelector('.logo-principal');
  if (logoPrin) {
    logoPrin.style.left = (cfg.logoPrincipal.x * sx) + 'px';
    logoPrin.style.top = (cfg.logoPrincipal.y * sx) + 'px';
    logoPrin.style.width = (cfg.logoPrincipal.w * sx) + 'px';
    logoPrin.style.height = (cfg.logoPrincipal.h * sx) + 'px';
  }

  const texto = document.querySelector('.texto-principal');
  if (texto) {
    texto.style.left = (cfg.textoPrincipal.x * sx) + 'px';
    texto.style.top = (cfg.textoPrincipal.y * sx) + 'px';
    texto.style.width = (cfg.textoPrincipal.w * sx) + 'px';
    texto.style.fontSize = (cfg.textoPrincipal.fontSize * sx) + 'px';
  }

  const sub = document.querySelector('.subtitulo');
  if (sub) {
    sub.style.left = (cfg.subtitulo.x * sx) + 'px';
    sub.style.top = (cfg.subtitulo.y * sx) + 'px';
    sub.style.fontSize = (cfg.subtitulo.fontSize * sx) + 'px';
  }

  const btn = document.querySelector('.btn-descarga');
  if (btn) {
    const btnW = cfg.btnDescarga.w * sx;
    const btnH = cfg.btnDescarga.h * sx;

    btn.style.left = (cfg.btnDescarga.x * sx) + 'px';
    btn.style.top = (cfg.btnDescarga.y * sx) + 'px';
    btn.style.width = btnW + 'px';
    btn.style.height = btnH + 'px';
    btn.style.fontSize = (cfg.btnDescarga.fontSize * sx) + 'px';
    btn.style.gap = (14 * sx) + 'px';
    btn.style.borderRadius = (btnH / 2) + 'px';
  }

  const icA = document.querySelector('.icono-android');
  if (icA) {
    icA.style.width = (cfg.iconoAndroid.w * sx) + 'px';
    icA.style.height = (cfg.iconoAndroid.h * sx) + 'px';
  }

  const icD = document.querySelector('.icono-descarga');
  if (icD) {
    icD.style.width = (cfg.iconoDescarga.w * sx) + 'px';
    icD.style.height = (cfg.iconoDescarga.h * sx) + 'px';
  }

  const pub = document.querySelector('.publicidad');
  if (pub) {
    const pubW = cfg.publicidad.w * sx;
    const pubH = pubW / PUB_RATIO;

    if (esMovil) {
      pub.style.left = (cfg.publicidad.x * sx) + 'px';
      pub.style.right = 'auto';
    } else {
      pub.style.right = (cfg.publicidad.right * sx) + 'px';
      pub.style.left = 'auto';
    }
    pub.style.top = (cfg.publicidad.y * sx) + 'px';
    pub.style.width = pubW + 'px';
    pub.style.height = pubH + 'px';
  }

  const contenido = document.querySelector('.contenido');
  if (contenido) {
    const finBtn = (cfg.btnDescarga.y + cfg.btnDescarga.h) * sx;
    const finTexto = (cfg.subtitulo.y + 60) * sx;
    const finPub = (cfg.publicidad.y * sx) + (cfg.publicidad.w * sx / PUB_RATIO);
    const altoContenido = Math.max(finBtn, finTexto, finPub);
    contenido.style.height = altoContenido + 'px';
  }

  const menuMovil = document.getElementById('menuMovil');
  if (menuMovil) menuMovil.style.top = (cfg.cabecera.h * sx) + 'px';

  const pantalla = document.querySelector('.pantalla');
  if (pantalla) {
    const finBtn = (cfg.btnDescarga.y + cfg.btnDescarga.h) * sx;
    const finTexto = (cfg.subtitulo.y + 60) * sx;
    const finPub = (cfg.publicidad.y * sx) + (cfg.publicidad.w * sx / PUB_RATIO);
    const altoContenido = Math.max(finBtn, finTexto, finPub);
    pantalla.style.height = altoContenido + 'px';
    pantalla.style.minHeight = '0';
  }
}

const imgPub = new Image();
imgPub.src = 'Iconos/publicidad_rovant.png'; 
imgPub.onload = function () {
  PUB_RATIO = imgPub.naturalWidth / imgPub.naturalHeight;
  ajustar();
};

window.addEventListener('load', ajustar);
window.addEventListener('resize', ajustar);
ajustar();

const menuHamb = document.querySelector('.menu-hamburguesa');
const menuMovil = document.getElementById('menuMovil');

if (menuHamb && menuMovil) {
  menuHamb.addEventListener('click', (e) => {
    e.stopPropagation();
    menuMovil.classList.toggle('abierto');
  });

  document.addEventListener('click', (e) => {
    if (!menuMovil.contains(e.target) && e.target !== menuHamb) {
      menuMovil.classList.remove('abierto');
    }
  });
}

document.querySelectorAll('.nav-link-movil').forEach(link => {
  link.addEventListener('click', (e) => {
    if (link.classList.contains('btn-login-movil')) {
      if (menuMovil) menuMovil.classList.remove('abierto');
      return;
    }
    document.querySelectorAll('.nav-link-movil').forEach(l => l.classList.remove('activo-movil'));
    link.classList.add('activo-movil');
    if (menuMovil) menuMovil.classList.remove('abierto');
  });
});

document.querySelectorAll('.menu-pc .nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    if (link.classList.contains('btn-login-pc')) {
      return;
    }
    e.preventDefault();
    document.querySelectorAll('.menu-pc .nav-link').forEach(l => l.classList.remove('activo'));
    link.classList.add('activo');
    ajustar();
  });
});