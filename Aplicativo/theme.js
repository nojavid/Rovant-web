/* ============================================================
   TEMA — claro / oscuro (neón) / auto
   Se carga en <head> de todas las páginas del aplicativo para
   aplicar el tema antes de pintar. Guarda la preferencia en
   localStorage y la sincroniza con configuracion_usuario.tema.
   ============================================================ */
const RovantTema = (() => {
  const CLAVE = "rovant_tema";
  const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  const leer = () => { try { return localStorage.getItem(CLAVE) || "Claro"; } catch (e) { return "Claro"; } };
  const guardar = v => { try { localStorage.setItem(CLAVE, v); } catch (e) { /* ignorar */ } };
  const esOscuro = v => v === "Oscuro" || (v === "Auto" && mq && mq.matches);

  // Cambia Rovant.png <-> Rovant-blanco.png
  function cambiarLogos(oscuro) {
    document.querySelectorAll('img[src*="Rovant.png"], img[src*="Rovant-blanco.png"]').forEach(img => {
      if (img.classList.contains("footer-logo")) return;   // ya es blanco sobre el sidebar
      const src = img.getAttribute("src");
      const nuevo = oscuro ? src.replace("Rovant.png", "Rovant-blanco.png") : src.replace("Rovant-blanco.png", "Rovant.png");
      if (nuevo !== src) img.setAttribute("src", nuevo);
    });
  }

  function aplicar() {
    const oscuro = esOscuro(leer());
    document.documentElement.setAttribute("data-theme", oscuro ? "dark" : "light");
    if (document.body) cambiarLogos(oscuro);
  }

  function set(valor) {
    if (!["Claro", "Oscuro", "Auto"].includes(valor)) return;
    guardar(valor);
    aplicar();
  }

  aplicar();
  document.addEventListener("DOMContentLoaded", aplicar);
  if (mq && mq.addEventListener) mq.addEventListener("change", aplicar);

  // Sincroniza con el tema guardado del usuario (si hay sesión y Supabase)
  window.addEventListener("load", async () => {
    try {
      const u = JSON.parse(sessionStorage.getItem("rovant_user") || "null");
      if (!u || !u.id || typeof supabaseClient === "undefined") return;
      const { data } = await supabaseClient.from("configuracion_usuario").select("tema").eq("user_id", u.id).maybeSingle();
      if (data && data.tema && data.tema !== leer()) set(data.tema);
    } catch (e) { /* ignorar */ }
  });

  return { set, get: leer };
})();
