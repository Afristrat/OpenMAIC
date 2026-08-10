import type { Action } from '@/lib/types/action';
import type { PPTElement } from '@openmaic/dsl';

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sceneTranscript(actions: readonly Action[] | undefined): string {
  return (actions ?? [])
    .filter((action) => action.type === 'speech')
    .map((action) => action.text.trim())
    .filter(Boolean)
    .join('\n');
}

function elementContext(element: PPTElement | undefined): string {
  if (!element) return 'Nouvelle zone visuelle.';
  if (element.type === 'text') return `Texte sélectionné : ${plainText(element.content)}`;
  if (element.type === 'image') return 'Remplacement de l’image sélectionnée.';
  return `Remplacement de l’élément sélectionné de type ${element.type}.`;
}

/**
 * Produces an editable, narration-grounded image brief. The image model receives
 * the source narration verbatim so it can render the actual concept instead of
 * inventing a decorative visual unrelated to what the presenter says.
 */
export function buildEditorImagePrompt(input: {
  sceneTitle: string;
  actions: readonly Action[] | undefined;
  element?: PPTElement;
}): string {
  const transcript = sceneTranscript(input.actions);
  return [
    'Crée une illustration pédagogique originale pour une diapositive de formation professionnelle.',
    `Sujet de la diapositive : ${input.sceneTitle || 'Sans titre'}.`,
    elementContext(input.element),
    `Narration à représenter fidèlement : ${transcript || 'Aucune narration disponible. Appuie-toi uniquement sur le sujet.'}`,
    'Transforme le concept central en un visuel explicatif immédiatement compréhensible.',
    'Si la narration décrit un processus, un tableau, une matrice ou un schéma, représente réellement sa structure et ses relations.',
    'Composition 16:9, lisible dans une diapositive, hiérarchie nette, contraste accessible, marges de sécurité généreuses.',
    'N’ajoute ni logo inventé, ni filigrane, ni code couleur, ni texte décoratif, ni information absente de la narration.',
  ].join('\n');
}
