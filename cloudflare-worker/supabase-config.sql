-- Ejecutar en Supabase > SQL Editor
create table if not exists configuracion_app (
  clave text primary key,
  valor text not null
);

alter table configuracion_app enable row level security;

-- La app solo puede LEER; escribir se hace desde el panel de Supabase
drop policy if exists "leer configuracion_app" on configuracion_app;
create policy "leer configuracion_app" on configuracion_app for select using (true);

-- Reemplaza por la URL que te dio "wrangler deploy" (sin "/" al final)
insert into configuracion_app (clave, valor)
values ('r2_worker_url', 'https://rovant-apk.nojavid-finix.workers.dev')
on conflict (clave) do update set valor = excluded.valor;
