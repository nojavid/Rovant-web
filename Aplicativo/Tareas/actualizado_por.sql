-- Ejecutar una vez en Supabase > SQL Editor
-- Permite que las notificaciones digan QUIÉN hizo el cambio en una tarea
alter table tareas_rovant add column if not exists actualizado_por text;
