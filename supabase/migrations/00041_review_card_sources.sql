-- S-025 — Preserve the stable quiz provenance carried by every review card.

ALTER TABLE public.review_cards
  ADD COLUMN source_ids TEXT[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.review_cards
SET source_ids = ARRAY_REMOVE(ARRAY[source_stage_id, source_scene_id], NULL)
WHERE cardinality(source_ids) = 0;

ALTER TABLE public.review_cards
  ADD CONSTRAINT review_cards_source_ids_bounded
  CHECK (cardinality(source_ids) <= 16);

COMMENT ON COLUMN public.review_cards.source_ids IS
  'Stable source chain emitted by the quiz extractor: stage, scene and question identifiers.';
