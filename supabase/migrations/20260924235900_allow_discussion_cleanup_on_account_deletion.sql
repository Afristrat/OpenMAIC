-- Deleting an Auth identity cascades through classroom_quiz_attempts. Its
-- DELETE trigger must clear the linked analytical score even though GoTrue's
-- supabase_auth_admin role has no direct access to discussion_patterns.
-- Keep the table private: elevate only the fixed, argument-free trigger body.
ALTER FUNCTION qalem_quiz_private.publish_discussion_quiz_score() SECURITY DEFINER;

REVOKE ALL ON FUNCTION qalem_quiz_private.publish_discussion_quiz_score()
  FROM PUBLIC, anon, authenticated;
