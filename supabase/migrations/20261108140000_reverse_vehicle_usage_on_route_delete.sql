-- A completed route must release its KM and start-cycle usage when deleted.
DROP TRIGGER IF EXISTS routes_account_completed_usage_delete ON public.routes;

CREATE TRIGGER routes_account_completed_usage_delete
BEFORE DELETE ON public.routes
FOR EACH ROW
EXECUTE FUNCTION public.account_completed_route_usage();
