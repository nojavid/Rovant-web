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
   ANUNCIOS — texto, imagen, video, audio o PDF
   El archivo se guarda en Cloudflare R2 (Worker: /media/<archivo>) y la
   información en Supabase (tabla "anuncios", ver anuncios.sql).
   Un solo anuncio puede estar "activo" (seleccionado) a la vez.
   ============================================================ */
const TIPOS_ANUNCIO = {
  texto:  { nombre: "Texto",  accept: "",                ext: [] },
  imagen: { nombre: "Imagen", accept: "image/*",         ext: ["png", "jpg", "jpeg", "gif", "webp"] },
  video:  { nombre: "Video",  accept: "video/*",         ext: ["mp4", "webm", "mov"] },
  audio:  { nombre: "Audio",  accept: "audio/*",         ext: ["mp3", "ogg", "wav"] },
  pdf:    { nombre: "PDF",    accept: "application/pdf", ext: ["pdf"] }
};
const MAX_ANUNCIO_BYTES = 100 * 1024 * 1024;

/* Catálogo de imágenes de Iconos/Anucios/. DeepSeek elige una según su descripción
   (no ve la imagen, solo este texto). Para agregar una: sube el archivo a la carpeta
   y añade aquí una línea con una descripción clara. */
const CARPETA_IMAGENES = "Iconos/Anucios/";
const IMAGENES_ANUNCIO = [
  { archivo: "Grafiti.png", descripcion: "Logo Rovant en grafiti con el robot verde dibujando un vehículo con un lápiz; ideal para anuncios de bienvenida, novedades generales o marca." },
  { archivo: "Login2.png", descripcion: "Robot verde con traje blanco tomando notas en una libreta; ideal para cambios en registro, inicio de sesión, cuentas, reportes o tareas." },
  { archivo: "halo2.png", descripcion: "Robot verde conduciendo un carro pequeño; ideal para anuncios de mapa, conducción, velocímetro, ruta o movilidad." }
];
let anuncios = [];
let anuncioPorEliminar = null;

const $an = id => document.getElementById(id);
const escAn = t => String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function urlMedia(a) {
  if (a.file_path && a.file_path.startsWith("local/")) return "../../" + a.file_path.slice(6);   // imagen del catálogo
  return a.file_path && a.file_path.startsWith("r2/")
    ? `${R2_WORKER_URL}/media/${encodeURIComponent(a.file_path.slice(3))}` : "";
}

const imagenCatalogo = () => $an("anImagen").value;

/* ---------- Anuncio con diseño de la IA ----------
   La IA solo elige valores de listas cerradas (acento, fuente, alineación, fondo);
   el HTML y el CSS los controla la página. El texto sigue este formato:
   línea 1 = subtítulo; luego "<emoji> Encabezado — descripción" por línea. */
let estiloIA = null;
const ICONO_ITEM = /^(\p{Extended_Pictographic}(?:️|‍|\p{Extended_Pictographic})*)\s*(.*)$/u;

function htmlDisenado({ titulo, texto, estilo, img, meta, clase = "", insignia = "", acciones = "" }) {
  const e = estilo || {};
  const lineas = String(texto || "").split("\n").map(l => l.trim()).filter(Boolean);
  const sub = lineas.length && !ICONO_ITEM.test(lineas[0]) ? lineas.shift() : "";
  const items = lineas.map(l => {
    const m = l.match(ICONO_ITEM);
    const ico = m ? m[1] : "•";
    const [enc, ...desc] = (m ? m[2] : l).split(" — ");
    return `<li><span class="an-d-ico">${escAn(ico)}</span><div>${desc.length
      ? `<strong>${escAn(enc)}</strong><span>${escAn(desc.join(" — "))}</span>` : `<span>${escAn(enc)}</span>`}</div></li>`;
  }).join("");
  const cls = ["acento", "fuente", "alineacion", "fondo"].map(k => `an-${k}-${String(e[k] || "").replace(/[^a-z]/g, "")}`).join(" ");
  return `<article class="an-card an-d ${cls} ${clase}">
      <div class="an-d-cuerpo">
        ${insignia}
        <h4 class="an-d-titulo${titulo ? "" : " an-placeholder"}">${escAn(titulo || "Título del anuncio")}</h4>
        ${sub ? `<p class="an-d-sub">${escAn(sub)}</p>` : ""}
        ${items ? `<ul class="an-d-lista">${items}</ul>` : ""}
        <small class="an-meta">${meta}</small>
      </div>
      ${img ? `<img class="an-d-img" src="${img}" alt="" loading="lazy">` : ""}
      ${acciones}
    </article>`;
}

function tamanoLegible(b) {
  const n = Number(b) || 0;
  return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";
}

/* ---------- Lista ---------- */
async function cargarAnuncios() {
  const cont = $an("anunciosLista");
  const { data, error } = await supabaseClient.from("anuncios").select("*").order("created_at", { ascending: false });
  if (error) {
    cont.innerHTML = `<p class="anuncios-vacio">No se pudieron cargar los anuncios. Ejecuta anuncios.sql en el SQL Editor de Supabase.</p>`;
    return;
  }
  anuncios = data || [];
  await cargarR2Config().catch(() => {});
  renderAnuncios();
}

const esImagenCatalogo = a => (a.file_path || "").startsWith("local/");

function vistaPrevia(a) {
  const u = urlMedia(a);
  if (esImagenCatalogo(a)) return "";   // se dibuja debajo del texto (ver imagenAbajo)
  if (a.tipo === "imagen" && u) return `<img class="an-media" src="${u}" alt="${escAn(a.titulo)}" loading="lazy">`;
  if (a.tipo === "video" && u) return `<video class="an-media" src="${u}" controls preload="metadata"></video>`;
  if (a.tipo === "audio" && u) return `<audio class="an-audio" src="${u}" controls preload="none"></audio>`;
  if (a.tipo === "pdf" && u) return `<a class="an-pdf" href="${u}" target="_blank" rel="noopener">📄 ${escAn(a.file_name || "Abrir PDF")}</a>`;
  return "";
}

function renderAnuncios() {
  const cont = $an("anunciosLista");
  if (!anuncios.length) {
    cont.innerHTML = `<p class="anuncios-vacio">Aún no hay anuncios. Pulsa "Anuncio" para crear el primero.</p>`;
    return;
  }
  cont.innerHTML = anuncios.map(a => {
    const fecha = new Date(a.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
    const acciones = `<div class="an-acciones">
          <button type="button" class="an-btn" data-accion="seleccionar" data-id="${a.id}">${a.activo ? "Quitar selección" : "Seleccionar"}</button>
          <button type="button" class="an-btn an-btn-del" data-accion="eliminar" data-id="${a.id}">Eliminar</button>
        </div>`;
    if (a.estilo) {
      return htmlDisenado({
        titulo: a.titulo, texto: a.texto, estilo: a.estilo, img: urlMedia(a), acciones,
        clase: a.activo ? "an-activo" : "", insignia: a.activo ? `<span class="an-badge">Seleccionado</span>` : "",
        meta: `Equipo Rovant · ${fecha}`
      });
    }
    return `<article class="an-card${a.activo ? " an-activo" : ""}">
        ${vistaPrevia(a)}
        <div class="an-cuerpo">
          <div class="an-fila">
            <span class="an-tipo">${TIPOS_ANUNCIO[a.tipo] ? TIPOS_ANUNCIO[a.tipo].nombre : escAn(a.tipo)}</span>
            ${a.activo ? `<span class="an-badge">Seleccionado</span>` : ""}
          </div>
          <h4 class="an-titulo">${escAn(a.titulo)}</h4>
          ${a.texto ? `<p class="an-texto">${escAn(a.texto)}</p>` : ""}
          <small class="an-meta">Equipo Rovant · ${fecha}${a.file_size ? " · " + tamanoLegible(a.file_size) : ""}</small>
        </div>
        ${esImagenCatalogo(a) ? `<img class="an-media an-media-abajo" src="${urlMedia(a)}" alt="" loading="lazy">` : ""}
        ${acciones}
      </article>`;
  }).join("");
}

async function seleccionarAnuncio(id) {
  const a = anuncios.find(x => String(x.id) === String(id));
  if (!a) return;
  const nuevo = !a.activo;
  // primero se quita la selección a todos; luego se marca el elegido
  let r = await supabaseClient.from("anuncios").update({ activo: false }).eq("activo", true).select();
  if (r.error) return mostrarModal("Error", r.error.message, true);
  if (nuevo) {
    r = await supabaseClient.from("anuncios").update({ activo: true }).eq("id", a.id).select();
    if (r.error) return mostrarModal("Error", r.error.message, true);
    if (!r.data || !r.data.length) return mostrarModal("Error", "Supabase no permitió actualizar el anuncio (revisa anuncios.sql).", true);
  }
  await cargarAnuncios();
}

/* ---------- Vista previa (antes de publicar) ---------- */
let urlPreview = "";
function liberarPreview() { if (urlPreview) { URL.revokeObjectURL(urlPreview); urlPreview = ""; } }

function actualizarPreview() {
  const tipo = $an("anTipo").value;
  const titulo = $an("anTitulo").value.trim();
  const texto = $an("anTexto").value.trim();
  const archivo = $an("anArchivo").files[0];
  const ext = archivo ? (archivo.name.split(".").pop() || "").toLowerCase() : "";
  const valido = archivo && TIPOS_ANUNCIO[tipo].ext.includes(ext);

  liberarPreview();
  let media = "";
  if (valido) {
    urlPreview = URL.createObjectURL(archivo);
    if (tipo === "imagen") media = `<img class="an-media" src="${urlPreview}" alt="">`;
    else if (tipo === "video") media = `<video class="an-media" src="${urlPreview}" controls preload="metadata"></video>`;
    else if (tipo === "audio") media = `<audio class="an-audio" src="${urlPreview}" controls></audio>`;
    else if (tipo === "pdf") media = `<span class="an-pdf">📄 ${escAn(archivo.name)}</span>`;
  } else if (tipo !== "texto") {
    media = `<div class="an-vacio-media">${archivo ? "Formato no válido para este tipo" : "Aún no has elegido un archivo"}</div>`;
  }
  const imagenAbajo = tipo === "texto" && imagenCatalogo()
    ? `<img class="an-media an-media-abajo" src="../../${CARPETA_IMAGENES}${encodeURIComponent(imagenCatalogo())}" alt="">` : "";
  if (estiloIA && tipo === "texto") {
    $an("anPreview").innerHTML = htmlDisenado({
      titulo, texto, estilo: estiloIA, img: imagenCatalogo() ? `../../${CARPETA_IMAGENES}${encodeURIComponent(imagenCatalogo())}` : "",
      meta: `Equipo Rovant · ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}`
    });
    return;
  }
  $an("anPreview").innerHTML = `<article class="an-card">
      ${media}
      <div class="an-cuerpo">
        <div class="an-fila"><span class="an-tipo">${TIPOS_ANUNCIO[tipo].nombre}</span></div>
        <h4 class="an-titulo${titulo ? "" : " an-placeholder"}">${escAn(titulo || "Título del anuncio")}</h4>
        ${texto ? `<p class="an-texto">${escAn(texto)}</p>` : (tipo === "texto" ? `<p class="an-texto an-placeholder">El mensaje aparecerá aquí</p>` : "")}
        <small class="an-meta">Equipo Rovant · ${new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}${valido ? " · " + tamanoLegible(archivo.size) : ""}</small>
      </div>
      ${imagenAbajo}
    </article>`;
}

/* ---------- Crear ---------- */
function abrirFormAnuncio() {
  $an("anuncioForm").reset();
  $an("anError").textContent = "";
  $an("anRegenerar").hidden = true;
  estiloIA = null;
  actualizarFormTipo();
  actualizarPreview();
  $an("anuncioOverlay").hidden = false;
}
const cerrarFormAnuncio = () => { liberarPreview(); $an("anuncioOverlay").hidden = true; };

function actualizarFormTipo() {
  const tipo = $an("anTipo").value;
  const t = TIPOS_ANUNCIO[tipo];
  const conArchivo = tipo !== "texto";
  $an("anArchivoWrap").hidden = !conArchivo;
  $an("anImagenWrap").hidden = conArchivo;
  if (conArchivo) $an("anImagen").value = "";
  $an("anArchivo").accept = t.accept;
  $an("anArchivoHint").textContent = conArchivo ? `(${t.ext.join(", ")} · máx. 100 MB)` : "";
  $an("anTexto").required = !conArchivo;
  $an("anTextoOpc").textContent = conArchivo ? "(opcional)" : "(obligatorio)";
}

async function guardarAnuncio(e) {
  e.preventDefault();
  let tipo = $an("anTipo").value;
  const conImagenCatalogo = tipo === "texto" && !!imagenCatalogo();   // se guarda como anuncio de imagen
  const conEstilo = tipo === "texto" && !!estiloIA;
  const titulo = $an("anTitulo").value.trim();
  const texto = $an("anTexto").value.trim();
  const archivo = $an("anArchivo").files[0];
  const err = m => { $an("anError").textContent = m; };
  err("");
  if (!titulo) return err("Escribe un título.");
  if (tipo === "texto" && !texto) return err("Escribe el mensaje del anuncio.");

  let file_path = null, file_name = null, file_size = null, nombreR2 = null;
  const btn = $an("anGuardar");
  const user = obtenerUsuarioLogueado();
  const userId = (user && user.id) || (typeof usuarioActual !== "undefined" && usuarioActual && usuarioActual.id) || "";
  if (!userId) return err("No se encontró tu sesión. Cierra sesión y vuelve a entrar.");
  btn.disabled = true; btn.textContent = "Guardando...";

  try {
    if (tipo !== "texto") {
      if (!archivo) throw new Error("Selecciona un archivo.");
      const ext = (archivo.name.split(".").pop() || "").toLowerCase();
      if (!TIPOS_ANUNCIO[tipo].ext.includes(ext)) throw new Error(`Para "${TIPOS_ANUNCIO[tipo].nombre}" usa: ${TIPOS_ANUNCIO[tipo].ext.join(", ")}.`);
      if (archivo.size > MAX_ANUNCIO_BYTES) throw new Error("El archivo supera el límite de 100 MB.");
      nombreR2 = `${Date.now()}_${archivo.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      await cargarR2Config();
      const resp = await fetch(`${R2_WORKER_URL}/media/${encodeURIComponent(nombreR2)}`, {
        method: "PUT", headers: { "X-User-Id": String(userId) }, body: archivo
      });
      if (!resp.ok) {
        let m = "No se pudo subir el archivo (" + resp.status + ")";
        try { m = (await resp.json()).error || m; } catch (x) { /* ignorar */ }
        throw new Error(m);
      }
      file_path = "r2/" + nombreR2; file_name = archivo.name; file_size = archivo.size;
    }
    if (conImagenCatalogo) {
      tipo = "imagen"; file_path = "local/" + CARPETA_IMAGENES + imagenCatalogo(); file_name = imagenCatalogo();
    }
    const { error } = await supabaseClient.from("anuncios").insert([{
      tipo, titulo, texto: texto || null, file_path, file_name, file_size,
      ...(conEstilo ? { estilo: estiloIA } : {}),
      creado_por: "Equipo Rovant"
    }]);
    if (error) {
      // no dejar el archivo huérfano en R2
      if (nombreR2) fetch(`${R2_WORKER_URL}/media/${encodeURIComponent(nombreR2)}`, { method: "DELETE", headers: { "X-User-Id": String(userId) } }).catch(() => {});
      throw error;
    }
    cerrarFormAnuncio();
    await cargarAnuncios();
  } catch (x) {
    err(x.message || "No se pudo publicar el anuncio.");
  } finally {
    btn.disabled = false; btn.textContent = "Guardar";
  }
}

/* ---------- Generar con IA (DeepSeek vía Worker, lee la tabla "cambios") ---------- */
async function generarConIA() {
  const user = obtenerUsuarioLogueado();
  const userId = (user && user.id) || "";
  if (!userId) return mostrarModal("Error", "No se encontró tu sesión. Cierra sesión y vuelve a entrar.");
  const btns = [$an("btnGenerarIA"), $an("anRegenerar")];
  const etiquetas = btns.map(b => b.textContent);
  btns.forEach(b => { b.disabled = true; b.textContent = "Generando..."; });
  try {
    await cargarR2Config();
    const resp = await fetch(`${R2_WORKER_URL}/ai/anuncio`, {
      method: "POST",
      headers: { "X-User-Id": String(userId), "Content-Type": "application/json" },
      body: JSON.stringify({ imagenes: IMAGENES_ANUNCIO })
    });
    const out = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(out.error || "No se pudo generar el anuncio (" + resp.status + ")");
    // un Worker sin republicar no devuelve imagen ni estilo
    if (!out.estilo) mostrarModal("Worker desactualizado", "La IA respondió sin imagen ni diseño: el Worker de Cloudflare sigue con la versión anterior. Publícalo de nuevo (npx wrangler deploy).");
    // abre el formulario con el borrador para revisarlo, editarlo y guardarlo
    $an("anuncioForm").reset();
    $an("anError").textContent = "";
    $an("anTipo").value = "texto";
    actualizarFormTipo();
    $an("anTitulo").value = out.titulo;
    $an("anTexto").value = out.texto;
    $an("anImagen").value = out.imagen || "";
    if (out.imagen && $an("anImagen").value !== out.imagen) console.warn("La imagen elegida por la IA no está en IMAGENES_ANUNCIO:", out.imagen);
    estiloIA = out.estilo || null;
    actualizarPreview();
    $an("anRegenerar").hidden = false;
    $an("anuncioOverlay").hidden = false;
  } catch (e) {
    mostrarModal("No se pudo generar con IA", e.message);
  } finally {
    btns.forEach((b, i) => { b.disabled = false; b.textContent = etiquetas[i]; });
  }
}

/* ---------- Eliminar (primero el registro, luego el archivo) ---------- */
function pedirEliminarAnuncio(id) {
  anuncioPorEliminar = anuncios.find(x => String(x.id) === String(id)) || null;
  if (!anuncioPorEliminar) return;
  $an("anDelText").textContent = `Se eliminará "${anuncioPorEliminar.titulo}"${(anuncioPorEliminar.file_path || "").startsWith("r2/") ? " y su archivo de Cloudflare R2" : ""}. Esta acción no se puede deshacer.`;
  $an("anDelOverlay").hidden = false;
}
const cerrarEliminarAnuncio = () => { anuncioPorEliminar = null; $an("anDelOverlay").hidden = true; };

async function eliminarAnuncioConfirmado() {
  const a = anuncioPorEliminar;
  if (!a) return;
  const btn = $an("anDelOk");
  btn.disabled = true; btn.textContent = "Eliminando...";
  try {
    const { data, error } = await supabaseClient.from("anuncios").delete().eq("id", a.id).select();
    if (error) throw error;
    if (!data || !data.length) throw new Error("Supabase no permitió borrar el anuncio (revisa anuncios.sql).");
    if (a.file_path && a.file_path.startsWith("r2/")) {
      await cargarR2Config();
      const user = obtenerUsuarioLogueado();
      const resp = await fetch(`${R2_WORKER_URL}/media/${encodeURIComponent(a.file_path.slice(3))}`, {
        method: "DELETE", headers: { "X-User-Id": String((user && user.id) || "") }
      });
      if (!resp.ok) throw new Error(`El anuncio se borró, pero el archivo quedó en R2 (${a.file_path.slice(3)}). Bórralo desde Cloudflare.`);
    }
    cerrarEliminarAnuncio();
    await cargarAnuncios();
  } catch (e) {
    cerrarEliminarAnuncio();
    await cargarAnuncios();
    mostrarModal("Error al eliminar", e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = "Eliminar";
  }
}

/* ---------- Aviso ---------- */
function mostrarModal(titulo, mensaje) {
  $an("anAvisoTitulo").textContent = titulo;
  $an("anAvisoTexto").textContent = mensaje;
  $an("anAviso").hidden = false;
}

/* ---------- Eventos ---------- */
document.addEventListener("DOMContentLoaded", () => {
  inicializarCerrarSesion();
  inicializarMenuMovil();
  inicializarArrastreMenu();
  cargarHeaderUsuario();
  $an("anAvisoOk").addEventListener("click", () => { $an("anAviso").hidden = true; });
  $an("btnNuevoAnuncio").addEventListener("click", abrirFormAnuncio);
  $an("anImagen").innerHTML = `<option value="">Sin imagen</option>` +
    IMAGENES_ANUNCIO.map(i => `<option value="${escAn(i.archivo)}">${escAn(i.archivo)}</option>`).join("");
  $an("anImagen").addEventListener("change", actualizarPreview);
  $an("btnGenerarIA").addEventListener("click", generarConIA);
  $an("anRegenerar").addEventListener("click", generarConIA);
  $an("anCancelar").addEventListener("click", cerrarFormAnuncio);
  $an("anTipo").addEventListener("change", () => { $an("anArchivo").value = ""; estiloIA = null; actualizarFormTipo(); actualizarPreview(); });
  ["anTitulo", "anTexto"].forEach(id => $an(id).addEventListener("input", actualizarPreview));
  $an("anArchivo").addEventListener("change", actualizarPreview);
  $an("anuncioForm").addEventListener("submit", guardarAnuncio);
  $an("anDelCancel").addEventListener("click", cerrarEliminarAnuncio);
  $an("anDelOk").addEventListener("click", eliminarAnuncioConfirmado);
  $an("anuncioOverlay").addEventListener("click", e => { if (e.target === $an("anuncioOverlay")) cerrarFormAnuncio(); });
  $an("anDelOverlay").addEventListener("click", e => { if (e.target === $an("anDelOverlay")) cerrarEliminarAnuncio(); });
  $an("anunciosLista").addEventListener("click", e => {
    const b = e.target.closest("[data-accion]");
    if (!b) return;
    if (b.dataset.accion === "seleccionar") seleccionarAnuncio(b.dataset.id);
    else pedirEliminarAnuncio(b.dataset.id);
  });
  cargarAnuncios();
});
