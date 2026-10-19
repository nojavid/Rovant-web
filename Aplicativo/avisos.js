/* ============================================================
   AVISOS — sonidos, notificaciones y popup de inicio de sesión
   Se carga en Aplicativo.html, Tareas.html y settings.html
   ============================================================ */
const RovantAvisos = (() => {
  const BASE = document.currentScript.src;            // .../Aplicativo/avisos.js
  const urlSonido = f => new URL("../" + f, BASE).href;
  const SONIDO_NOTI = "NOTI.mp3";
  const SONIDO_INICIO = "Rovant Inicio Sonido.mp3";
  const FLAG_LOGIN = "rovant_recien_logueado";

  const usuario = () => {
    try { return JSON.parse(sessionStorage.getItem("rovant_user") || "null"); } catch (e) { return null; }
  };
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignorar */ } }
  };

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

  /* ---------- Preferencia del popup de inicio (por usuario y dispositivo) ---------- */
  const claveP = id => "rovant_popup_inicio_" + id;
  const popupInicioActivo = id => ls.get(claveP(id)) !== "no";
  const setPopupInicio = (id, on) => ls.set(claveP(id), on ? "si" : "no");

  /* ---------- Popup de tareas pendientes ---------- */
  function mostrarPopup(n) {
    const el = document.createElement("div");
    el.className = "rv-popup";
    el.setAttribute("role", "status");
    el.innerHTML = `
      <div class="rv-popup-txt">
        <b>${n > 0 ? "Tienes tareas pendientes" : "Todo al día"}</b>
        <span>${n > 0 ? `Tienes ${n} ${n === 1 ? "tarea pendiente" : "tareas pendientes"}.` : "No tienes tareas pendientes."}</span>
      </div>
      <button type="button" class="rv-popup-x" aria-label="Cerrar">&times;</button>`;
    const st = document.createElement("style");
    st.textContent = `
      .rv-popup{position:fixed;top:16px;right:16px;z-index:9999;display:flex;align-items:center;gap:12px;
        max-width:340px;background:#fff;color:#0C2543;border-left:5px solid #035F81;border-radius:12px;
        padding:14px 14px 14px 16px;box-shadow:0 10px 30px rgba(6,4,72,.25);font-family:inherit;
        animation:rvIn .35s ease}
      .rv-popup-txt{display:flex;flex-direction:column;gap:2px;font-size:14px;flex:1}
      .rv-popup-x{border:0;background:none;font-size:24px;line-height:1;cursor:pointer;color:#0C2543;padding:0 4px;margin-left:auto}
      @keyframes rvIn{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}
      @media (max-width:768px){.rv-popup{top:8px;left:8px;right:8px;max-width:none}}`;
    document.head.appendChild(st);
    document.body.appendChild(el);
    el.querySelector(".rv-popup-x").addEventListener("click", () => el.remove());
  }

  async function alIniciarSesion() {
    let nuevo = false;
    try { nuevo = sessionStorage.getItem(FLAG_LOGIN) === "1"; sessionStorage.removeItem(FLAG_LOGIN); } catch (e) { /* ignorar */ }
    if (!nuevo) return;
    reproducir(SONIDO_INICIO);                         // solo al iniciar sesión
    const u = usuario();
    if (!u || !u.id || !popupInicioActivo(u.id) || typeof supabaseClient === "undefined") return;
    const { data, error } = await supabaseClient.from("tareas_rovant").select("estado, asignados");
    if (error) return;
    const n = (data || []).filter(t => t.estado !== "terminada" && (t.asignados || []).map(String).includes(String(u.id))).length;
    mostrarPopup(n);
  }

  document.addEventListener("DOMContentLoaded", alIniciarSesion);

  return { permisoConcedido, pedirPermiso, sonarNotificacion, notificar, popupInicioActivo, setPopupInicio };
})();
