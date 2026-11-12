-- Audit des 35 points (point 25), constat du 11/11/2026 en production : sept
-- fonctions SECURITY DEFINER du schéma public restaient exécutables par anon,
-- donc avec la clé publique servie au navigateur. Les REVOKE ... FROM PUBLIC des
-- migrations d'origine ne retirent pas le droit accordé nommément à anon et à
-- authenticated par les privilèges par défaut de Supabase, et une partie du
-- durcissement du 10/09 n'était pas appliquée en production.

-- Lecture des adhésions de l'appelant : aucun privilège de propriétaire requis.
ALTER FUNCTION public.get_user_org_ids() SECURITY INVOKER;
ALTER FUNCTION public.get_user_org_ids() SET search_path = '';
REVOKE ALL ON FUNCTION public.get_user_org_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO authenticated, service_role;

-- Création d'organisation : réservée à une personne connectée (auth.uid() exigé).
REVOKE ALL ON FUNCTION public.create_organization_with_admin(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_with_admin(TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Fonction de déclencheur : jamais appelée directement.
REVOKE ALL ON FUNCTION public.archive_courses_before_classroom_delete() FROM PUBLIC, anon, authenticated;

-- Modèles de widgets et règlement de la facturation : appelés uniquement par le
-- serveur avec la clé service_role.
REVOKE ALL ON FUNCTION public.create_widget_template(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revise_widget_template(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_widget_template(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_tenant_usage(UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_widget_template(UUID, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.revise_widget_template(UUID, UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_widget_template(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_tenant_usage(UUID, UUID, NUMERIC) TO service_role;

-- Garde : la migration échoue si une fonction SECURITY DEFINER du schéma public
-- reste exécutable par anon.
DO $$
DECLARE
  exposed TEXT;
BEGIN
  SELECT string_agg(p.oid::regprocedure::TEXT, ', ' ORDER BY p.oid::regprocedure::TEXT)
    INTO exposed
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND has_function_privilege('anon', p.oid, 'EXECUTE');
  IF exposed IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER functions still executable by anon: %', exposed;
  END IF;
END
$$;
