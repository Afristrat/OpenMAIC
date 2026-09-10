-- After s036-lti-reporting.sql and expanded export candidates, under ROLLBACK.
SET LOCAL ROLE service_role;
DO $$
DECLARE section text; rows jsonb;
BEGIN
 FOREACH section IN ARRAY ARRAY['lti_user_bindings','lti_launch_sessions','lti_quiz_attempts','lti_grade_outbox'] LOOP
   rows := public.read_account_export_page('00000000-0036-4000-8000-000000000241',section);
   IF jsonb_array_length(rows)<>1 THEN RAISE EXCEPTION 'LTI personal data missing: %',section; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) r WHERE (r->'value') ?| ARRAY['token_hash','line_item_url','content','lease_id','lease_expires_at','partial_results','last_error']) THEN
     RAISE EXCEPTION 'LTI secret or unreleased grading context exported';
   END IF;
   IF public.read_account_export_page('00000000-0036-4000-8000-000000000301',section)<>'[]'::jsonb THEN
     RAISE EXCEPTION 'LTI binding crossed an actor boundary';
   END IF;
 END LOOP;
END $$;
RESET ROLE;
