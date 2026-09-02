-- U-008 — Public verification stays available through the constrained server
-- endpoint; direct table reads remain restricted to the certificate owner.
DROP POLICY IF EXISTS "Public verification lookup" ON public.certificates;
