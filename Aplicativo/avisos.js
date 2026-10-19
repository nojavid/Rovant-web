/* ============================================================
   AVISOS — sonidos y notificaciones
   Se carga en Aplicativo.html, Tareas.html y settings.html
   ============================================================ */
const RovantAvisos = (() => {
  const BASE = document.currentScript.src;            // .../Aplicativo/avisos.js
  const urlSonido = f => new URL("../" + f, BASE).href;
  const SONIDO_NOTI = "NOTI.mp3";
  const SONIDO_INICIO = "Rovant Inicio Sonido.mp3";
  const FLAG_LOGIN = "rovant_recien_logueado";

  function reproducir(archivo) {
    const a = new Audio(urlSonido(archivo));
    const p = a.play();
    if (p && p.catch) {
      // el navegador pudo bloquear el autoplay: reintenta en la primera interacción
      p.catch(() => {
        const reintento = () => { a.play().catch(() => {}); };
        ["pointerdown", "keydown", "touchstart"].forEach(ev =>
          document.addEventListener(ev, reintento, { once: true, capture: true }));
      });
    }
  }

  /* ---------- Notificaciones del navegador ---------- */
  const permisoConcedido = () => "Notification" in window && Notification.permission === "granted";
  async function pedirPermiso() {
    if (!("Notification" in window)) return "denied";
    if (Notification.permission !== "default") return Notification.permission;
    try { return await Notification.requestPermission(); } catch (e) { return "denied"; }
  }
  const sonarNotificacion = () => reproducir(SONIDO_NOTI);

  // título, cuerpo -> notificación del sistema + sonido NOTI.mp3
  function notificar(titulo, cuerpo) {
    sonarNotificacion();
    if (!permisoConcedido()) return;
    try {
      new Notification(titulo, { body: cuerpo, icon: new URL("../Iconos/Logo.png", BASE).href });
    } catch (e) { /* algunos móviles exigen service worker */ }
  }

  async function alIniciarSesion() {
    let nuevo = false;
    try { nuevo = sessionStorage.getItem(FLAG_LOGIN) === "1"; sessionStorage.removeItem(FLAG_LOGIN); } catch (e) { /* ignorar */ }
    if (!nuevo) return;
    reproducir(SONIDO_INICIO);                         // solo al iniciar sesión
  }

  document.addEventListener("DOMContentLoaded", alIniciarSesion);

  return { permisoConcedido, pedirPermiso, sonarNotificacion, notificar };
})();
