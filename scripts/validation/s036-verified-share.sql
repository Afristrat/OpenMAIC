-- All candidate migrations and this proof must run inside BEGIN/ROLLBACK.
INSERT INTO auth.users(id) VALUES
 ('00000000-0036-4000-8000-000000000261'),('00000000-0036-4000-8000-000000000262'),
 ('00000000-0036-4000-8000-000000000263');
INSERT INTO public.organizations(id,name,seat_limit) VALUES
 ('00000000-0036-4000-8000-000000000264','Verified source',10),
 ('00000000-0036-4000-8000-000000000265','Verified destination',10);
INSERT INTO public.org_members(user_id,org_id,role) VALUES
 ('00000000-0036-4000-8000-000000000261','00000000-0036-4000-8000-000000000264','formateur'),
 ('00000000-0036-4000-8000-000000000261','00000000-0036-4000-8000-000000000265','formateur'),
 ('00000000-0036-4000-8000-000000000262','00000000-0036-4000-8000-000000000265','admin');
INSERT INTO public.stages(id,owner_id,org_id,name) VALUES
 ('s036-verified-share','00000000-0036-4000-8000-000000000261','00000000-0036-4000-8000-000000000264','Verified share');
INSERT INTO public.scenes(id,stage_id,type,"order") VALUES('s036-verified-quiz','s036-verified-share','quiz',0);
-- Historical row: deliberately not stamped by an authenticated source publisher.
INSERT INTO public.shared_classrooms(id,stage_id,org_id,shared_by,visibility) VALUES
 ('00000000-0036-4000-8000-000000000266','s036-verified-share','00000000-0036-4000-8000-000000000265','00000000-0036-4000-8000-000000000261','public');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000262',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.stages WHERE id='s036-verified-share')
    OR EXISTS(SELECT 1 FROM public.scenes WHERE id='s036-verified-quiz') THEN RAISE EXCEPTION 'Legacy grant trusted'; END IF;
END $$;
-- Even a forged true flag during a permitted reduction cannot bless history.
UPDATE public.shared_classrooms SET visibility='organization',authorization_verified=true
 WHERE id='00000000-0036-4000-8000-000000000266';
DO $$ BEGIN
  IF (SELECT authorization_verified FROM public.shared_classrooms WHERE id='00000000-0036-4000-8000-000000000266')
    THEN RAISE EXCEPTION 'Destination blessed history'; END IF;
  BEGIN
    UPDATE public.shared_classrooms SET authorization_verified=true WHERE id='00000000-0036-4000-8000-000000000266';
    RAISE EXCEPTION 'Verification flag forged';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000261',true);
-- Same visibility revalidated by the source owner with destination publishing rights.
UPDATE public.shared_classrooms SET visibility='organization' WHERE id='00000000-0036-4000-8000-000000000266';
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000262',true);
DO $$ DECLARE affected integer; BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.shared_classrooms c
    JOIN public.organizations o ON o.id=c.org_id
    JOIN public.org_members m ON m.org_id=o.id
    WHERE c.stage_id='s036-verified-share' AND c.org_id='00000000-0036-4000-8000-000000000265'
      AND c.authorization_verified AND c.visibility IN ('organization','public')
      AND o.status='active' AND m.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'HTTP recipient join denied';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.stages WHERE id='s036-verified-share')
    OR NOT EXISTS(SELECT 1 FROM public.scenes WHERE id='s036-verified-quiz') THEN RAISE EXCEPTION 'Recipient cannot read'; END IF;
  UPDATE public.scenes SET "order"=99 WHERE id='s036-verified-quiz';
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'Recipient gained edit access'; END IF;
END $$;
INSERT INTO public.quiz_results(user_id,stage_id,scene_id,org_id,answers,score) VALUES
 ('00000000-0036-4000-8000-000000000262','s036-verified-share','s036-verified-quiz','00000000-0036-4000-8000-000000000265','[]',80);
RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO public.classroom_intervention_decisions(decision_id,classroom_id,org_id,learner_user_id,
 interaction_id,scene_id,turn_index,agent_id,agent_name,trigger,form,reason) VALUES
 ('s036-share-decision','s036-verified-share','00000000-0036-4000-8000-000000000265',
 '00000000-0036-4000-8000-000000000262','s036-shared-question','s036-verified-quiz',1,
 'teacher','Teacher','learner-question','clarification','Clarify the learner question');
DO $$ BEGIN
  BEGIN
    UPDATE public.classroom_intervention_decisions SET org_id='00000000-0036-4000-8000-000000000264'
      WHERE decision_id='s036-share-decision';
    RAISE EXCEPTION 'Decision reattributed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000261',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.classroom_intervention_decisions WHERE decision_id='s036-share-decision')
    THEN RAISE EXCEPTION 'Source author reads recipient journal'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000262',true);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.classroom_intervention_decisions WHERE decision_id='s036-share-decision')
    THEN RAISE EXCEPTION 'Recipient admin cannot read journal'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000263',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.stages WHERE id='s036-verified-share')
    OR EXISTS(SELECT 1 FROM public.scenes WHERE id='s036-verified-quiz')
    OR EXISTS(SELECT 1 FROM public.quiz_results WHERE stage_id='s036-verified-share') THEN RAISE EXCEPTION 'Outsider disclosure'; END IF;
END $$;
RESET ROLE;
UPDATE public.organizations SET status='suspended' WHERE id='00000000-0036-4000-8000-000000000265';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000262',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.stages WHERE id='s036-verified-share')
    OR EXISTS(SELECT 1 FROM public.scenes WHERE id='s036-verified-quiz') THEN RAISE EXCEPTION 'Suspended tenant reads'; END IF;
END $$;
RESET ROLE;
UPDATE public.organizations SET status='active' WHERE id='00000000-0036-4000-8000-000000000265';
DELETE FROM public.org_members WHERE user_id='00000000-0036-4000-8000-000000000262';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0036-4000-8000-000000000262',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.stages WHERE id='s036-verified-share')
    OR EXISTS(SELECT 1 FROM public.scenes WHERE id='s036-verified-quiz') THEN RAISE EXCEPTION 'Revoked member reads'; END IF;
END $$;
RESET ROLE;
