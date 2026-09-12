-- S3-013 — Persistent, user-controlled delivery boundaries shared by reminder channels.
ALTER TABLE public.review_notification_preferences
  ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 64),
  ADD COLUMN quiet_start TIME,
  ADD COLUMN quiet_end TIME,
  ADD COLUMN daily_cap INTEGER NOT NULL DEFAULT 3 CHECK (daily_cap BETWEEN 1 AND 10),
  ADD COLUMN paused_until TIMESTAMPTZ,
  ADD CONSTRAINT review_notification_preferences_quiet_window_check
    CHECK ((quiet_start IS NULL) = (quiet_end IS NULL));
