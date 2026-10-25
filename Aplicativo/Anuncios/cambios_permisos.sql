-- Permite que el Worker (clave anon) lea la tabla "cambios" para generar anuncios con IA.
-- Ejecutar una vez en el SQL Editor de Supabase.

GRANT SELECT ON public.cambios TO anon;
ALTER TABLE public.cambios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "web_cambios_leer" ON public.cambios;
CREATE POLICY "web_cambios_leer" ON public.cambios FOR SELECT TO anon USING (true);
