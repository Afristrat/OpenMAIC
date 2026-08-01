import { validateImportCanvas, type CanvasValidationResult } from '@/lib/courses/import-canvas-validator';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { CourseImportInsert } from '@/lib/supabase/types';

export interface PersistedCourseImport {
  id: string;
}

export interface CourseImportRepository {
  create(input: CourseImportInsert): Promise<PersistedCourseImport>;
}

function assertOwnedStoragePath(ownerId: string, storagePath: string): void {
  if (!storagePath.startsWith(`${ownerId}/`)) {
    throw new Error('Course import storage path must be scoped to its owner');
  }
}

const serviceCourseImportRepository: CourseImportRepository = {
  async create(input) {
    const { data, error } = await createServiceSupabaseClient()
      .from('course_imports')
      .insert(input)
      .select('id')
      .single();
    if (error) throw new Error(`Failed to persist course import: ${error.message}`);
    return data;
  },
};

export async function validateAndPersistCourseImport(
  input: {
    ownerId: string;
    originalFilename: string;
    mimeType: string;
    text: string;
    rightsAttested: boolean;
    storagePath: string;
  },
  repository: CourseImportRepository = serviceCourseImportRepository,
): Promise<{ importId: string; validation: CanvasValidationResult }> {
  assertOwnedStoragePath(input.ownerId, input.storagePath);

  const validation = validateImportCanvas(input);
  const persisted = await repository.create({
    owner_id: input.ownerId,
    original_filename: input.originalFilename,
    storage_path: input.storagePath,
    canvas_version: validation.canvasVersion,
    validation_status: validation.status,
    validation_report: validation.issues,
  });

  return { importId: persisted.id, validation };
}
