-- Miroir en lecture seule des métiers et compétences du référentiel commun (ISCO-08, ESCO).
-- La source de vérité reste la plateforme neutre (OpenSALT, referentiel.ai-mpower.com) : ces tables ne
-- servent qu'à consulter et rechercher vite, en français, en arabe et en anglais. Elles sont remplies
-- par `scripts/sync-referentiel.ts` et lisibles par tout compte connecté, jamais modifiables par un client.

CREATE TABLE public.referentiel_occupations (
  uri text PRIMARY KEY,
  title_fr text NOT NULL,
  title_ar text,
  title_en text,
  -- Groupe de base ISCO-08, quatre chiffres.
  isco_code text CHECK (isco_code ~ '^[0-9]{1,4}$'),
  document_id text NOT NULL,
  -- « <id du CFDocument>@<version> » (100 caractères au plus).
  referentiel_version text NOT NULL CHECK (char_length(referentiel_version) <= 100),
  essential_uris text[] NOT NULL DEFAULT '{}',
  optional_uris text[] NOT NULL DEFAULT '{}',
  -- Titres en trois langues, minuscules et sans accents : cible de la recherche par sous-chaîne.
  search_text text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX referentiel_occupations_isco_idx ON public.referentiel_occupations(isco_code);

CREATE TABLE public.referentiel_skills (
  uri text PRIMARY KEY,
  title_fr text NOT NULL,
  title_ar text,
  title_en text,
  search_text text NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.referentiel_occupations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referentiel_skills ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.referentiel_occupations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.referentiel_skills FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.referentiel_occupations TO authenticated;
GRANT SELECT ON TABLE public.referentiel_skills TO authenticated;

CREATE POLICY referentiel_occupations_read ON public.referentiel_occupations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY referentiel_skills_read ON public.referentiel_skills
  FOR SELECT TO authenticated USING (true);
