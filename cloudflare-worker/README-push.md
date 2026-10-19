# Notificaciones push en segundo plano

Flujo: cambia una tarea → Supabase (webhook) → Worker `/notify` → servicio push del navegador → llega aunque la web esté cerrada.

## Pasos (una sola vez)

1. **Generar las claves VAPID** (dentro de `cloudflare-worker`):
   ```
   npm install
   npx web-push generate-vapid-keys
   ```
   - La **clave pública** va en `wrangler.toml` (`VAPID_PUBLIC_KEY`) y en el SQL (paso 3).
   - La **clave privada** NO se guarda en ningún archivo: `npx wrangler secret put VAPID_PRIVATE_KEY`.
2. **Secretos del Worker**:
   ```
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put SUPABASE_SERVICE_KEY   # Supabase > Settings > API > service_role (secret)
   npx wrangler secret put WEBHOOK_SECRET         # inventa una cadena larga y aleatoria
   ```
3. En `wrangler.toml` cambia `VAPID_SUBJECT` por un correo tuyo (`mailto:...`) y pon la clave pública.
4. **Desplegar**: `npx wrangler deploy`
5. En Supabase > SQL Editor ejecuta `push.sql` (reemplazando clave pública, URL del Worker y `TU_WEBHOOK_SECRET`).
   - Si `supabase_functions.http_request` no existe: Database > Webhooks > Create, tablas
     `tareas_rovant` (Insert, Update, Delete) y `comentarios_tarea` (Insert), tipo HTTP Request,
     método POST, URL `TU_WORKER_URL/notify`, cabecera `x-webhook-secret: <tu secreto>`.
6. Cada usuario entra a Setting → Notificaciones → Sí (acepta el permiso). Eso registra su dispositivo.

## Notas
- iPhone/iPad: solo funciona si la web se instala en la pantalla de inicio (Compartir → Añadir a pantalla de inicio), iOS 16.4+.
- Android/PC (Chrome, Edge, Firefox): funciona con el navegador cerrado mientras el sistema lo permita.
- Mientras una pestaña de Rovant está abierta y el usuario tiene push activo, el aviso llega por push (con sonido).
