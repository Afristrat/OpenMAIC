import type { Action } from '@/lib/types/action';
import type { PPTElement } from '@openmaic/dsl';
import type { ImageGenerationOptions } from '@/lib/media/types';

export interface EditorImageBrief {
  prompt: string;
  negativePrompt: string;
}

interface TargetGeometry {
  width: number;
  height: number;
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function promptData(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function sceneTranscript(actions: readonly Action[] | undefined): string {
  return (actions ?? [])
    .filter((action) => action.type === 'speech')
    .map((action) => action.text.trim())
    .filter(Boolean)
    .join('\n');
}

export function editorImageTargetContext(element: PPTElement | undefined): string {
  if (!element) return 'Nouvelle zone visuelle.';
  if (element.type === 'text') return `Texte sélectionné : ${plainText(element.content)}`;
  if (element.type === 'image') return 'Remplacement de l’image sélectionnée.';
  return `Remplacement de l’élément sélectionné de type ${element.type}.`;
}

export function buildEditorImageBriefRequest(input: {
  sceneTitle: string;
  actions: readonly Action[] | undefined;
  element?: PPTElement;
  target: TargetGeometry;
}): { system: string; source: string } {
  return buildEditorImageBriefRequestFromSource({
    sceneTitle: input.sceneTitle,
    transcript: sceneTranscript(input.actions),
    targetContext: editorImageTargetContext(input.element),
    target: input.target,
  });
}

export function buildEditorImageBriefRequestFromSource(input: {
  sceneTitle: string;
  transcript: string;
  targetContext: string;
  target: TargetGeometry;
}): { system: string; source: string } {
  return {
    system: `Tu es directrice ou directeur artistique spécialisé en apprentissage visuel.
À partir de la source fournie, extrais l’essence pédagogique puis traduis-la en une seule composition visuelle qui permet de comprendre plus vite que le texte.
Ne recopie jamais la narration. Ne l’illustre pas littéralement phrase par phrase. Choisis la forme qui explique le mieux : processus, relations, comparaison, chronologie, système, métaphore visuelle ou scène réaliste seulement lorsqu’une scène apporte une preuve utile.
Pour un processus, une matrice, un tableau ou un schéma, représente la structure et les relations. Utilise des pictogrammes ou formes signifiantes, aucune personne décorative. Une personne n’est admise que si son action est le concept à enseigner.
Évite le texte dans l’image. Si des libellés sont indispensables, limite-les à cinq mots courts, grands et lisibles. Aucun logo inventé, filigrane, code hexadécimal, posture générique, surcharge ou détail sans fonction.
Compose pour les proportions exactes indiquées. Préserve une zone de sécurité de 8 %. Utilise une hiérarchie claire ; le nombre d’or peut guider le point focal d’une illustration, mais la lisibilité structurelle prime pour les diagrammes.
Retourne uniquement un objet JSON valide avec deux chaînes : "prompt" et "negativePrompt". Le prompt doit décrire le résultat visuel, sa structure, son cadrage et sa hiérarchie. Le negativePrompt doit bannir explicitement les défauts probables.`,
    source: `<slide_title>${promptData(input.sceneTitle || 'Sans titre')}</slide_title>
<selected_target>${promptData(input.targetContext)}</selected_target>
<target_geometry width="${input.target.width}" height="${input.target.height}" />
<narration>${promptData(input.transcript || 'Aucune narration disponible.')}</narration>`,
  };
}

function normalizedWords(value: string): string[] {
  return (
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr')
      .match(/[a-z0-9]+/g) ?? []
  );
}

function copiesNarration(prompt: string, transcript: string): boolean {
  const source = normalizedWords(transcript);
  const output = normalizedWords(prompt).join(' ');
  const sequenceLength = 8;
  for (let index = 0; index <= source.length - sequenceLength; index += 1) {
    if (output.includes(source.slice(index, index + sequenceLength).join(' '))) return true;
  }
  return false;
}

export function parseEditorImageBrief(
  response: string,
  transcript: string,
): EditorImageBrief | null {
  try {
    const cleaned = response
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const value = JSON.parse(cleaned) as Record<string, unknown>;
    if (typeof value.prompt !== 'string' || typeof value.negativePrompt !== 'string') return null;
    const prompt = value.prompt.trim();
    const negativePrompt = value.negativePrompt.trim();
    if (prompt.length < 30 || prompt.length > 2_000 || negativePrompt.length > 1_000) return null;
    if (copiesNarration(prompt, transcript)) return null;
    return { prompt, negativePrompt };
  } catch {
    return null;
  }
}

const RATIOS: Array<[NonNullable<ImageGenerationOptions['aspectRatio']>, number]> = [
  ['16:9', 16 / 9],
  ['4:3', 4 / 3],
  ['1:1', 1],
  ['9:16', 9 / 16],
];

export function pickEditorImageAspectRatio(
  target: TargetGeometry,
): NonNullable<ImageGenerationOptions['aspectRatio']> {
  const ratio = target.width > 0 && target.height > 0 ? target.width / target.height : 16 / 9;
  return RATIOS.reduce((best, candidate) =>
    Math.abs(Math.log(candidate[1] / ratio)) < Math.abs(Math.log(best[1] / ratio))
      ? candidate
      : best,
  )[0];
}
