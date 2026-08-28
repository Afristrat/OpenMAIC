import { randomUUID } from 'node:crypto';
import { importCanvasToClassroomPlan } from '@/lib/courses/import-canvas-to-plan';
import type { CanvasValidationResult } from '@/lib/courses/import-canvas-validator';
import type { PDFProviderId } from '@/lib/pdf/types';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { ClassroomPlan } from '@/lib/types/generation';
import { extractCourseImportDocument } from './course-import-document';
import { validateAndPersistCourseImport } from './course-import-storage';
import { persistImportedCourseDraft } from './course-storage';
import { ingestOrganizationSource, replaceSourceManifest } from './formation-source-library';

const IMPORT_BUCKET = 'classroom-media';

function extensionOf(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

export interface CourseImportPipelineResult {
  importId: string;
  validation: CanvasValidationResult;
  courseId?: string;
  sourceManifestId?: string;
  plan?: ClassroomPlan;
}

export async function runCourseImportPipeline(input: {
  ownerId: string;
  orgId: string;
  originalFilename: string;
  mimeType: string;
  buffer: Buffer;
  rightsAttested: boolean;
  pdfProviderId?: PDFProviderId;
  pdfApiKey?: string;
  pdfBaseUrl?: string;
}): Promise<CourseImportPipelineResult> {
  const extracted = await extractCourseImportDocument({
    buffer: input.buffer,
    fileName: input.originalFilename,
    fileSize: input.buffer.byteLength,
    mimeType: input.mimeType,
    pdfProviderId: input.pdfProviderId,
    pdfApiKey: input.pdfApiKey,
    pdfBaseUrl: input.pdfBaseUrl,
  });
  const extension = extensionOf(input.originalFilename);
  const storagePath = `${input.ownerId}/course-imports/${randomUUID()}.${extension}`;
  const storage = createServiceSupabaseClient().storage.from(IMPORT_BUCKET);
  const { error: uploadError } = await storage.upload(storagePath, input.buffer, {
    contentType: input.mimeType,
    upsert: false,
  });
  if (uploadError) throw new Error(`Failed to store course import: ${uploadError.message}`);

  let importPersisted = false;
  try {
    const persisted = await validateAndPersistCourseImport({
      ownerId: input.ownerId,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      text: extracted.content.text,
      rightsAttested: input.rightsAttested,
      storagePath,
    });
    importPersisted = true;
    if (persisted.validation.status === 'rejected') return persisted;

    const language = persisted.validation.language;
    if (!language) throw new Error('A conforming course import must have a supported language');
    const plan = importCanvasToClassroomPlan(extracted.content.text, language);
    const source = await ingestOrganizationSource({
      orgId: input.orgId,
      ownerId: input.ownerId,
      name: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.buffer.byteLength,
      parserId: extracted.parserId,
      content: extracted.content,
    });
    const manifest = await replaceSourceManifest({
      orgId: input.orgId,
      ownerId: input.ownerId,
      sourceIds: [source.source.id],
    });
    const courseId = await persistImportedCourseDraft({
      ownerId: input.ownerId,
      orgId: input.orgId,
      importId: persisted.importId,
      sourceManifestId: manifest.id,
      title: plan.courseTitle,
      language,
      outlines: plan.outlines,
    });
    return {
      ...persisted,
      courseId,
      sourceManifestId: manifest.id,
      plan,
    };
  } catch (error) {
    if (!importPersisted) await storage.remove([storagePath]);
    throw error;
  }
}
