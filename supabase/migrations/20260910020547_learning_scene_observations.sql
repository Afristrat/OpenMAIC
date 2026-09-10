-- Preserve scene provenance only for new observations; no historical backfill.
ALTER TABLE public.pedagogy_telemetry ADD COLUMN scene_observations jsonb;

CREATE OR REPLACE FUNCTION public.record_consented_learning(p_actor uuid, p_session uuid, p_stage text, p_payload jsonb, p_epoch uuid, p_org uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_consent boolean;
  v_epoch uuid;
  v_org uuid;
  v_source_org uuid;
  v_hash text;
  v_row public.pedagogy_telemetry;
BEGIN
  IF p_actor IS NULL OR p_session IS NULL OR p_stage IS NULL THEN
    RAISE EXCEPTION 'Invalid learning identity' USING ERRCODE = '22023';
  END IF;
  -- Serializes against consent UPDATE/DELETE, including direct RLS writes.
  SELECT pedagogy_consent, collection_epoch INTO v_consent, v_epoch FROM public.telemetry_consent
    WHERE user_id = p_actor FOR UPDATE;
  IF v_consent IS DISTINCT FROM true OR p_epoch IS DISTINCT FROM v_epoch THEN RETURN false; END IF;

  SELECT s.org_id INTO v_source_org FROM public.stages s WHERE s.id=p_stage FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Learning scope forbidden' USING ERRCODE='42501'; END IF;
  v_org := coalesce(p_org, v_source_org);
  PERFORM 1 FROM public.organizations o
    JOIN public.org_members m ON m.org_id=o.id AND m.user_id=p_actor
    WHERE o.id=v_org AND o.status='active' FOR SHARE OF o,m;
  IF NOT FOUND THEN RAISE EXCEPTION 'Learning scope forbidden' USING ERRCODE='42501'; END IF;
  IF v_source_org IS DISTINCT FROM v_org THEN
    PERFORM 1 FROM public.shared_classrooms sh
      WHERE sh.stage_id=p_stage AND sh.org_id=v_org AND sh.authorization_verified
        AND sh.visibility IN ('organization','public')
      LIMIT 1 FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Learning scope forbidden' USING ERRCODE='42501'; END IF;
  END IF;
  -- The consent lock serializes all collection calls for this actor.
  IF EXISTS (
    SELECT 1 FROM public.pedagogy_telemetry t
      JOIN qalem_telemetry_private.subjects subject ON subject.subject_hash=t.subject_hash
      WHERE subject.user_id=p_actor AND t.session_id=p_session
        AND (t.org_id IS DISTINCT FROM v_org OR t.stage_id IS DISTINCT FROM p_stage)
  ) THEN
    RAISE EXCEPTION 'Learning session scope is immutable' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text) > 65536 THEN
    RAISE EXCEPTION 'Invalid learning payload' USING ERRCODE = '22023';
  END IF;
  v_row := jsonb_populate_record(NULL::public.pedagogy_telemetry, p_payload);
  IF v_row.scene_observations IS NOT NULL THEN
    IF jsonb_typeof(v_row.scene_observations) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid scene observations' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(v_row.scene_observations) NOT BETWEEN 1 AND 256 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_row.scene_observations) e
      WHERE jsonb_typeof(e) IS DISTINCT FROM 'object'
        OR NOT (e ?& ARRAY['id','type','seconds','completed','score'])
        OR (e - ARRAY['id','type','seconds','completed','score']) <> '{}'::jsonb
        OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string'
        OR (e->>'id') !~ '^[A-Za-z0-9_-]{1,128}$'
        OR jsonb_typeof(e->'type') IS DISTINCT FROM 'string'
        OR jsonb_typeof(e->'seconds') IS DISTINCT FROM 'number'
        OR (e->>'seconds') !~ '^[0-9]+$'
        OR jsonb_typeof(e->'completed') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(e->'score') NOT IN ('number','null')
    ) THEN RAISE EXCEPTION 'Invalid scene observations' USING ERRCODE='22023'; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_row.scene_observations) e
      WHERE (e->>'seconds')::numeric NOT BETWEEN 0 AND 86400
        OR (e->'score' <> 'null'::jsonb AND (
          (e->>'score')::numeric NOT BETWEEN 0 AND 1 OR e->>'type' <> 'quiz'
          OR (e->>'completed')::boolean IS DISTINCT FROM true))
        OR NOT EXISTS (SELECT 1 FROM public.scenes s WHERE s.id=e->>'id'
          AND s.stage_id=p_stage AND s.type=e->>'type')
    ) OR (SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(v_row.scene_observations) e)
      <> jsonb_array_length(v_row.scene_observations)
      OR (SELECT sum((e->>'seconds')::numeric) FROM jsonb_array_elements(v_row.scene_observations) e)
        IS DISTINCT FROM v_row.total_duration::numeric THEN
      RAISE EXCEPTION 'Scene observation scope or measures invalid' USING ERRCODE='22023';
    END IF;
  END IF;
  IF coalesce(cardinality(v_row.scene_sequence), 0) NOT BETWEEN 1 AND 256
    OR cardinality(v_row.scene_durations) IS DISTINCT FROM cardinality(v_row.scene_sequence)
    OR v_row.completion_rate IS NULL OR NOT (v_row.completion_rate BETWEEN 0 AND 1)
    OR v_row.total_duration IS NULL OR NOT (v_row.total_duration BETWEEN 0 AND 86400)
    OR coalesce(cardinality(v_row.quiz_scores), 0) > 512
    OR EXISTS (SELECT 1 FROM unnest(v_row.quiz_scores) x WHERE x IS NULL OR NOT (x BETWEEN 0 AND 1))
    OR EXISTS (SELECT 1 FROM unnest(v_row.scene_durations) x WHERE x IS NULL OR NOT (x BETWEEN 0 AND 86400)) THEN
    RAISE EXCEPTION 'Invalid learning measures' USING ERRCODE = '22023';
  END IF;
  INSERT INTO qalem_telemetry_private.subjects(user_id, org_id) VALUES(p_actor, v_org)
    ON CONFLICT(user_id, org_id) DO NOTHING;
  SELECT subject_hash INTO v_hash FROM qalem_telemetry_private.subjects WHERE user_id=p_actor AND org_id=v_org;
  INSERT INTO public.pedagogy_telemetry (
    user_hash, subject_hash, session_id, org_id, stage_id, scene_sequence, scene_durations,
    quiz_scores, completion_rate, total_duration, subject_tags, language, level, agent_count, action_counts, scene_observations
  ) VALUES (
    v_hash, v_hash, p_session, v_org, p_stage, v_row.scene_sequence, v_row.scene_durations,
    v_row.quiz_scores, v_row.completion_rate, v_row.total_duration, v_row.subject_tags,
    v_row.language, v_row.level, v_row.agent_count, coalesce(v_row.action_counts, '{}'::jsonb), v_row.scene_observations
  ) ON CONFLICT(subject_hash, session_id) DO NOTHING;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_consented_learning(uuid, uuid, text, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_consented_learning(uuid, uuid, text, jsonb, uuid, uuid) TO service_role;

-- Only the authenticated server may choose the actor. No arbitrary table access.
CREATE OR REPLACE FUNCTION public.read_account_export_page(p_actor uuid, p_section text, p_after text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_table text;
  v_key text := 'id';
  v_join text := '';
  v_scope text;
  v_cursor text := '$2::uuid';
  v_order text;
  v_rows jsonb;
  v_fields text[];
  v_bigint_fields text[];
  v_value text := 'to_jsonb(t)';
  v_export_cursor text;
BEGIN
  IF p_actor IS NULL THEN RAISE EXCEPTION 'Actor required' USING ERRCODE='22023'; END IF;
  CASE p_section
    WHEN 'profiles' THEN v_table := 'profiles'; v_scope := 't.id=$1';
    WHEN 'telemetry_consent' THEN v_table := 'telemetry_consent'; v_key := 'user_id'; v_scope := 't.user_id=$1';
    WHEN 'org_members','quiz_results','review_cards','certificates','payments','usage_records' THEN
      v_table := p_section; v_scope := 't.user_id=$1';
    WHEN 'stages' THEN
      v_table := 'stages'; v_cursor := '$2 COLLATE "C"';
      v_scope := 't.owner_id=$1 AND (t.org_id IS NULL OR EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.org_id AND m.user_id=$1))';
    WHEN 'scenes' THEN
      v_table := 'scenes'; v_cursor := '$2 COLLATE "C"';
      v_join := 'JOIN public.stages s ON s.id=t.stage_id';
      v_scope := 's.owner_id=$1 AND (s.org_id IS NULL OR EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=s.org_id AND m.user_id=$1))';
    WHEN 'pedagogy_telemetry' THEN
      v_table := 'pedagogy_telemetry';
      v_join := 'JOIN qalem_telemetry_private.subjects s ON s.subject_hash=t.subject_hash';
      v_scope := 's.user_id=$1';
    WHEN 'user_profiles' THEN v_table := 'user_profiles'; v_key := 'user_id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('user_id,culture,ui_language,preferences,updated_at',',');
    WHEN 'agent_reviews' THEN v_table := 'agent_reviews'; v_key := 'id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('id,agent_id,user_id,rating,comment,created_at',',');
    WHEN 'castings' THEN v_table := 'castings'; v_key := 'id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('id,user_id,course_id,session_no,lineup,lineup_hash,created_at',',');
    WHEN 'live_sessions' THEN v_table := 'live_sessions'; v_key := 'id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('id,course_id,user_id,casting_id,recorded,started_at,ended_at,last_position_ms',',');
    WHEN 'session_events' THEN v_table := 'session_events'; v_key := 'id'; v_scope := 's.user_id=$1';
      v_fields := string_to_array('id,session_id,ts_ms,actor,event_type,payload,audio_path,audio_bytes,created_at',',');
      v_join := 'JOIN public.live_sessions s ON s.id=t.session_id';
    WHEN 'evaluations' THEN v_table := 'evaluations'; v_key := 'id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('id,session_id,user_id,phase,answers,score,created_at',',');
    WHEN 'anchor_plans' THEN v_table := 'anchor_plans'; v_key := 'id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('id,session_id,user_id,opted_in_at,paused,ends_at',',');
    WHEN 'anchor_deliveries' THEN v_table := 'anchor_deliveries'; v_key := 'id'; v_scope := 's.user_id=$1';
      v_fields := string_to_array('id,plan_id,seed_id,delivery_kind,scheduled_for,sent_at,opened_at,attempt_count',',');
      v_join := 'JOIN public.anchor_plans s ON s.id=t.plan_id';
    WHEN 'seeds' THEN v_table := 'seeds'; v_key := 'id'; v_scope := 's.user_id=$1';
      v_fields := string_to_array('id,session_id,persona,kind,content,status,created_at',',');
      v_join := 'JOIN public.live_sessions s ON s.id=t.session_id';
    WHEN 'seed_generation_runs' THEN v_table := 'seed_generation_runs'; v_key := 'session_id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('session_id,user_id,org_id,prompt_version,status,input_tokens,output_tokens,started_at,completed_at',',');
    WHEN 'classroom_intervention_decisions' THEN v_table := 'classroom_intervention_decisions'; v_key := 'decision_id'; v_scope := 't.learner_user_id=$1';
      v_fields := string_to_array('decision_id,classroom_id,org_id,learner_user_id,interaction_id,scene_id,turn_index,agent_id,agent_name,trigger,form,reason,created_at',',');
    WHEN 'review_notification_preferences' THEN v_table := 'review_notification_preferences'; v_key := 'user_id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('user_id,email_enabled,whatsapp_enabled,whatsapp_number,locale,created_at,updated_at',',');
    WHEN 'review_notification_deliveries' THEN v_table := 'review_notification_deliveries'; v_key := 'id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('id,user_id,channel,due_count,review_card_id,status,attempt_count,error_code,sent_at,created_at',',');
    WHEN 'push_subscriptions' THEN v_table := 'push_subscriptions'; v_key := 'id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('id,user_id,expiration_time,last_success_at,last_failure_at,created_at,updated_at',',');
    WHEN 'web_push_deliveries' THEN v_table := 'web_push_deliveries'; v_key := 'id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('id,user_id,subscription_id,status,push_service_status,error_code,created_at',',');
    WHEN 'lti_user_bindings' THEN v_table := 'lti_user_bindings'; v_key := 'id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('id,client_id,org_id,lms_subject,user_id,created_at',',');
    WHEN 'lti_launch_sessions' THEN v_table := 'lti_launch_sessions'; v_key := 'id'; v_scope := 's.user_id=$1';
      v_fields := string_to_array('id,client_id,org_id,resource_binding_id,user_binding_id,created_at,expires_at',',');
      v_join := 'JOIN public.lti_user_bindings s ON s.id=t.user_binding_id AND s.client_id=t.client_id AND s.org_id=t.org_id';
    WHEN 'lti_quiz_attempts' THEN v_table := 'lti_quiz_attempts'; v_key := 'id'; v_scope := 's.user_id=$1';
      v_fields := string_to_array('id,request_id,client_id,org_id,resource_binding_id,user_binding_id,stage_id,scene_id,answers,result,created_at',',');
      v_join := 'JOIN public.lti_user_bindings s ON s.id=t.user_binding_id AND s.client_id=t.client_id AND s.org_id=t.org_id';
    WHEN 'lti_grade_outbox' THEN v_table := 'lti_grade_outbox'; v_key := 'id'; v_scope := 's.user_id=$1';
      v_fields := string_to_array('id,request_id,client_id,org_id,resource_binding_id,user_binding_id,scene_id,score,score_changed_at,status,attempt_count,sent_at,created_at',',');
      v_join := 'JOIN public.lti_user_bindings s ON s.id=t.user_binding_id AND s.client_id=t.client_id AND s.org_id=t.org_id';
    WHEN 'lti_grade_submissions' THEN v_table := 'lti_grade_submissions'; v_key := 'id'; v_scope := 't.user_id=$1';
      v_fields := string_to_array('id,user_id,client_id,resource_link_id,score_given,score_maximum,activity_progress,grading_progress,success,created_at',',');
    WHEN 'transmissions' THEN v_table := 'transmissions'; v_key := 'id'; v_scope := '(t.sender_user_id=$1 OR t.recipient_user_id=$1)';
      v_fields := string_to_array('id,stage_id,status,created_at,updated_at',',');
    WHEN 'courses' THEN v_table := 'courses'; v_key := 'id'; v_scope := 't.owner_id=$1 AND (t.org_id IS NULL OR EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.org_id AND m.user_id=$1))';
      v_fields := string_to_array('id,owner_id,org_id,stage_id,title,language,source_kind,import_id,outline,status,catalog_visible,created_at,updated_at,source_manifest_id',',');
    WHEN 'course_imports' THEN v_table := 'course_imports'; v_key := 'id'; v_scope := 't.owner_id=$1 AND EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.source_org_id AND m.user_id=$1) AND NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.import_id=t.id AND c.org_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=c.org_id AND m.user_id=$1))';
      v_fields := string_to_array('id,owner_id,source_org_id,original_filename,storage_path,canvas_version,validation_status,validation_report,created_at',',');
    WHEN 'agent_configs' THEN v_table := 'agent_configs'; v_key := 'id'; v_scope := 't.owner_id=$1 AND (t.org_id IS NULL OR EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.org_id AND m.user_id=$1))';
      v_fields := string_to_array('id,owner_id,org_id,name,role,persona,avatar,color,priority,allowed_actions,is_published,created_at,updated_at,usage_count,avg_rating,tags,description,profile_extensions',',');
    WHEN 'organization_sources' THEN v_table := 'organization_sources'; v_key := 'id'; v_scope := 't.owner_id=$1 AND (t.org_id IS NULL OR EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.org_id AND m.user_id=$1))';
      v_fields := string_to_array('id,org_id,owner_id,name,mime_type,size_bytes,content_hash,parser_id,text_content,status,created_at,updated_at',',');
    WHEN 'formation_source_manifests' THEN v_table := 'formation_source_manifests'; v_key := 'id'; v_scope := 't.owner_id=$1 AND (t.org_id IS NULL OR EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.org_id AND m.user_id=$1))';
      v_fields := string_to_array('id,org_id,owner_id,version,source_ids,previous_manifest_id,created_at',',');
    WHEN 'shared_classrooms' THEN v_table := 'shared_classrooms'; v_key := 'id'; v_scope := 't.shared_by=$1 AND EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.org_id AND m.user_id=$1)';
      v_fields := string_to_array('id,stage_id,org_id,shared_by,visibility,created_at',',');
    WHEN 'export_jobs' THEN v_table := 'export_jobs'; v_key := 'id'; v_scope := 't.owner_id=$1';
      v_fields := string_to_array('id,stage_id,owner_id,format,status,scene_count,created_at,updated_at',',');
    WHEN 'video_generation_jobs' THEN v_table := 'video_generation_jobs'; v_key := 'id'; v_scope := 't.owner_id=$1';
      v_fields := string_to_array('id,owner_id,org_id,provider_id,model_id,status,created_at,updated_at',',');
    WHEN 'video_capsules' THEN v_table := 'video_capsules'; v_key := 'id'; v_scope := 't.owner_id=$1';
      v_fields := string_to_array('id,stage_id,scene_id,owner_id,status,brief,created_at,updated_at',',');
    WHEN 'classroom_generation_jobs' THEN v_table := 'classroom_generation_jobs'; v_key := 'id'; v_scope := 't.owner_id=$1';
      v_fields := string_to_array('id,owner_id,org_id,status,created_at,updated_at',',');
    WHEN 'tenant_usage_reservations' THEN v_table := 'tenant_usage_reservations'; v_key := 'id'; v_scope := 't.actor_user_id=$1';
      v_fields := string_to_array('id,org_id,actor_user_id,billable_unit,max_quantity,actual_quantity,reserved_credit_microunits,actual_credit_microunits,status,created_at,settled_at',',');
    WHEN 'tenant_credit_ledger' THEN v_table := 'tenant_credit_ledger'; v_key := 'id'; v_scope := 't.actor_user_id=$1';
      v_fields := string_to_array('id,org_id,actor_user_id,entry_type,delta_microunits,billable_unit,quantity,created_at',',');
    WHEN 'tenant_admin_audit' THEN v_table := 'tenant_admin_audit'; v_key := 'id'; v_scope := 't.actor_user_id=$1';
      v_fields := string_to_array('id,tenant_id,actor_user_id,action,created_at',',');
    WHEN 'xapi_outbox' THEN v_table := 'xapi_outbox'; v_key := 'id'; v_scope := '(t.statement->''actor''->>''mbox'') IN (''mailto:'' || $1::text || ''@qalem.local'',''mailto:'' || $1::text || ''@qalem.invalid'')';
      v_fields := string_to_array('id,org_id,statement,status,created_at,updated_at,attempt_count,sent_at',',');
    WHEN 'classroom_templates' THEN v_table := p_section;
      v_scope := 't.created_by=$1 AND (t.org_id IS NULL OR EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.org_id AND m.user_id=$1))';
      v_fields := string_to_array('id,name,sector,description,requirements,agent_config_ids,skill_ids,org_id,created_by,language,created_at',',');
    WHEN 'curriculum_links' THEN v_table := p_section;
      v_scope := 't.created_by=$1 AND EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.org_id AND m.user_id=$1)';
      v_fields := string_to_array('id,from_stage_id,to_stage_id,relation_type,org_id,created_by,created_at',',');
    WHEN 'org_invitations' THEN v_table := p_section;
      v_scope := 't.created_by=$1 AND EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.org_id AND m.user_id=$1)';
      -- Export the actor's invitation activity, not recipient coordinates or access tokens.
      v_fields := string_to_array('id,org_id,role,expires_at,used_at,created_by,created_at',',');
    WHEN 'organization_skills' THEN v_table := p_section;
      v_scope := 't.installed_by=$1 AND EXISTS(SELECT 1 FROM public.org_members m JOIN public.organizations o ON o.id=m.org_id AND o.status=''active'' WHERE m.org_id=t.org_id AND m.user_id=$1)';
      v_fields := string_to_array('id,org_id,skill_id,manifest,installed_by,created_at,updated_at',',');
    WHEN 'widget_templates' THEN v_table := p_section; v_scope := 't.created_by=$1';
      v_fields := string_to_array('id,slug,title,created_by,draft_version_id,published_version_id,created_at,updated_at',',');
    WHEN 'widget_template_versions' THEN v_table := p_section;
      v_scope := '(t.created_by=$1 OR (t.published_by=$1 AND t.published_at IS NOT NULL))';
      v_fields := string_to_array('id,template_id,version_number,composition,created_by,created_at,published_at,published_by',',');
    WHEN 'widget_template_publications' THEN v_table := p_section; v_scope := 't.published_by=$1';
      v_fields := string_to_array('id,template_id,version_id,published_by,published_at',',');
    ELSE RAISE EXCEPTION 'Unsupported export section' USING ERRCODE='22023';
  END CASE;
  IF v_fields IS NULL THEN
    CASE v_table
      WHEN 'profiles' THEN v_fields := string_to_array('id,nickname,avatar,bio,locale,created_at,updated_at,culture,ui_language,preferences',',');
      WHEN 'org_members' THEN v_fields := string_to_array('id,user_id,org_id,role,created_at',',');
      WHEN 'stages' THEN v_fields := string_to_array('id,owner_id,org_id,name,description,language,style,agent_ids,created_at,updated_at,extra',',');
      WHEN 'scenes' THEN v_fields := string_to_array('id,stage_id,type,title,order,content,actions,created_at,updated_at,extra',',');
      WHEN 'quiz_results' THEN v_fields := string_to_array('id,user_id,org_id,stage_id,scene_id,answers,score,completed_at',',');
      WHEN 'review_cards' THEN v_fields := string_to_array('id,user_id,question,correct_answer,user_answer,difficulty,stability,due_date,last_review,reps,lapses,tags,source_stage_id,source_scene_id,created_at,updated_at,source_ids',',');
      WHEN 'certificates' THEN v_fields := string_to_array('id,user_id,stage_id,course_name,learner_name,completion_date,score,skills,verification_code,issued_by,org_id,issuance_org_id,created_at',',');
      WHEN 'payments' THEN v_fields := string_to_array('id,user_id,org_id,provider,amount,currency,status,transaction_id,created_at,updated_at',',');
      WHEN 'usage_records' THEN v_fields := string_to_array('id,org_id,user_id,metric,quantity,billing_period,recorded_at',',');
      WHEN 'telemetry_consent' THEN v_fields := string_to_array('user_id,pedagogy_consent,xapi_consent,consented_at',',');
      WHEN 'pedagogy_telemetry' THEN v_fields := string_to_array('id,user_hash,subject_hash,session_id,org_id,stage_id,scene_sequence,scene_durations,quiz_scores,completion_rate,total_duration,subject_tags,language,level,agent_count,action_counts,scene_observations,created_at',',');
    END CASE;
  END IF;
  SELECT coalesce(array_agg(column_name::text),ARRAY[]::text[]) INTO v_bigint_fields
    FROM information_schema.columns WHERE table_schema='public' AND table_name=v_table AND data_type='bigint';
  v_order := format('t.%I',v_key);
  IF v_table IN ('stages','scenes','agent_configs','classroom_generation_jobs','classroom_intervention_decisions') THEN
    v_order := v_order || ' COLLATE "C"'; v_cursor := '$2 COLLATE "C"';
  END IF;
  v_export_cursor := format('t.%I::text',v_key);
  IF v_table IN ('session_events','xapi_outbox') THEN
    v_cursor := '$2::bigint';
    v_export_cursor := 'lpad(t.id::text,20,''0'')';
  END IF;
  IF v_fields IS NOT NULL THEN
    -- Exact columns only: future token/credential columns cannot silently enter exports.
    -- Bigint strings preserve exact IDs, counters and monetary quantities through JavaScript.
    v_value := '(SELECT jsonb_object_agg(e.key,CASE WHEN e.key=ANY($4::text[]) THEN to_jsonb(e.value #>> ''{}'') ELSE e.value END) FROM jsonb_each(to_jsonb(t)) e WHERE e.key=ANY($3::text[]))';
  END IF;
  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY page.cursor COLLATE "C"),''[]''::jsonb) FROM (SELECT %s AS cursor, %s AS value FROM public.%I t %s WHERE %s AND ($2 IS NULL OR %s > %s) ORDER BY %s LIMIT 100) page',
    v_export_cursor,v_value,v_table,v_join,v_scope,v_order,v_cursor,v_order
  ) INTO v_rows USING p_actor,p_after,v_fields,v_bigint_fields;
  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.read_account_export_page(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_export_page(uuid,text,text) TO service_role;
