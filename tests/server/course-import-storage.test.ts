import { describe, expect, it, vi } from 'vitest';
import {
  validateAndPersistCourseImport,
  type CourseImportRepository,
} from '@/lib/server/course-import-storage';

const validCanvas = `# Automatiser une tâche récurrente

## Résultat professionnel visé
Décider d’une première automatisation réversible dans son équipe.

## Pour qui et dans quel contexte
Responsables opérationnels de PME marocaines, débutants en IA.

## Chapitre 1 — Choisir une tâche utile
### Objectif observable
Prioriser une tâche à partir de son impact et de son risque.
### Contenu essentiel
Une tâche stable et vérifiable est une meilleure candidate.
### Mise en pratique ou point de contrôle
Classer trois tâches réelles avec une grille.

## Preuve finale d’application
Un plan d’expérimentation de deux semaines.`;

const ownerId = 'c4c3f298-d80c-44ab-aacb-cf0bb0d303d3';

function repository(): CourseImportRepository & { create: ReturnType<typeof vi.fn> } {
  return { create: vi.fn().mockResolvedValue({ id: 'import-1' }) };
}

describe('validateAndPersistCourseImport', () => {
  it('persists a conforming import with an empty validation report', async () => {
    const store = repository();

    await expect(
      validateAndPersistCourseImport(
        {
          ownerId,
          originalFilename: 'atelier.md',
          mimeType: 'text/markdown',
          text: validCanvas,
          rightsAttested: true,
          storagePath: `${ownerId}/imports/atelier.md`,
        },
        store,
      ),
    ).resolves.toMatchObject({ importId: 'import-1', validation: { status: 'conform' } });

    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        validation_status: 'conform',
        validation_report: [],
      }),
    );
  });

  it('persists a rejected import with its actionable report', async () => {
    const store = repository();

    await expect(
      validateAndPersistCourseImport(
        {
          ownerId,
          originalFilename: 'notes.txt',
          mimeType: 'text/plain',
          text: '# Notes\n\nUne idée sans structure.',
          rightsAttested: false,
          storagePath: `${ownerId}/imports/notes.txt`,
        },
        store,
      ),
    ).resolves.toMatchObject({ importId: 'import-1', validation: { status: 'rejected' } });

    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({
        validation_status: 'rejected',
        validation_report: expect.arrayContaining([expect.objectContaining({ rule: 'CI-01' })]),
      }),
    );
  });

  it('refuses an import path that does not belong to its owner', async () => {
    const store = repository();

    await expect(
      validateAndPersistCourseImport(
        {
          ownerId,
          originalFilename: 'atelier.md',
          mimeType: 'text/markdown',
          text: validCanvas,
          rightsAttested: true,
          storagePath: 'another-user/imports/atelier.md',
        },
        store,
      ),
    ).rejects.toThrow('scoped to its owner');

    expect(store.create).not.toHaveBeenCalled();
  });
});
