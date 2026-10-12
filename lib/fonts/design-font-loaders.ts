/**
 * Lazy loaders of the authorized design fonts (`DESIGN_FONTS`), so the classroom player renders a
 * slide with the font its design names instead of a generic serif. Each loader pulls the regular
 * and bold faces of one family; the browser then downloads only the files a slide really uses.
 * Inter is declared in `app/globals.css`.
 */
import type { DESIGN_FONTS } from '@openmaic/dsl';

type DesignFont = (typeof DESIGN_FONTS)[number];

export const DESIGN_FONT_LOADERS: Partial<Record<DesignFont, () => Promise<unknown>>> = {
  Roboto: () =>
    Promise.all([import('@fontsource/roboto/400.css'), import('@fontsource/roboto/700.css')]),
  'Open Sans': () =>
    Promise.all([import('@fontsource/open-sans/400.css'), import('@fontsource/open-sans/700.css')]),
  Montserrat: () =>
    Promise.all([
      import('@fontsource/montserrat/400.css'),
      import('@fontsource/montserrat/700.css'),
    ]),
  'Source Sans 3': () =>
    Promise.all([
      import('@fontsource/source-sans-3/400.css'),
      import('@fontsource/source-sans-3/700.css'),
    ]),
  Merriweather: () =>
    Promise.all([
      import('@fontsource/merriweather/400.css'),
      import('@fontsource/merriweather/700.css'),
    ]),
  Literata: () =>
    Promise.all([import('@fontsource/literata/400.css'), import('@fontsource/literata/700.css')]),
  'Source Serif 4': () =>
    Promise.all([
      import('@fontsource/source-serif-4/400.css'),
      import('@fontsource/source-serif-4/700.css'),
    ]),
  'JetBrains Mono': () =>
    Promise.all([
      import('@fontsource/jetbrains-mono/400.css'),
      import('@fontsource/jetbrains-mono/700.css'),
    ]),
};
