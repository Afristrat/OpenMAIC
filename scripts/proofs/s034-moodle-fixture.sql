-- Dedicated real-integration data, not a mocked launch or a manufactured grade.
-- Apply once after the S-034 migrations and the two explicit Auth test users.
BEGIN;
SET LOCAL lock_timeout = '5s';
INSERT INTO public.organizations(id, name, seat_limit)
VALUES ('00000000-0034-4000-9000-202609090001', 'Recette LTI S034 — Données fictives', 2);
INSERT INTO public.org_members(user_id, org_id, role) VALUES
('5b58a2ea-9ee5-41e8-ad83-b868536e23b5', '00000000-0034-4000-9000-202609090001', 'apprenant'),
('bbf867f4-d1f5-45d8-9557-f46911c296cb', '00000000-0034-4000-9000-202609090001', 'apprenant');
INSERT INTO public.stages(id, org_id, name, description, language, style, agent_ids)
VALUES ('s034-moodle-20260909', '00000000-0034-4000-9000-202609090001',
  'Recette technique LTI', 'Données fictives — aucun contenu de formation.', 'fr-FR', 'professional', '{}');
INSERT INTO public.scenes(id, stage_id, type, title, "order", content, actions)
VALUES ('s034-moodle-quiz', 's034-moodle-20260909', 'quiz', 'Vérification des notes', 0,
  '{"type":"quiz","questions":[
    {"id":"q1","type":"single","question":"Contrôle technique à un point","points":1,
     "options":[{"label":"Réponse Alpha","value":"A"},{"label":"Réponse Bêta","value":"B"}],"answer":["A"]},
    {"id":"q2","type":"single","question":"Contrôle technique à trois points","points":3,
     "options":[{"label":"Réponse Gamma","value":"A"},{"label":"Réponse Delta","value":"B"}],"answer":["A"]}
  ]}'::jsonb, '[]'::jsonb);
INSERT INTO public.lti_registrations(client_id, issuer, jwks_url, auth_url, token_url, deployment_id, org_id)
VALUES ('P2w5UO5AktgXaHj', 'https://lms-test.qalem.ma',
  'https://lms-test.qalem.ma/mod/lti/certs.php', 'https://lms-test.qalem.ma/mod/lti/auth.php',
  'https://lms-test.qalem.ma/mod/lti/token.php', '1', '00000000-0034-4000-9000-202609090001');
INSERT INTO public.lti_resource_bindings(client_id, org_id, resource_link_id, stage_id)
VALUES ('P2w5UO5AktgXaHj', '00000000-0034-4000-9000-202609090001', '1', 's034-moodle-20260909');
INSERT INTO public.lti_user_bindings(client_id, org_id, lms_subject, user_id) VALUES
('P2w5UO5AktgXaHj', '00000000-0034-4000-9000-202609090001', '3', '5b58a2ea-9ee5-41e8-ad83-b868536e23b5'),
('P2w5UO5AktgXaHj', '00000000-0034-4000-9000-202609090001', '4', 'bbf867f4-d1f5-45d8-9557-f46911c296cb');
COMMIT;
