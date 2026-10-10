import { describe, expect, it } from 'vitest';
import type { PPTElement, Slide } from '@openmaic/dsl';
import { buildSafeSlideFallback } from '@/lib/generation/scene-generator';
import { auditSlideLayout } from '@/lib/edit/slide-layout-audit';
import type { SceneOutline } from '@/lib/types/generation';

const OUTLINE = {
  id: 'scene_2',
  type: 'slide',
  title: 'Les données probantes sur l’isolement relationnel',
  description:
    'Présenter les chiffres sur l’isolement au travail et leur lien avec la santé mentale des équipes.',
  keyPoints: [
    'Selon le U.S. Surgeon General 2022, 20 % des employés ressentent la solitude au travail, 25 % en télétravail.',
    'McKinsey 2021 : 54 % des départs volontaires sont liés au sentiment de non-valorisation.',
    'Gallup 2024 confirme la tendance chez les travailleurs hybrides.',
    'La méta-analyse de Cregg et Cheavens 2020 montre des effets modérés et contextuels.',
  ],
  order: 2,
} as SceneOutline;

function image(id: string, left: number, top: number, width: number, height: number): PPTElement {
  return {
    id,
    type: 'image',
    left,
    top,
    width,
    height,
    rotate: 0,
    fixedRatio: true,
    src: 'https://example.test/image.png',
  } as PPTElement;
}

function audit(elements: PPTElement[]) {
  return auditSlideLayout({
    id: OUTLINE.id,
    elements,
    viewportSize: 1000,
    viewportRatio: 0.5625,
  } as Slide);
}

describe('buildSafeSlideFallback', () => {
  it('reste valide sans image', () => {
    expect(audit(buildSafeSlideFallback(OUTLINE, []))).toEqual([]);
  });

  it('range une image posée par le modèle sur le texte dans une colonne réservée', () => {
    const elements = buildSafeSlideFallback(OUTLINE, [image('image_a', 100, 150, 400, 300)]);
    expect(audit(elements)).toEqual([]);
  });

  it('range une image hors cadre dans la colonne réservée', () => {
    const elements = buildSafeSlideFallback(OUTLINE, [image('image_a', 900, 500, 600, 400)]);
    expect(audit(elements)).toEqual([]);
  });

  it('empile plusieurs images sans chevauchement ni débordement', () => {
    const elements = buildSafeSlideFallback(OUTLINE, [
      image('image_a', 0, 0, 800, 600),
      image('image_b', 50, 50, 300, 300),
      image('image_c', 500, 100, 200, 500),
    ]);
    expect(audit(elements)).toEqual([]);
    expect(elements.filter((element) => element.type === 'image')).toHaveLength(3);
  });

  it('conserve les proportions de chaque image', () => {
    const [placed] = buildSafeSlideFallback(OUTLINE, [image('image_a', 0, 0, 800, 400)]).filter(
      (element) => element.type === 'image',
    );
    expect(placed.width / placed.height).toBeCloseTo(2, 5);
  });
});
