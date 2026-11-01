-- Active l'émission xAPI vers le LRS chiffré des organisations.
-- Rien ne part sans trois conditions réunies : un LRS configuré et activé par l'organisation,
-- le consentement xAPI de l'apprenant et le consentement pédagogique (vérifiés par les déclencheurs de collecte).
UPDATE public.feature_flags
SET enabled = true
WHERE flag_name = 'xapi_emission';
