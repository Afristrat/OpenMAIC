-- =============================================================================
-- Qalem — Initial Database Schema
-- =============================================================================

-- Users profile (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT,
  avatar TEXT,
  bio TEXT,
  locale TEXT DEFAULT 'fr-FR',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Organizations
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sector TEXT, -- healthcare, legal, tech, finance, education, industry
  logo TEXT,
  default_locale TEXT DEFAULT 'fr-FR',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Organization members with RBAC
CREATE TABLE public.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'apprenant' CHECK (role IN ('admin', 'manager', 'formateur', 'apprenant')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, org_id)
);

-- Stages (classrooms) - server-side persistence
CREATE TABLE public.stages (
  id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  language TEXT DEFAULT 'fr-FR',
  style TEXT,
  agent_ids TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scenes (pages within a classroom)
CREATE TABLE public.scenes (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- slide, quiz, interactive, pbl
  title TEXT,
  "order" INTEGER NOT NULL,
  content JSONB,
  actions JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Quiz results for spaced repetition
CREATE TABLE public.quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL REFERENCES public.stages(id) ON DELETE CASCADE,
  scene_id TEXT NOT NULL,
  answers JSONB NOT NULL, -- [{questionId, userAnswer, correct, timestamp}]
  score REAL,
  completed_at TIMESTAMPTZ DEFAULT now()
);

-- Spaced repetition review cards
CREATE TABLE public.review_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  user_answer TEXT,
  difficulty REAL DEFAULT 0.3,
  stability REAL DEFAULT 1.0,
  due_date TIMESTAMPTZ DEFAULT now(),
  last_review TIMESTAMPTZ,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  tags TEXT[],
  source_stage_id TEXT REFERENCES public.stages(id) ON DELETE SET NULL,
  source_scene_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent configs (custom agents per user/org)
CREATE TABLE public.agent_configs (
  id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  persona TEXT,
  avatar TEXT,
  color TEXT,
  priority INTEGER DEFAULT 5,
  allowed_actions TEXT[],
  voice_config JSONB,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX idx_org_members_user_id ON public.org_members(user_id);
CREATE INDEX idx_org_members_org_id ON public.org_members(org_id);
CREATE INDEX idx_stages_owner_id ON public.stages(owner_id);
CREATE INDEX idx_stages_org_id ON public.stages(org_id);
CREATE INDEX idx_scenes_stage_id ON public.scenes(stage_id);
CREATE INDEX idx_quiz_results_user_id ON public.quiz_results(user_id);
CREATE INDEX idx_quiz_results_stage_id ON public.quiz_results(stage_id);
CREATE INDEX idx_review_cards_user_id ON public.review_cards(user_id);
CREATE INDEX idx_review_cards_due_date ON public.review_cards(user_id, due_date);
CREATE INDEX idx_agent_configs_owner_id ON public.agent_configs(owner_id);
CREATE INDEX idx_agent_configs_org_id ON public.agent_configs(org_id);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- profiles: users can read/update their own profile
-- -----------------------------------------------------------------------------

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- organizations: members can read their org
-- -----------------------------------------------------------------------------

CREATE POLICY "organizations_select_member"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = organizations.id
        AND org_members.user_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- org_members: users can read their own memberships, admins can manage
-- -----------------------------------------------------------------------------

CREATE POLICY "org_members_select_own"
  ON public.org_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "org_members_insert_admin"
  ON public.org_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members AS om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    )
  );

CREATE POLICY "org_members_update_admin"
  ON public.org_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members AS om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    )
  );

CREATE POLICY "org_members_delete_admin"
  ON public.org_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members AS om
      WHERE om.org_id = org_members.org_id
        AND om.user_id = auth.uid()
        AND om.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- stages: owner can CRUD, org members can read if org_id matches
-- -----------------------------------------------------------------------------

CREATE POLICY "stages_select_owner"
  ON public.stages FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "stages_select_org_member"
  ON public.stages FOR SELECT
  USING (
    org_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = stages.org_id
        AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "stages_insert_owner"
  ON public.stages FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "stages_update_owner"
  ON public.stages FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "stages_delete_owner"
  ON public.stages FOR DELETE
  USING (owner_id = auth.uid());

-- -----------------------------------------------------------------------------
-- scenes: follow stage access
-- -----------------------------------------------------------------------------

CREATE POLICY "scenes_select_via_stage"
  ON public.scenes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.stages
      WHERE stages.id = scenes.stage_id
        AND (
          stages.owner_id = auth.uid()
          OR (
            stages.org_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.org_members
              WHERE org_members.org_id = stages.org_id
                AND org_members.user_id = auth.uid()
            )
          )
        )
    )
  );

CREATE POLICY "scenes_insert_via_stage_owner"
  ON public.scenes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stages
      WHERE stages.id = scenes.stage_id
        AND stages.owner_id = auth.uid()
    )
  );

CREATE POLICY "scenes_update_via_stage_owner"
  ON public.scenes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.stages
      WHERE stages.id = scenes.stage_id
        AND stages.owner_id = auth.uid()
    )
  );

CREATE POLICY "scenes_delete_via_stage_owner"
  ON public.scenes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.stages
      WHERE stages.id = scenes.stage_id
        AND stages.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- quiz_results: user can CRUD their own
-- -----------------------------------------------------------------------------

CREATE POLICY "quiz_results_select_own"
  ON public.quiz_results FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "quiz_results_insert_own"
  ON public.quiz_results FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "quiz_results_update_own"
  ON public.quiz_results FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "quiz_results_delete_own"
  ON public.quiz_results FOR DELETE
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- review_cards: user can CRUD their own
-- -----------------------------------------------------------------------------

CREATE POLICY "review_cards_select_own"
  ON public.review_cards FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "review_cards_insert_own"
  ON public.review_cards FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "review_cards_update_own"
  ON public.review_cards FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "review_cards_delete_own"
  ON public.review_cards FOR DELETE
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- agent_configs: owner can CRUD, published agents readable by all authenticated
-- -----------------------------------------------------------------------------

CREATE POLICY "agent_configs_select_own"
  ON public.agent_configs FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "agent_configs_select_published"
  ON public.agent_configs FOR SELECT
  USING (is_published = true);

CREATE POLICY "agent_configs_insert_own"
  ON public.agent_configs FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "agent_configs_update_own"
  ON public.agent_configs FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "agent_configs_delete_own"
  ON public.agent_configs FOR DELETE
  USING (owner_id = auth.uid());

-- =============================================================================
-- Trigger: auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_stages
  BEFORE UPDATE ON public.stages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_review_cards
  BEFORE UPDATE ON public.review_cards
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_updated_at_agent_configs
  BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
