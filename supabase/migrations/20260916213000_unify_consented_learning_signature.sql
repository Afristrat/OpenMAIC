-- The six-argument function has a default tenant argument. Keeping the former
-- five-argument overload makes every legacy call with five arguments ambiguous.
-- Remove only the obsolete overload; PostgreSQL resolves five arguments through
-- the default of the tenant-aware function.
DROP FUNCTION IF EXISTS public.record_consented_learning(uuid, uuid, text, jsonb, uuid);
