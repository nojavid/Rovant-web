// ============================
// SERVICE WORKER - ROVANT (Network First)
// ============================
// Estrategia "Network First": intenta siempre descargar la versión
// más reciente desde GitHub Pages. Solo usa la caché si el usuario
// está sin conexión (o si la red tarda demasiado).
// ============================

const CACHE_NAME = 'rovant-cache-v2';

// Archivos mínimos para que la app abra sin conexión.
// Se cachean la primera vez que se visitan con red disponible.
const APP_SHELL = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './Iconos/Logo.png',
  './Iconos/Rovant.png',
  './Iconos/menu.png',
  './Iconos/Android.png',
  './Iconos/descargas.png',
  './Iconos/publicidad_rovant.png',
  './Login/login.html',
  './Login/styles.css',
  './Login/script.js',
  './Login/config.js'
];

// INSTALL: precarga el app shell y activa el nuevo SW de inmediato
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll falla completo si un recurso no existe; usamos add individual tolerante
      return Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] No se pudo precachear:', url, err);
          })
        )
      );
    })
  );
});

// ACTIVATE: elimina cachés antiguas y toma control de las pestañas
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// FETCH: Network First
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo manejamos peticiones GET del mismo origen
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // deja pasar CDNs externos (Supabase)

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Guarda una copia fresca de la respuesta válida
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(async () => {
        // Sin conexión: busca en caché
        const cached = await caches.match(request);
        if (cached) return cached;

        // Si es navegación y no hay caché, devuelve el index cacheado
        if (request.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        }

        return new Response('Sin conexión', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});


// ============================
// NOTIFICACIONES PUSH (segundo plano)
// ============================
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { title: 'Rovant', body: event.data ? event.data.text() : '' }; }

  event.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'Rovant', {
      body: d.body || '',
      icon: new URL('Iconos/Logo.png', self.registration.scope).href,
      badge: new URL('Iconos/Logo.png', self.registration.scope).href,
      tag: d.tag || undefined,
      data: { url: d.url || 'Aplicativo/Aplicativo.html' }
    });
    // Si hay una pestaña abierta, que reproduzca el sonido de aviso
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    abiertas.forEach((c) => c.postMessage({ type: 'rovant-push' }));
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || 'Aplicativo/Aplicativo.html', self.registration.scope).href;
  event.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abiertas) {
      if ('focus' in c) { await c.focus(); if ('navigate' in c) { try { await c.navigate(destino); } catch (e) { /* ignorar */ } } return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(destino);
  })());
});
