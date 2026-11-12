BEGIN;

-- New tenants remain blocked until the separate access manager activates them.
-- Existing tenant_access rows are intentionally unchanged.
ALTER TABLE public.tenant_access
  ALTER COLUMN status SET DEFAULT 'blocked',
  ALTER COLUMN blocked_at SET DEFAULT now(),
  ALTER COLUMN block_reason SET DEFAULT 'administrative';

CREATE TABLE private.api_rate_limits (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL CHECK (hit_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, bucket)
);

ALTER TABLE private.api_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.api_rate_limits FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_tenant_id uuid,
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_count integer;
  current_window timestamptz;
BEGIN
  IF p_bucket NOT IN ('read', 'write', 'maintenance_forecast')
    OR p_limit < 1 OR p_limit > 10000
    OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Invalid rate limit parameters';
  END IF;

  INSERT INTO private.api_rate_limits AS current_limit
    (tenant_id, user_id, bucket, window_start, hit_count, updated_at)
  VALUES (
    p_tenant_id,
    p_user_id,
    p_bucket,
    to_timestamp(floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds),
    1,
    clock_timestamp()
  )
  ON CONFLICT (tenant_id, user_id, bucket) DO UPDATE
    SET window_start = EXCLUDED.window_start,
        hit_count = CASE
          WHEN current_limit.window_start = EXCLUDED.window_start THEN current_limit.hit_count + 1
          ELSE 1
        END,
        updated_at = clock_timestamp()
  RETURNING current_limit.hit_count, current_limit.window_start
    INTO current_count, current_window;

  allowed := current_count <= p_limit;
  retry_after_seconds := greatest(
    1,
    ceil(extract(epoch FROM (current_window + make_interval(secs => p_window_seconds) - clock_timestamp())))::integer
  );
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(uuid, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(uuid, uuid, text, integer, integer) TO service_role;

COMMIT;
