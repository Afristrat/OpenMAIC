-- Existing issuances keep their tenant and verification code unchanged.
-- The live FK may become null when an organization is removed; the issuance scope must not.
ALTER TABLE public.certificates ADD COLUMN issuance_org_id uuid;
UPDATE public.certificates SET issuance_org_id=org_id;
CREATE SCHEMA IF NOT EXISTS qalem_certificate_private;
REVOKE ALL ON SCHEMA qalem_certificate_private FROM PUBLIC,anon,authenticated;
CREATE FUNCTION qalem_certificate_private.preserve_issuance_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN NEW.issuance_org_id := NEW.org_id;
  ELSIF NEW.issuance_org_id IS DISTINCT FROM OLD.issuance_org_id THEN
    RAISE EXCEPTION 'Certificate issuance scope is immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qalem_certificate_private.preserve_issuance_scope() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER certificate_issuance_scope BEFORE INSERT OR UPDATE ON public.certificates
FOR EACH ROW EXECUTE FUNCTION qalem_certificate_private.preserve_issuance_scope();
CREATE UNIQUE INDEX idx_certificates_user_stage_tenant
ON public.certificates(user_id,stage_id,issuance_org_id) NULLS NOT DISTINCT;
DROP INDEX public.idx_certificates_user_stage;
