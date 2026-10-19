// ===== CONFIGURACIÓN SUPABASE - ROVANT =====
const SUPABASE_URL = 'https://dvqvzefcxazlgkhsosed.supabase.co';

// 🔑 REEMPLAZA ESTO con tu Publishable key completa
const SUPABASE_ANON_KEY = 'sb_publishable_Q9VtQm75X_BvBS5e3Slm_g_Jjtt3PWh';

// Cliente global de Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== CLOUDFLARE R2 (APKs) =====
// La URL del Worker NO va en el código: vive en Supabase (tabla configuracion_app, clave 'r2_worker_url').
let R2_WORKER_URL = '';

// Acepta solo una URL https real (descarta el texto de ejemplo "tu-subdominio")
function normalizarUrlR2(v) {
  let u = String(v || '').trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  return /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(u) && !/tu-subdominio/i.test(u) ? u : '';
}

async function cargarR2Config() {
  if (R2_WORKER_URL) return R2_WORKER_URL;
  // caché de sesión solo si es válida (descarta valores viejos o de ejemplo)
  try { R2_WORKER_URL = normalizarUrlR2(sessionStorage.getItem('rovant_r2_url')); } catch (e) { /* ignorar */ }
  if (R2_WORKER_URL) return R2_WORKER_URL;
  try { sessionStorage.removeItem('rovant_r2_url'); } catch (e) { /* ignorar */ }

  const { data, error } = await supabaseClient.from('configuracion_app').select('valor').eq('clave', 'r2_worker_url').maybeSingle();
  if (error || !data) throw new Error('No se encontró la configuración de R2 en Supabase (configuracion_app.r2_worker_url).');
  R2_WORKER_URL = normalizarUrlR2(data.valor);
  if (!R2_WORKER_URL) throw new Error('La URL de R2 en Supabase no es válida: "' + data.valor + '". Actualiza configuracion_app.r2_worker_url.');
  try { sessionStorage.setItem('rovant_r2_url', R2_WORKER_URL); } catch (e) { /* ignorar */ }
  return R2_WORKER_URL;
}

// Los APKs nuevos se guardan como "r2/<archivo>.apk"; los antiguos siguen en Supabase Storage.
// Para los de R2, llama antes a: await cargarR2Config()
function urlDescargaApk(filePath, nombreArchivo) {
  if (filePath && filePath.startsWith('r2/')) {
    const q = nombreArchivo ? '?name=' + encodeURIComponent(nombreArchivo) : '';
    return R2_WORKER_URL + '/apk/' + encodeURIComponent(filePath.slice(3)) + q;
  }
  return supabaseClient.storage.from('apks').getPublicUrl(filePath).data.publicUrl;
}
