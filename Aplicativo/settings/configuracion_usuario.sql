-- Ejecutar una vez en Supabase > SQL Editor
-- Guarda las preferencias de Setting por usuario para que sigan al iniciar sesión en otro dispositivo
alter table configuracion_usuario add column if not exists tema text default 'Claro';
alter table configuracion_usuario add column if not exists notificaciones text default 'No';
