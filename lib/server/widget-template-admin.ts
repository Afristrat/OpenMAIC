import { z } from 'zod';
import {
  parseWidgetComposition,
  widgetCompositionSchema,
} from '@/lib/plugins/widget-composition';

export const createWidgetTemplateSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    title: z.string().trim().min(1).max(160),
    composition: widgetCompositionSchema,
  })
  .strict();

export const reviseWidgetTemplateSchema = createWidgetTemplateSchema.omit({ slug: true });
export const widgetTemplateVersionSchema = z
  .object({ versionId: z.string().uuid() })
  .strict();

export function validateComposition(value: unknown) {
  return parseWidgetComposition(value);
}
