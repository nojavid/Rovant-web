-- Ejecutar una sola vez en Supabase -> SQL Editor.
-- La web usa la clave pública (rol "anon"), así que necesita permisos sobre la tabla.
-- Nota: esto da acceso de lectura/edición/borrado a cualquiera que tenga la clave pública
-- (el login de Rovant es propio, no usa Supabase Auth). Igual que el resto de tablas de la app.

GRANT SELECT, UPDATE, DELETE ON public.semaforos_tiempos TO anon;

ALTER TABLE public.semaforos_tiempos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "web_select_semaforos" ON public.semaforos_tiempos;
DROP POLICY IF EXISTS "web_update_semaforos" ON public.semaforos_tiempos;
DROP POLICY IF EXISTS "web_delete_semaforos" ON public.semaforos_tiempos;

CREATE POLICY "web_select_semaforos" ON public.semaforos_tiempos FOR SELECT TO anon USING (true);
CREATE POLICY "web_update_semaforos" ON public.semaforos_tiempos FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "web_delete_semaforos" ON public.semaforos_tiempos FOR DELETE TO anon USING (true);
