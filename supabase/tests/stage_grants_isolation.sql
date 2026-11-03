-- Test d'isolation du partage par formation (stage_grants).
-- À jouer APRÈS la migration 20261103120000, dans une transaction annulée :
--   BEGIN; \i migrations/20261103120000_stage_grants.sql; \i tests/stage_grants_isolation.sql; ROLLBACK;
-- Toute assertion qui échoue lève une exception et interrompt la transaction.

-- Deux comptes jetables : un bénéficiaire et un étranger (aucune adhésion à une organisation).
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'grantee-test@qalem.invalid'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'stranger-test@qalem.invalid');

DO $$
DECLARE
  stage_a TEXT;
  stage_b TEXT;
  visible INT;
  denied BOOLEAN;
BEGIN
  -- Deux formations existantes qui possèdent des scènes.
  SELECT s.id INTO stage_a FROM public.stages s
    WHERE EXISTS (SELECT 1 FROM public.scenes c WHERE c.stage_id = s.id) ORDER BY s.id LIMIT 1;
  SELECT s.id INTO stage_b FROM public.stages s
    WHERE s.id <> stage_a AND EXISTS (SELECT 1 FROM public.scenes c WHERE c.stage_id = s.id)
    ORDER BY s.id LIMIT 1;
  IF stage_a IS NULL OR stage_b IS NULL THEN
    RAISE EXCEPTION 'Test impossible : il faut deux formations avec scènes';
  END IF;
  PERFORM set_config('test.stage_a', stage_a, true);
  PERFORM set_config('test.stage_b', stage_b, true);

  -- Le droit est créé par le serveur (rôle de la session de test = propriétaire).
  INSERT INTO public.stage_grants (stage_id, user_id)
    VALUES (stage_a, 'aaaaaaaa-0000-4000-8000-000000000001');
END $$;

-- Le bénéficiaire.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true);

DO $$
DECLARE
  stage_a TEXT := current_setting('test.stage_a');
  visible INT;
  denied BOOLEAN := false;
BEGIN
  SELECT count(*) INTO visible FROM public.stages;
  IF visible <> 1 THEN RAISE EXCEPTION 'Le bénéficiaire voit % formations au lieu de 1', visible; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stages WHERE id = stage_a) THEN
    RAISE EXCEPTION 'Le bénéficiaire ne voit pas la formation reçue';
  END IF;
  SELECT count(*) INTO visible FROM public.scenes WHERE stage_id <> stage_a;
  IF visible <> 0 THEN RAISE EXCEPTION 'Le bénéficiaire lit % scènes d''une autre formation', visible; END IF;
  SELECT count(*) INTO visible FROM public.scenes WHERE stage_id = stage_a;
  IF visible = 0 THEN RAISE EXCEPTION 'Le bénéficiaire ne lit aucune scène de la formation reçue'; END IF;
  SELECT count(*) INTO visible FROM public.shared_classrooms;
  IF visible <> 0 THEN RAISE EXCEPTION 'Le bénéficiaire liste % partages d''organisation', visible; END IF;
  SELECT count(*) INTO visible FROM public.stage_grants;
  IF visible <> 1 THEN RAISE EXCEPTION 'Le bénéficiaire voit % droits au lieu de son seul droit', visible; END IF;

  -- Aucune écriture directe : ni création de droit, ni modification de la formation.
  BEGIN
    INSERT INTO public.stage_grants (stage_id, user_id)
      VALUES (current_setting('test.stage_b'), 'aaaaaaaa-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN denied := true;
  END;
  IF NOT denied THEN RAISE EXCEPTION 'Le bénéficiaire a pu créer un droit lui-même'; END IF;

  UPDATE public.stages SET name = name || ' (modifié)' WHERE id = stage_a;
  GET DIAGNOSTICS visible = ROW_COUNT;
  IF visible <> 0 THEN RAISE EXCEPTION 'Le bénéficiaire a pu modifier la formation'; END IF;
END $$;

-- L'étranger : aucun droit, aucune lecture.
SELECT set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-000000000002","role":"authenticated"}', true);

DO $$
DECLARE visible INT;
BEGIN
  SELECT count(*) INTO visible FROM public.stages;
  IF visible <> 0 THEN RAISE EXCEPTION 'L''étranger voit % formations', visible; END IF;
  SELECT count(*) INTO visible FROM public.scenes;
  IF visible <> 0 THEN RAISE EXCEPTION 'L''étranger lit % scènes', visible; END IF;
  SELECT count(*) INTO visible FROM public.stage_grants;
  IF visible <> 0 THEN RAISE EXCEPTION 'L''étranger voit % droits', visible; END IF;
  SELECT count(*) INTO visible FROM public.shared_classrooms;
  IF visible <> 0 THEN RAISE EXCEPTION 'L''étranger liste % partages (dont les publics)', visible; END IF;
END $$;

RESET ROLE;
SELECT 'ISOLATION OK' AS resultat;
