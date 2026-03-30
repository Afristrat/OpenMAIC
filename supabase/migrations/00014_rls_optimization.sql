-- P0.1: Multi-tenancy RLS optimization
--
-- Helper function for performant RLS policies.
-- Uses SECURITY DEFINER + STABLE + wrapped auth.uid() for initPlan caching.

CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT org_id
  FROM public.org_members
  WHERE user_id = (SELECT auth.uid())
$$;

-- Ensure critical indexes exist for RLS performance
CREATE INDEX IF NOT EXISTS idx_org_members_user_org ON public.org_members(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_stages_org_id ON public.stages(org_id);
CREATE INDEX IF NOT EXISTS idx_stages_owner_id ON public.stages(owner_id);
CREATE INDEX IF NOT EXISTS idx_scenes_stage_id ON public.scenes(stage_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON public.quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_review_cards_user_id ON public.review_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_review_cards_due ON public.review_cards(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_agent_configs_owner_id ON public.agent_configs(owner_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_org_id ON public.agent_configs(org_id);
CREATE INDEX IF NOT EXISTS idx_shared_classrooms_org_id ON public.shared_classrooms(org_id);
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON public.certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
