-- U-011: retain advanced agent attributes without overloading voice_config.
ALTER TABLE public.agent_configs
  ADD COLUMN profile_extensions jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(profile_extensions) = 'object');

COMMENT ON COLUMN public.agent_configs.profile_extensions IS
  'Validated advanced agent profile: interaction weight, mechanism, gender, voice design and occupational profile.';
