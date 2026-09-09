-- Only the authenticated server may choose the actor. No arbitrary table access.
CREATE FUNCTION public.read_account_export_page(p_actor uuid, p_section text, p_after text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_table text;
  v_key text := 'id';
  v_join text := '';
  v_scope text;
  v_cursor text := '$2::uuid';
  v_order text;
  v_rows jsonb;
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
    ELSE RAISE EXCEPTION 'Unsupported export section' USING ERRCODE='22023';
  END CASE;
  v_order := format('t.%I',v_key);
  IF v_table IN ('stages','scenes') THEN v_order := v_order || ' COLLATE "C"'; END IF;
  EXECUTE format(
    'SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY page.cursor COLLATE "C"),''[]''::jsonb) FROM (SELECT t.%I::text AS cursor, to_jsonb(t) AS value FROM public.%I t %s WHERE %s AND ($2 IS NULL OR %s > %s) ORDER BY %s LIMIT 100) page',
    v_key,v_table,v_join,v_scope,v_order,v_cursor,v_order
  ) INTO v_rows USING p_actor,p_after;
  RETURN v_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.read_account_export_page(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_account_export_page(uuid,text,text) TO service_role;
