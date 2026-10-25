-- Anuncios (texto, imagen, video, audio o PDF). El archivo vive en Cloudflare R2;
-- aquí solo se guarda la información para listarlos y seleccionarlos.
-- Ejecutar una vez en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.anuncios (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('texto', 'imagen', 'video', 'audio', 'pdf')),
  titulo text NOT NULL,
  texto text,
  file_path text,          -- "r2/<archivo>" cuando hay archivo
  file_name text,
  file_size bigint,
  activo boolean NOT NULL DEFAULT false,
  creado_por text,
  estilo jsonb,            -- diseño elegido por la IA (acento, fuente, alineacion, fondo)
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.anuncios TO anon;
ALTER TABLE public.anuncios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "web_anuncios_todo" ON public.anuncios;
CREATE POLICY "web_anuncios_todo" ON public.anuncios FOR ALL TO anon USING (true) WITH CHECK (true);

-- Si la tabla ya existía, agrega la columna del diseño:
ALTER TABLE public.anuncios ADD COLUMN IF NOT EXISTS estilo jsonb;
