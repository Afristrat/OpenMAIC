import { describe, expect, it } from 'vitest';
import { validateImportCanvas } from '@/lib/courses/import-canvas-validator';

const validDocument = `# Automatiser une tâche récurrente

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

describe('validateImportCanvas', () => {
  it('accepts a conforming French v1 canvas', () => {
    expect(
      validateImportCanvas({
        originalFilename: 'atelier.md',
        mimeType: 'text/markdown',
        text: validDocument,
        rightsAttested: true,
      }),
    ).toMatchObject({
      status: 'conform',
      language: 'fr-FR',
      issues: [],
      outlinePreview: {
        title: 'Automatiser une tâche récurrente',
        chapters: ['Chapitre 1 — Choisir une tâche utile'],
      },
    });
  });

  it('returns actionable rule identifiers for a non-conforming document', () => {
    const result = validateImportCanvas({
      originalFilename: 'notes.txt',
      mimeType: 'text/plain',
      text: '# Notes\n\nUne idée sans structure. Contact : personne@example.com',
      rightsAttested: false,
    });

    expect(result.status).toBe('rejected');
    expect(result.issues.map((entry) => entry.rule)).toEqual(
      expect.arrayContaining(['CI-01', 'CI-05', 'CI-07', 'CI-11', 'CI-12']),
    );
    expect(result.issues.every((entry) => entry.message.startsWith(`Règle ${entry.rule}`))).toBe(
      true,
    );
  });

  it('rejects required headings whose body is empty', () => {
    const result = validateImportCanvas({
      originalFilename: 'atelier.md',
      mimeType: 'text/markdown',
      text: validDocument.replace(
        '### Contenu essentiel\nUne tâche stable et vérifiable est une meilleure candidate.',
        '### Contenu essentiel',
      ),
      rightsAttested: true,
    });

    expect(result.status).toBe('rejected');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        rule: 'CI-09',
        path: 'Chapitre 1 — Choisir une tâche utile',
      }),
    );
  });

  it('rejects duplicate main titles and required subsections outside chapters', () => {
    const result = validateImportCanvas({
      originalFilename: 'atelier.md',
      mimeType: 'text/markdown',
      text: `${validDocument}\n\n# Deuxième titre\n### Objectif observable\nHors chapitre.`,
      rightsAttested: true,
    });

    expect(result.issues.map((entry) => entry.rule)).toEqual(
      expect.arrayContaining(['CI-04', 'CI-13']),
    );
  });
});
