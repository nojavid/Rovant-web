-- Jerarquía de los usuarios registrados (árbol de la página "Usuarios registrados").
-- Ejecutar una vez en el SQL Editor de Supabase.
--   novato     : cuenta nueva, todo lo que reporta se valida (En pruebas)
--   privilegio : sus reportes no se validan (Sin validación)
--   crack      : como privilegio + insignia de verificado por Rovant (Miembro fiel)

ALTER TABLE public.registro_usuarios_app ADD COLUMN IF NOT EXISTS jerarquia text;

-- Si antes se usó jefe/subjefe/empleado, se quita esa restricción y se pasan a novato.
ALTER TABLE public.registro_usuarios_app DROP CONSTRAINT IF EXISTS registro_usuarios_app_jerarquia_check;
UPDATE public.registro_usuarios_app SET jerarquia = 'novato'
  WHERE jerarquia IS NULL OR jerarquia NOT IN ('novato', 'privilegio', 'crack');

ALTER TABLE public.registro_usuarios_app ALTER COLUMN jerarquia SET DEFAULT 'novato';
ALTER TABLE public.registro_usuarios_app ALTER COLUMN jerarquia SET NOT NULL;
ALTER TABLE public.registro_usuarios_app
  ADD CONSTRAINT registro_usuarios_app_jerarquia_check CHECK (jerarquia IN ('novato', 'privilegio', 'crack'));

-- La web puede leer nombre, correo y jerarquía, y cambiar solo la jerarquía.
GRANT SELECT (id, nombre_completo, correo_electronico, jerarquia) ON public.registro_usuarios_app TO anon;
GRANT UPDATE (jerarquia) ON public.registro_usuarios_app TO anon;

ALTER TABLE public.registro_usuarios_app ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "web_select_usuarios_registrados" ON public.registro_usuarios_app;
DROP POLICY IF EXISTS "web_update_jerarquia_usuarios" ON public.registro_usuarios_app;
CREATE POLICY "web_select_usuarios_registrados" ON public.registro_usuarios_app FOR SELECT TO anon USING (true);
CREATE POLICY "web_update_jerarquia_usuarios" ON public.registro_usuarios_app FOR UPDATE TO anon USING (true) WITH CHECK (true);
