-- Permite a la web borrar (y activar) versiones de APK en la página Upgrade.
-- Ejecutar una vez en el SQL Editor de Supabase.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.apk_versions TO anon;
ALTER TABLE public.apk_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "web_delete_apk_versions" ON public.apk_versions;
CREATE POLICY "web_delete_apk_versions" ON public.apk_versions FOR DELETE TO anon USING (true);
