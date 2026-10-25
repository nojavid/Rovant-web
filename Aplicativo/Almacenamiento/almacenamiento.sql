-- Uso de almacenamiento para la página "Almacenamiento".
-- Ejecutar una vez en el SQL Editor de Supabase.
-- Solo devuelve tamaños totales (base de datos y archivos por bucket), no contenido.

CREATE OR REPLACE FUNCTION public.uso_almacenamiento()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT json_build_object(
    'db_bytes', pg_database_size(current_database()),
    'storage_bytes', COALESCE((SELECT sum((metadata->>'size')::bigint) FROM storage.objects), 0),
    'buckets', COALESCE((
      SELECT json_agg(json_build_object('nombre', bucket_id, 'archivos', n, 'bytes', b))
      FROM (
        SELECT bucket_id, count(*) AS n, COALESCE(sum((metadata->>'size')::bigint), 0) AS b
        FROM storage.objects GROUP BY bucket_id ORDER BY 3 DESC
      ) t
    ), '[]'::json)
  );
$$;

REVOKE ALL ON FUNCTION public.uso_almacenamiento() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uso_almacenamiento() TO anon, authenticated;
