-- Vincula motoristas ao Auth e libera leitura apenas dos próprios registros/rotas.
BEGIN;

ALTER TABLE public.drivers ADD COLUMN auth_user_id uuid;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_auth_user_id_key UNIQUE (auth_user_id);
ALTER TABLE public.drivers ADD CONSTRAINT drivers_auth_user_id_fkey
  FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE FUNCTION private.is_tenant_driver(target_tenant uuid, target_driver uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.drivers d ON d.tenant_id = p.tenant_id AND d.auth_user_id = p.id
    JOIN public.tenant_access a ON a.tenant_id = p.tenant_id
    WHERE p.id = (SELECT auth.uid()) AND p.tenant_id = target_tenant
      AND p.role = 'motorista' AND d.id = target_driver
      AND a.status = 'active' AND (a.access_until IS NULL OR a.access_until > now())
  );
$$;
REVOKE ALL ON FUNCTION private.is_tenant_driver(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_tenant_driver(uuid,uuid) TO authenticated, service_role;

CREATE POLICY driver_self_read ON public.drivers FOR SELECT TO authenticated
  USING (private.is_tenant_driver(tenant_id, id));
CREATE POLICY driver_routes_read ON public.routes FOR SELECT TO authenticated
  USING (private.is_tenant_driver(tenant_id, driver_id));
CREATE POLICY driver_vehicles_read ON public.vehicles FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.tenant_id = vehicles.tenant_id AND r.vehicle_id = vehicles.id
      AND private.is_tenant_driver(r.tenant_id, r.driver_id)
  ));
CREATE POLICY driver_clients_read ON public.clients FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.tenant_id = clients.tenant_id AND r.client_id = clients.id
      AND private.is_tenant_driver(r.tenant_id, r.driver_id)
  ));
CREATE POLICY driver_route_photos_read ON public.route_photos FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.tenant_id = route_photos.tenant_id AND r.id = route_photos.route_id
      AND private.is_tenant_driver(r.tenant_id, r.driver_id)
  ));

COMMIT;
