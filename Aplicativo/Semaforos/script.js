/* ============================================================
   VARIABLES GLOBALES
   ============================================================ */
const TABLA = "semaforos_tiempos";
const CACHE_GEO = "rovant_geo_semaforos_v1";
const COLS_OCULTAS_TABLA = ["id", "user_id", "lat", "lng"];
const COLS_SOLO_LECTURA = ["id", "user_id", "creado_el", "created_at", "updated_at", "actualizado_el"];
const DIRECCIONES = ["recto", "izquierda", "derecha"];

let registros = [];
let columnas = [];
let geoCache = {};
let abiertos = new Set();   // vías desplegadas
let cerrados = new Set();   // localidades plegadas por el usuario
let registroEditando = null;
let registroEliminando = null;
let geocodificando = false;

/* ============================================================
   UTILIDADES
   ============================================================ */
function escapeHtml(t) {
  return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function normalizar(t) {
  return (t || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function esFecha(col) {
  return /(_el|_at|fecha)$/i.test(col);
}

function formatearValor(col, v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (esFecha(col)) {
    const d = new Date(v);
    if (!isNaN(d)) return d.toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
  }
  if (/^tiempo_/.test(col)) return v + " s";
  return v;
}

function etiqueta(col) {
  const s = col.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function claveSemaforo(r) {
  return Number(r.lat).toFixed(5) + "," + Number(r.lng).toFixed(5);
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
   GEOCODIFICACIÓN INVERSA (localidad y calle desde lat/lng)
   Solo se usa cuando la tabla no trae columnas localidad/calle.
   ============================================================ */
function cargarCacheGeo() {
  try { geoCache = JSON.parse(localStorage.getItem(CACHE_GEO) || "{}"); } catch (e) { geoCache = {}; }
}

function guardarCacheGeo() {
  try { localStorage.setItem(CACHE_GEO, JSON.stringify(geoCache)); } catch (e) { /* ignorar */ }
}

function ubicacionDeRegistro(r) {
  const colLoc = columnas.find(c => normalizar(c) === "localidad");
  const colCalle = columnas.find(c => ["calle", "via", "nombre_via", "street"].includes(normalizar(c)));
  if ((colLoc && r[colLoc]) || (colCalle && r[colCalle])) {
    return { localidad: (colLoc && r[colLoc]) || "Sin localidad", calle: (colCalle && r[colCalle]) || "Sin nombre de vía" };
  }
  const g = geoCache[claveSemaforo(r)];
  return g || { localidad: "Ubicando...", calle: "Ubicando...", pendiente: true };
}

async function geocodificarPendientes() {
  if (geocodificando) return;
  geocodificando = true;
  const pendientes = [...new Set(registros.filter(r => ubicacionDeRegistro(r).pendiente).map(claveSemaforo))];
  for (const clave of pendientes) {
    const [lat, lng] = clave.split(",");
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=es&lat=${lat}&lon=${lng}`);
      if (resp.ok) {
        const a = (await resp.json()).address || {};
        geoCache[clave] = {
          localidad: a.city_district || a.suburb || a.borough || a.neighbourhood || a.city || a.town || "Sin localidad",
          calle: a.road || a.pedestrian || a.footway || "Sin nombre de vía"
        };
        guardarCacheGeo();
        renderTodo();
      }
    } catch (e) { console.warn("Geocodificación falló:", e); }
    await new Promise(res => setTimeout(res, 1100)); // límite de uso de Nominatim: 1 req/s
  }
  geocodificando = false;
  document.getElementById("semStatus").textContent = "";
}

/* ============================================================
   CARGA DE DATOS
   ============================================================ */
function mensajeError(error) {
  if (error && (error.code === "42501" || /permission denied|row-level security/i.test(error.message || ""))) {
    return "Sin permisos en Supabase para esta operación. Ejecuta el archivo Semaforos/permisos.sql en el SQL Editor de Supabase.";
  }
  return (error && error.message) || "Error desconocido";
}

async function cargarSemaforos() {
  const lista = document.getElementById("semList");
  try {
    const { data, error } = await supabaseClient.from(TABLA).select("*").order("creado_el", { ascending: false });
    if (error) throw error;
    registros = data || [];
    const set = new Set();
    registros.forEach(r => Object.keys(r).forEach(k => set.add(k)));
    columnas = [...set];
    renderTodo();
    if (registros.some(r => ubicacionDeRegistro(r).pendiente)) {
      document.getElementById("semStatus").textContent = "Obteniendo localidad y calle desde las coordenadas...";
      geocodificarPendientes();
    }
  } catch (err) {
    console.error("Error al cargar semáforos:", err);
    lista.innerHTML = `<div class="org-empty" style="color:#D32F2F">${escapeHtml(mensajeError(err))}</div>`;
  }
}

/* ============================================================
   AGRUPACIÓN Y RENDER
   Localidad → vía → semáforo (misma coordenada) → registros
   ============================================================ */
function agrupar(filtrados) {
  const locs = new Map();
  filtrados.forEach(r => {
    const u = ubicacionDeRegistro(r);
    if (!locs.has(u.localidad)) locs.set(u.localidad, new Map());
    const calles = locs.get(u.localidad);
    if (!calles.has(u.calle)) calles.set(u.calle, new Map());
    const sems = calles.get(u.calle);
    const k = claveSemaforo(r);
    if (!sems.has(k)) sems.set(k, []);
    sems.get(k).push(r);
  });
  return locs;
}

function filtrarRegistros() {
  const q = normalizar(document.getElementById("buscador").value);
  const loc = document.getElementById("filtroLocalidad").value;
  return registros.filter(r => {
    const u = ubicacionDeRegistro(r);
    if (loc && u.localidad !== loc) return false;
    if (!q) return true;
    return normalizar(`${u.localidad} ${u.calle} ${r.lat} ${r.lng} ${r.direccion || ""}`).includes(q);
  });
}

function textoSemaforos(n) { return `${n} semáforo${n === 1 ? "" : "s"}`; }

function filaHTML(r) {
  const cols = columnas.filter(c => !COLS_OCULTAS_TABLA.includes(c));
  const celdas = cols.map(c => {
    const v = r[c];
    let cls = "";
    if (c === "tiempo_rojo") cls = "t-rojo";
    else if (c === "tiempo_verde") cls = "t-verde";
    else if (c === "validado") cls = v ? "ok" : "no";
    return `<td data-label="${escapeHtml(etiqueta(c))}" class="${cls}">${escapeHtml(formatearValor(c, v))}</td>`;
  }).join("");
  return `<tr>${celdas}<td class="acciones">
      <button class="icon-btn" data-accion="editar" data-id="${escapeHtml(r.id)}" title="Editar">✎</button>
      <button class="icon-btn del" data-accion="eliminar" data-id="${escapeHtml(r.id)}" title="Eliminar">🗑</button>
    </td></tr>`;
}

/* ============================================================
   PENDIENTES DE VALIDAR (mañana / tarde / noche)
   La franja sale de una columna franja/jornada/turno si existe;
   si no, de la hora de creado_el.
   ============================================================ */
const FRANJAS = [
  { id: "manana", nombre: "Mañana" },
  { id: "tarde", nombre: "Tarde" },
  { id: "noche", nombre: "Noche" }
];

function franjaDeRegistro(r) {
  const col = columnas.find(c => ["franja", "jornada", "turno", "franja_horaria"].includes(normalizar(c)));
  if (col && r[col]) {
    const v = normalizar(r[col]);
    if (v.startsWith("man")) return "manana";
    if (v.startsWith("tar")) return "tarde";
    if (v.startsWith("noc")) return "noche";
  }
  const d = new Date(r.creado_el || r.created_at);
  if (isNaN(d)) return null;
  const h = d.getHours();
  if (h >= 5 && h < 12) return "manana";
  if (h >= 12 && h < 18) return "tarde";
  return "noche";
}

function renderPendientes() {
  const cont = document.getElementById("valList");
  const porSem = new Map();
  filtrarRegistros().forEach(r => {
    const k = claveSemaforo(r);
    if (!porSem.has(k)) porSem.set(k, []);
    porSem.get(k).push(r);
  });

  const pendientes = [], coordinados = [];
  porSem.forEach((rows, k) => {
    const franjas = {};
    rows.forEach(r => {
      const f = franjaDeRegistro(r);
      if (f) (franjas[f] = franjas[f] || []).push(r);
    });
    const faltan = FRANJAS.filter(f => !franjas[f.id]);
    (faltan.length ? pendientes : coordinados).push({ k, rows, franjas, faltan });
  });

  renderCarrusel("valList", "valContador", pendientes,
    "Todos los semáforos tienen mañana, tarde y noche registradas.");
  renderCarrusel("coordList", "coordContador", coordinados,
    "Aún no hay semáforos con las tres franjas validadas.");
}

function renderCarrusel(idLista, idContador, items, textoVacio) {
  const cont = document.getElementById(idLista);
  if (!items.length) {
    cont.innerHTML = `<div class="org-empty">${textoVacio}</div>`;
    actualizarContadorValidar(cont, idContador);
    return;
  }

  cont.innerHTML = items.map(({ k, rows, franjas, faltan }) => {
    const u = ubicacionDeRegistro(rows[0]);
    const [lat, lng] = k.split(",");
    const celdas = FRANJAS.map(f => {
      const regs = franjas[f.id];
      if (!regs) return `<div class="val-franja falta">
          <span class="val-franja-nombre">${f.nombre}</span>
          <span class="val-falta">Por validar</span>
        </div>`;
      const lineas = regs.map(r => `<div class="val-tiempos">
          ${r.direccion ? `<span class="val-dir">${escapeHtml(r.direccion)}</span>` : ""}
          <span class="val-t rojo"><i></i>${escapeHtml(r.tiempo_rojo ?? "—")}<small>s</small></span>
          <span class="val-t verde"><i></i>${escapeHtml(r.tiempo_verde ?? "—")}<small>s</small></span>
        </div>`).join("");
      return `<div class="val-franja ok">
          <span class="val-franja-nombre">${f.nombre}</span>${lineas}
        </div>`;
    }).join("");
    return `<div class="sem-card val-card">
        <div class="val-head">
          <div class="val-titulo">
            <span class="val-calle">${escapeHtml(u.calle)}</span>
            <span class="val-loc">${escapeHtml(u.localidad)}</span>
          </div>
          <a class="val-mapa" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${lat},${lng}" title="${escapeHtml(lat)}, ${escapeHtml(lng)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            Ver en mapa
          </a>
        </div>
        <div class="val-franjas">${celdas}</div>
        ${faltan.length
          ? `<div class="val-pie">Faltan: ${faltan.map(f => f.nombre.toLowerCase()).join(" · ")}</div>`
          : `<div class="val-pie ok">Coordinado · mañana, tarde y noche validadas</div>`}
      </div>`;
  }).join("");
  cont.scrollLeft = 0;
  actualizarContadorValidar(cont, idContador);
}

function actualizarContadorValidar(cont, idContador) {
  const n = cont.querySelectorAll(".val-card").length;
  const i = n ? Math.min(n, Math.round(cont.scrollLeft / cont.clientWidth) + 1) : 0;
  document.getElementById(idContador).textContent = n ? `${i} de ${n} · desliza para ver el siguiente` : "";
}

function inicializarCarruselValidar() {
  inicializarCarrusel("valList", "valContador");
  inicializarCarrusel("coordList", "coordContador");
}

function inicializarCarrusel(idLista, idContador) {
  const cont = document.getElementById(idLista);
  let down = false, moved = false, startX = 0, startScroll = 0, anim = 0;

  const animarA = destino => {
    cancelAnimationFrame(anim);
    const inicio = cont.scrollLeft, dist = destino - inicio, dur = 450, t0 = performance.now();
    cont.classList.add("arrastrando"); // sin snap mientras anima
    const paso = ahora => {
      const p = Math.min(1, (ahora - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
      cont.scrollLeft = inicio + dist * e;
      if (p < 1) anim = requestAnimationFrame(paso);
      else cont.classList.remove("arrastrando");
    };
    anim = requestAnimationFrame(paso);
  };

  cont.addEventListener("scroll", () => actualizarContadorValidar(cont, idContador));
  cont.addEventListener("mousedown", e => {
    if (e.target.closest("a, button")) return;
    cancelAnimationFrame(anim);
    down = true; moved = false; startX = e.pageX; startScroll = cont.scrollLeft;
    cont.classList.add("arrastrando");
  });
  window.addEventListener("mousemove", e => {
    if (!down) return;
    const dx = e.pageX - startX;
    if (Math.abs(dx) > 3) moved = true;
    cont.scrollLeft = startScroll - dx * 0.9; // leve amortiguación
  });
  window.addEventListener("mouseup", e => {
    if (!down) return;
    down = false;
    const w = cont.clientWidth;
    const base = Math.round(startScroll / w);
    const dx = e.pageX - startX;
    let idx = base;
    if (Math.abs(dx) > w * 0.12) idx = dx < 0 ? base + 1 : base - 1;
    const max = Math.max(0, cont.querySelectorAll(".val-card").length - 1);
    idx = Math.max(0, Math.min(max, idx));
    animarA(idx * (w + 12)); // 12 = gap
  });
  cont.addEventListener("dragstart", e => e.preventDefault());
}

function renderTodo() {
  renderResumenYFiltro();
  renderLista();
  renderPendientes();
}

function renderResumenYFiltro() {
  const todas = agrupar(registros);
  let calles = 0, sems = 0;
  todas.forEach(c => { calles += c.size; c.forEach(s => { sems += s.size; }); });
  document.getElementById("totalSemaforos").textContent = sems;
  document.getElementById("totalRegistros").textContent = registros.length;
  document.getElementById("totalLocalidades").textContent = todas.size;
  document.getElementById("totalCalles").textContent = calles;

  const select = document.getElementById("filtroLocalidad");
  const actual = select.value;
  const nombres = [...todas.keys()].sort((a, b) => a.localeCompare(b, "es"));
  select.innerHTML = `<option value="">Todas las localidades</option>` +
    nombres.map(n => `<option value="${escapeHtml(n)}" ${n === actual ? "selected" : ""}>${escapeHtml(n)}</option>`).join("");

  const lista = document.getElementById("locList");
  lista.innerHTML = nombres.length ? nombres.map(n => {
    let cnt = 0; todas.get(n).forEach(s => { cnt += s.size; });
    return `<button class="dept-item ${n === actual ? "selected" : ""}" data-loc="${escapeHtml(n)}">
        <span class="d-text"><span class="d-name">${escapeHtml(n)}</span><span class="d-count">${textoSemaforos(cnt)}</span></span>
      </button>`;
  }).join("") : `<div class="org-empty">Sin localidades</div>`;
}

function renderLista() {
  const cont = document.getElementById("semList");
  if (!registros.length) {
    cont.innerHTML = `<div class="org-empty">No hay semáforos registrados.</div>`;
    return;
  }
  const grupos = agrupar(filtrarRegistros());
  if (!grupos.size) {
    cont.innerHTML = `<div class="org-empty">Sin resultados.</div>`;
    return;
  }
  const cabeceras = columnas.filter(c => !COLS_OCULTAS_TABLA.includes(c)).map(c => `<th>${escapeHtml(etiqueta(c))}</th>`).join("");

  cont.innerHTML = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([loc, calles]) => {
    let totalLoc = 0; calles.forEach(s => { totalLoc += s.size; });
    const htmlCalles = [...calles.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")).map(([calle, sems]) => {
      const idCalle = `c|${loc}|${calle}`;
      const htmlSems = [...sems.entries()].map(([k, rows]) => {
        const [lat, lng] = k.split(",");
        return `<div class="sem-card">
            <div class="sem-card-head">
              <span class="sem-coords">${escapeHtml(lat)}, ${escapeHtml(lng)}</span>
              <a class="sem-map" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${lat},${lng}">Ver en mapa</a>
            </div>
            <div class="tabla-wrap"><table class="sem-tabla"><thead><tr>${cabeceras}<th></th></tr></thead>
              <tbody>${rows.map(filaHTML).join("")}</tbody></table></div>
          </div>`;
      }).join("");
      return `<details class="sem-calle" data-id="${escapeHtml(idCalle)}" ${abiertos.has(idCalle) ? "open" : ""}>
          <summary><span class="s-name">${escapeHtml(calle)}</span><span class="s-count">${textoSemaforos(sems.size)}</span></summary>
          ${htmlSems}
        </details>`;
    }).join("");
    const idLoc = `l|${loc}`;
    return `<details class="sem-loc" data-id="${escapeHtml(idLoc)}" ${cerrados.has(idLoc) ? "" : "open"}>
        <summary><span class="s-name">${escapeHtml(loc)}</span><span class="s-count">${textoSemaforos(totalLoc)}</span></summary>
        ${htmlCalles}
      </details>`;
  }).join("");
}

/* ============================================================
   EDITAR
   ============================================================ */
function tipoCampo(col) {
  if (col === "direccion") return "direccion";
  const muestra = registros.map(r => r[col]).find(v => v !== null && v !== undefined);
  if (typeof muestra === "boolean") return "bool";
  if (typeof muestra === "number") return "number";
  return "text";
}

function abrirEditar(id) {
  const r = registros.find(x => String(x.id) === String(id));
  if (!r) return;
  registroEditando = r;
  document.getElementById("errorEditar").textContent = "";
  document.getElementById("camposEditar").innerHTML = columnas.map(c => {
    const v = r[c];
    const ro = COLS_SOLO_LECTURA.includes(c) || esFecha(c);
    const tipo = tipoCampo(c);
    let input;
    if (ro) {
      input = `<input type="text" value="${escapeHtml(formatearValor(c, v) === "—" ? "" : (esFecha(c) ? formatearValor(c, v) : v))}" disabled>`;
    } else if (tipo === "bool") {
      input = `<select name="${c}"><option value="true" ${v === true ? "selected" : ""}>Sí</option><option value="false" ${v === false ? "selected" : ""}>No</option></select>`;
    } else if (tipo === "direccion") {
      const ops = DIRECCIONES.includes(v) || !v ? DIRECCIONES : [v, ...DIRECCIONES];
      input = `<select name="${c}">${ops.map(o => `<option value="${escapeHtml(o)}" ${o === v ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`;
    } else if (tipo === "number") {
      input = `<input type="number" step="any" name="${c}" value="${escapeHtml(v ?? "")}">`;
    } else {
      input = `<input type="text" name="${c}" value="${escapeHtml(v ?? "")}">`;
    }
    return `<label class="campo"><span>${escapeHtml(etiqueta(c))}</span>${input}</label>`;
  }).join("");
  document.getElementById("modalEditar").hidden = false;
}

async function guardarEdicion(e) {
  e.preventDefault();
  const r = registroEditando;
  if (!r) return;
  const err = document.getElementById("errorEditar");
  const payload = {};
  document.querySelectorAll("#camposEditar [name]").forEach(el => {
    const col = el.name;
    const tipo = tipoCampo(col);
    let v = el.value;
    if (tipo === "bool") v = v === "true";
    else if (tipo === "number") v = v === "" ? null : Number(v);
    else if (v === "") v = null;
    if (v !== (r[col] ?? null)) payload[col] = v;
  });
  if (!Object.keys(payload).length) { document.getElementById("modalEditar").hidden = true; return; }

  const btn = document.getElementById("btnGuardarEditar");
  btn.disabled = true;
  const { data, error } = await supabaseClient.from(TABLA).update(payload).eq("id", r.id).select();
  btn.disabled = false;
  if (error) { err.textContent = mensajeError(error); return; }
  if (!data || !data.length) { err.textContent = "No se guardó ningún cambio. Revisa las políticas (RLS) de UPDATE en permisos.sql."; return; }
  Object.assign(r, data[0]);
  document.getElementById("modalEditar").hidden = true;
  renderTodo();
  if (registros.some(x => ubicacionDeRegistro(x).pendiente)) geocodificarPendientes();
}

/* ============================================================
   ELIMINAR
   ============================================================ */
function abrirEliminar(id) {
  const r = registros.find(x => String(x.id) === String(id));
  if (!r) return;
  registroEliminando = r;
  document.getElementById("errorEliminar").textContent = "";
  const u = ubicacionDeRegistro(r);
  document.getElementById("textoEliminar").textContent =
    `¿Eliminar el registro (${r.direccion || "sin dirección"}, rojo ${r.tiempo_rojo ?? "—"} s / verde ${r.tiempo_verde ?? "—"} s) en ${u.calle}? Esta acción no se puede deshacer.`;
  document.getElementById("modalEliminar").hidden = false;
}

async function confirmarEliminar() {
  const r = registroEliminando;
  if (!r) return;
  const err = document.getElementById("errorEliminar");
  const btn = document.getElementById("btnConfirmarEliminar");
  btn.disabled = true;
  const { data, error } = await supabaseClient.from(TABLA).delete().eq("id", r.id).select();
  btn.disabled = false;
  if (error) { err.textContent = mensajeError(error); return; }
  if (!data || !data.length) { err.textContent = "No se eliminó nada. Revisa las políticas (RLS) de DELETE en permisos.sql."; return; }
  registros = registros.filter(x => x.id !== r.id);
  document.getElementById("modalEliminar").hidden = true;
  renderTodo();
}

/* ============================================================
   DESCARGAR EXCEL (respaldo de todos los registros, sin filtros)
   ============================================================ */
function descargarExcel() {
  if (typeof XLSX === "undefined") { alert("No se pudo cargar la librería de Excel. Revisa tu conexión."); return; }
  if (!registros.length) { alert("No hay semáforos para descargar."); return; }
  const tieneLoc = columnas.some(c => normalizar(c) === "localidad");
  const tieneCalle = columnas.some(c => ["calle", "via", "nombre_via", "street"].includes(normalizar(c)));
  const filas = registros.map(r => {
    const u = ubicacionDeRegistro(r);
    const f = {};
    if (!tieneLoc) f["localidad"] = u.pendiente ? "" : u.localidad;
    if (!tieneCalle) f["calle"] = u.pendiente ? "" : u.calle;
    columnas.forEach(c => { f[c] = r[c] ?? ""; });
    return f;
  });
  const ws = XLSX.utils.json_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Semaforos");
  XLSX.writeFile(wb, `semaforos_respaldo_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ============================================================
   EVENTOS
   ============================================================ */
function inicializarEventos() {
  document.getElementById("buscador").addEventListener("input", () => { renderLista(); renderPendientes(); });
  document.getElementById("filtroLocalidad").addEventListener("change", () => { renderResumenYFiltro(); renderLista(); renderPendientes(); });
  document.getElementById("btnRecargar").addEventListener("click", cargarSemaforos);
  document.getElementById("btnExcel").addEventListener("click", descargarExcel);

  document.getElementById("locList").addEventListener("click", e => {
    const btn = e.target.closest(".dept-item");
    if (!btn) return;
    const select = document.getElementById("filtroLocalidad");
    select.value = select.value === btn.dataset.loc ? "" : btn.dataset.loc;
    renderResumenYFiltro();
    renderLista();
    renderPendientes();
  });

  const lista = document.getElementById("semList");
  lista.addEventListener("click", e => {
    const b = e.target.closest("[data-accion]");
    if (!b) return;
    b.dataset.accion === "editar" ? abrirEditar(b.dataset.id) : abrirEliminar(b.dataset.id);
  });
  lista.addEventListener("toggle", e => {
    const id = e.target.dataset && e.target.dataset.id;
    if (!id) return;
    const esLoc = id.startsWith("l|");
    if (esLoc) { e.target.open ? cerrados.delete(id) : cerrados.add(id); }
    else { e.target.open ? abiertos.add(id) : abiertos.delete(id); }
  }, true);

  document.getElementById("formEditar").addEventListener("submit", guardarEdicion);
  document.getElementById("btnCancelarEditar").addEventListener("click", () => { document.getElementById("modalEditar").hidden = true; });
  document.getElementById("btnCancelarEliminar").addEventListener("click", () => { document.getElementById("modalEliminar").hidden = true; });
  document.getElementById("btnConfirmarEliminar").addEventListener("click", confirmarEliminar);
  document.querySelectorAll(".modal-back").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.hidden = true; }));
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
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  inicializarCerrarSesion();
  inicializarMenuMovil();
  inicializarArrastreMenu();
  inicializarEventos();
  inicializarCarruselValidar();
  cargarCacheGeo();
  cargarHeaderUsuario();
  await cargarSemaforos();
});
