CREATE TABLE public.organization_learning_territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  country_name text NOT NULL CHECK (char_length(btrim(country_name)) BETWEEN 2 AND 120),
  country_name_normalized text NOT NULL,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  language_code text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, country_name_normalized)
);

CREATE INDEX organization_learning_territories_org_idx
  ON public.organization_learning_territories(org_id, country_name_normalized);

ALTER TABLE public.organization_learning_territories ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_learning_territories_select_member
  ON public.organization_learning_territories FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.org_members membership
    WHERE membership.org_id = organization_learning_territories.org_id
      AND membership.user_id = auth.uid()
  ));

CREATE POLICY organization_learning_territories_write_author
  ON public.organization_learning_territories FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.org_members membership
    WHERE membership.org_id = organization_learning_territories.org_id
      AND membership.user_id = auth.uid()
      AND membership.role IN ('admin', 'manager', 'author')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.org_members membership
    WHERE membership.org_id = organization_learning_territories.org_id
      AND membership.user_id = auth.uid()
      AND membership.role IN ('admin', 'manager', 'author')
  ));
