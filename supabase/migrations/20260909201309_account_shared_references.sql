-- These nullable columns are attribution, not ownership of tenant resources.
-- Preserve the resource and detach its author atomically with profile deletion.
ALTER TABLE public.classroom_templates
  DROP CONSTRAINT classroom_templates_created_by_fkey,
  ADD CONSTRAINT classroom_templates_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.curriculum_links
  DROP CONSTRAINT curriculum_links_created_by_fkey,
  ADD CONSTRAINT curriculum_links_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.org_invitations
  DROP CONSTRAINT org_invitations_created_by_fkey,
  ADD CONSTRAINT org_invitations_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.payments
  DROP CONSTRAINT payments_user_id_fkey,
  ADD CONSTRAINT payments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.shared_classrooms
  DROP CONSTRAINT shared_classrooms_shared_by_fkey,
  ADD CONSTRAINT shared_classrooms_shared_by_fkey
    FOREIGN KEY (shared_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
