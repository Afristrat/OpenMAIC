-- Cover LTI foreign keys so tenant/resource revocation does not scan the queues.
CREATE INDEX lti_registration_org_idx ON public.lti_registrations(org_id);
CREATE INDEX lti_resource_platform_idx ON public.lti_resource_bindings(client_id, org_id);
CREATE INDEX lti_user_platform_idx ON public.lti_user_bindings(client_id, org_id);
CREATE INDEX lti_outbox_resource_idx ON public.lti_grade_outbox(resource_binding_id, client_id, org_id);
CREATE INDEX lti_attempt_resource_idx ON public.lti_quiz_attempts(resource_binding_id, client_id, org_id);
CREATE INDEX lti_nonce_client_idx ON public.lti_nonces(client_id);
CREATE INDEX lti_submission_client_idx ON public.lti_grade_submissions(client_id);
