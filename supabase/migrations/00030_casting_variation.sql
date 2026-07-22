-- =============================================================================
-- Migration 00030: Garantie SQL de variation des castings (S2-003)
-- Le contrat VIVRE impose l'unicité par apprenant, formation et lineup.
-- `course_id` accepte aussi l'identifiant déterministe du flux de génération
-- actuel, puis recevra l'UUID de public.courses lorsque S1-003 le créera.
-- =============================================================================

CREATE TABLE public.castings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL,
  session_no INTEGER NOT NULL DEFAULT 1 CHECK (session_no > 0),
  lineup JSONB NOT NULL,
  lineup_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT castings_user_course_lineup_unique UNIQUE (user_id, course_id, lineup_hash)
);

ALTER TABLE public.castings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "castings_select_own"
  ON public.castings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "castings_insert_service_only"
  ON public.castings FOR INSERT
  WITH CHECK (false);

CREATE POLICY "castings_update_service_only"
  ON public.castings FOR UPDATE
  USING (false)
  WITH CHECK (false);

CREATE POLICY "castings_delete_service_only"
  ON public.castings FOR DELETE
  USING (false);
