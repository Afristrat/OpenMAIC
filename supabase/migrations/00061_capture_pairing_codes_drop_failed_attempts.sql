-- =============================================================================
-- Migration 00061: retire capture_pairing_codes.failed_attempts
-- Un code inconnu n'appartient à aucune ligne : le compteur d'échecs par ligne ne peut jamais
-- s'incrémenter. La limite d'essais se fait par adresse cliente (access-code-throttle), dans la
-- route d'appairage. Une colonne que rien n'écrit est de la dette, elle part avec sa création.
--
-- Retour arrière :
--   ALTER TABLE public.capture_pairing_codes
--     ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0);
-- =============================================================================

ALTER TABLE public.capture_pairing_codes DROP COLUMN failed_attempts;
