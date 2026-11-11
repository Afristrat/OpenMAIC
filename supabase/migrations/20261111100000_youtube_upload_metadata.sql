-- Métadonnées YouTube saisies dans le modal de publication : étiquettes, catégorie, langue.
-- Bornes de YouTube (developers.google.com/youtube/v3/docs/videos) : 500 caractères d'étiquettes
-- au total ; catégories assignables retenues pour une formation ; langues de Qalem.

ALTER TABLE public.youtube_uploads
  ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(tags) <= 100 AND length(array_to_string(tags, ',')) <= 500),
  ADD COLUMN category_id TEXT NOT NULL DEFAULT '27'
    CHECK (category_id IN ('22', '26', '27', '28', '29')),
  ADD COLUMN default_language TEXT
    CHECK (default_language IS NULL OR default_language IN ('fr', 'ar', 'en'));

COMMENT ON COLUMN public.youtube_uploads.tags IS
  'Étiquettes envoyées à YouTube (snippet.tags), 500 caractères au plus.';
COMMENT ON COLUMN public.youtube_uploads.category_id IS
  'Catégorie YouTube (snippet.categoryId) : 27 Éducation par défaut.';
COMMENT ON COLUMN public.youtube_uploads.default_language IS
  'Langue du titre, de la description et de la voix (snippet.defaultLanguage et defaultAudioLanguage).';
