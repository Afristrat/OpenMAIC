-- Dernier rapport de cohérence voix off / image d'un cours : un seul par cours, remplacé à chaque contrôle.
-- La publication au catalogue le lit pour refuser un cours dont une scène jugée incohérente n'a pas changé depuis.

CREATE TABLE public.course_coherence_reports (
  course_id uuid PRIMARY KEY REFERENCES public.courses(id) ON DELETE CASCADE,
  reports jsonb NOT NULL,
  counts jsonb NOT NULL,
  checked_by uuid,
  checked_at timestamptz NOT NULL DEFAULT now()
);

-- RLS active et aucune politique : seules les routes serveur (client de service) y accèdent.
ALTER TABLE public.course_coherence_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.course_coherence_reports FROM PUBLIC, anon, authenticated;
