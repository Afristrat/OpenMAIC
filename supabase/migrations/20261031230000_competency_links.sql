-- Liens des formations et des scènes vers le référentiel commun de compétences (CASE, ISCO-08, ESCO).
-- Le référentiel vit sur une plateforme neutre : on ne stocke ici que l'URI de la compétence et la
-- version du référentiel lue au moment du lien, jamais le contenu du référentiel.
--   niveau formation : compétences visées par le cours (base de la couverture d'un métier) ;
--   niveau scène     : compétences travaillées ou évaluées par la scène, proposées par l'IA puis
--                      confirmées par un humain (statut), supprimées avec la scène.

CREATE TABLE public.course_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  competency_uri text NOT NULL CHECK (char_length(competency_uri) BETWEEN 1 AND 500),
  -- « <id du CFDocument>@<version> », 100 caractères au plus (contrat de relevé xAPI de Taqwim).
  referential_version text NOT NULL CHECK (char_length(referential_version) BETWEEN 1 AND 100),
  -- Groupe de base ISCO-08 à quatre chiffres, absent quand la compétence n'est rattachée à aucun métier.
  isco_08 text CHECK (isco_08 ~ '^[0-9]{4}$'),
  nature text NOT NULL DEFAULT 'essentielle' CHECK (nature IN ('essentielle', 'optionnelle')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, competency_uri)
);
CREATE INDEX course_competencies_uri_idx ON public.course_competencies(competency_uri);
CREATE INDEX course_competencies_org_idx ON public.course_competencies(org_id);

CREATE TABLE public.scene_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id text NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  competency_uri text NOT NULL CHECK (char_length(competency_uri) BETWEEN 1 AND 500),
  referential_version text NOT NULL CHECK (char_length(referential_version) BETWEEN 1 AND 100),
  nature text NOT NULL DEFAULT 'travaillee' CHECK (nature IN ('travaillee', 'evaluee')),
  statut text NOT NULL DEFAULT 'propose' CHECK (statut IN ('propose', 'confirme')),
  confirmed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scene_id, competency_uri, nature),
  CONSTRAINT scene_competencies_confirmation_complete
    CHECK ((statut = 'confirme') = (confirmed_at IS NOT NULL))
);
CREATE INDEX scene_competencies_uri_idx ON public.scene_competencies(competency_uri);
CREATE INDEX scene_competencies_org_idx ON public.scene_competencies(org_id);

-- RLS active et aucune politique : seules les routes serveur, qui contrôlent le rôle dans
-- l'organisation, y accèdent avec la clé de service.
ALTER TABLE public.course_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scene_competencies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.course_competencies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.scene_competencies FROM PUBLIC, anon, authenticated;
