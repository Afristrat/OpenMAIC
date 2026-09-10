-- Execute after the candidate export migration inside BEGIN/ROLLBACK only.
INSERT INTO auth.users(id) VALUES ('00000000-0036-4000-8000-000000000331'),('00000000-0036-4000-8000-000000000332');
INSERT INTO public.organizations(id,name,seat_limit) VALUES ('00000000-0036-4000-8000-000000000333','Contribution export proof',10);
INSERT INTO public.org_members(org_id,user_id,role)
 SELECT '00000000-0036-4000-8000-000000000333',id,'formateur' FROM auth.users WHERE id IN ('00000000-0036-4000-8000-000000000331','00000000-0036-4000-8000-000000000332');
INSERT INTO public.stages(id,owner_id,org_id,name) VALUES
 ('s036-contribution-a','00000000-0036-4000-8000-000000000331','00000000-0036-4000-8000-000000000333','A'),
 ('s036-contribution-b','00000000-0036-4000-8000-000000000332','00000000-0036-4000-8000-000000000333','B');
DO $$
DECLARE actor uuid; version public.widget_template_versions; other_version public.widget_template_versions;
BEGIN
 FOREACH actor IN ARRAY ARRAY['00000000-0036-4000-8000-000000000331'::uuid,'00000000-0036-4000-8000-000000000332'::uuid] LOOP
  INSERT INTO public.classroom_templates(name,sector,requirements,org_id,created_by)
   VALUES ('Contribution','proof','{}','00000000-0036-4000-8000-000000000333',actor);
  INSERT INTO public.curriculum_links(from_stage_id,to_stage_id,relation_type,org_id,created_by)
   VALUES (CASE WHEN actor::text LIKE '%331' THEN 's036-contribution-a' ELSE 's036-contribution-b' END,CASE WHEN actor::text LIKE '%331' THEN 's036-contribution-b' ELSE 's036-contribution-a' END,'follows','00000000-0036-4000-8000-000000000333',actor);
  INSERT INTO public.org_invitations(org_id,email,created_by,token)
   VALUES ('00000000-0036-4000-8000-000000000333',actor::text || '@example.invalid',actor,'SYNTHETIC_TOKEN_' || actor::text);
  INSERT INTO public.organization_skills(org_id,skill_id,manifest,installed_by)
   VALUES ('00000000-0036-4000-8000-000000000333','proof-' || actor::text,'{}',actor);
  SELECT * INTO version FROM public.create_widget_template(actor,'proof-' || actor::text,'Proof','{}');
  PERFORM public.publish_widget_template(actor,version.template_id,version.id);
  IF actor::text LIKE '%331' THEN
   -- A template's original author must not inherit access to another author's drafts.
   SELECT * INTO other_version FROM public.revise_widget_template('00000000-0036-4000-8000-000000000332',version.template_id,'Proof','{"privateDraft":true}');
  ELSE
   -- Publishing another author's version is an attributable contribution.
   SELECT * INTO other_version FROM public.revise_widget_template(actor,version.template_id,'Proof','{"approved":true}');
   PERFORM public.publish_widget_template('00000000-0036-4000-8000-000000000331',version.template_id,other_version.id);
  END IF;
 END LOOP;
END $$;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid := '00000000-0036-4000-8000-000000000331'; section text; rows jsonb;
BEGIN
 FOREACH section IN ARRAY ARRAY['classroom_templates','curriculum_links','org_invitations','organization_skills','widget_templates'] LOOP
  rows := public.read_account_export_page(actor,section);
  IF jsonb_array_length(rows)<>1 THEN RAISE EXCEPTION 'Contribution actor isolation failed: %',section; END IF;
 END LOOP;
 rows := public.read_account_export_page(actor,'org_invitations');
 IF rows->0->'value' ?| ARRAY['email','token'] OR rows::text LIKE '%SYNTHETIC_TOKEN%' THEN RAISE EXCEPTION 'Invitation secrets/recipient leaked'; END IF;
 rows := public.read_account_export_page(actor,'widget_template_versions');
 IF jsonb_array_length(rows)<>2 OR rows::text LIKE '%privateDraft%' THEN RAISE EXCEPTION 'Widget version attribution failed'; END IF;
 IF jsonb_array_length(public.read_account_export_page(actor,'widget_template_publications'))<>2 THEN RAISE EXCEPTION 'Publisher attribution failed'; END IF;
 UPDATE public.organizations SET status='suspended' WHERE id='00000000-0036-4000-8000-000000000333';
 FOREACH section IN ARRAY ARRAY['classroom_templates','curriculum_links','org_invitations','organization_skills'] LOOP
  IF public.read_account_export_page(actor,section)<>'[]'::jsonb THEN RAISE EXCEPTION 'Suspended tenant exported: %',section; END IF;
 END LOOP;
 UPDATE public.organizations SET status='active' WHERE id='00000000-0036-4000-8000-000000000333';
 DELETE FROM public.org_members WHERE user_id=actor;
 FOREACH section IN ARRAY ARRAY['classroom_templates','curriculum_links','org_invitations','organization_skills'] LOOP
  IF public.read_account_export_page(actor,section)<>'[]'::jsonb THEN RAISE EXCEPTION 'Former member exported: %',section; END IF;
 END LOOP;
END $$;
RESET ROLE;
