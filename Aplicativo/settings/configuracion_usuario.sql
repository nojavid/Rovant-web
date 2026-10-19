-- Ejecutar una vez en Supabase > SQL Editor
-- Si la columna quedó creada como "notificacione" (sin la "s"), renómbrala:
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'configuracion_usuario' and column_name = 'notificacione')
     and not exists (select 1 from information_schema.columns where table_name = 'configuracion_usuario' and column_name = 'notificaciones') then
    alter table configuracion_usuario rename column notificacione to notificaciones;
  end if;
end $$;

alter table configuracion_usuario add column if not exists tema text default 'Claro';
alter table configuracion_usuario add column if not exists notificaciones text default 'No';

-- Refresca la caché del esquema de la API de Supabase
notify pgrst, 'reload schema';
