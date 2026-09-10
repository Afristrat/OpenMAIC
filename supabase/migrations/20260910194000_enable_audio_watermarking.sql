-- AudioSeal remains disabled until its local sidecar and P2-C robustness proof
-- are both certified. Workers fail closed when this row is absent or false.
INSERT INTO public.feature_flags (flag_name, enabled, scope, description)
VALUES (
  'watermarking',
  false,
  'global',
  'Filigrane AudioSeal asynchrone par transmission ; activation après preuve P2-C et conformité documentée.'
)
ON CONFLICT (flag_name) DO NOTHING;
