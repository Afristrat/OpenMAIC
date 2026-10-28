import { describe, expect, it } from 'vitest';
import {
  captureStepSchema,
  decodeScreenshot,
  findSensitivePattern,
  findStepRefusal,
  normalizeStepUrl,
  stepContentHash,
  MAX_SCREENSHOT_BYTES,
} from '@/lib/capture/step';

const validStep = {
  position: 0,
  capturedAt: '2026-10-28T10:00:00.000Z',
  action: 'click',
  url: 'https://app.exemple.com/factures',
  element: { label: 'Créer une facture', role: 'button', tag: 'button' },
  pointer: { x: 120, y: 340 },
  viewport: { w: 1280, h: 720, dpr: 2 },
  description: 'Cliquez sur « Créer une facture ».',
} as const;

function jpeg(size: number): Buffer {
  const bytes = Buffer.alloc(size, 0x11);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[size - 2] = 0xff;
  bytes[size - 1] = 0xd9;
  return bytes;
}

describe('normalizeStepUrl', () => {
  it('garde l’origine et le chemin', () => {
    expect(normalizeStepUrl('https://app.exemple.com/factures/nouvelle')).toBe(
      'https://app.exemple.com/factures/nouvelle',
    );
    expect(normalizeStepUrl('https://app.exemple.com/')).toBe('https://app.exemple.com');
  });

  it.each([
    'https://app.exemple.com/a?token=abc',
    'https://app.exemple.com/a#section',
    'https://utilisateur:secret@app.exemple.com/a',
    'https://app.exemple.com/a@b',
    'ftp://app.exemple.com/a',
    'javascript:alert(1)',
    'pas une url',
  ])('refuse %s', (raw) => {
    expect(normalizeStepUrl(raw)).toBeNull();
  });
});

describe('findSensitivePattern', () => {
  it.each([
    ['Écrivez à marie.dupont@exemple.com', 'email'],
    ['Authorization: Bearer abcdefghijklmnop1234', 'token'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJl', 'token'],
    ['Carte 4111 1111 1111 1111', 'card'],
    ['Appelez le +212 6 12 34 56 78', 'phone'],
    ['Clé 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', 'secret'],
  ])('détecte %s', (text, expected) => {
    expect(findSensitivePattern(text)).toBe(expected);
  });

  it.each(['Cliquez sur « Enregistrer »', 'Étape 3 sur 10', 'Facture du 2026-10-28', 'Réf. 12345'])(
    'laisse passer %s',
    (text) => {
      expect(findSensitivePattern(text)).toBeNull();
    },
  );

  it('refuse 16 chiffres qui échouent au test de Luhn, comme un numéro de téléphone', () => {
    expect(findSensitivePattern('Numéro 1234 5678 9012 3456')).toBe('phone');
  });
});

describe('captureStepSchema', () => {
  it('accepte une étape valide et applique les valeurs par défaut', () => {
    const parsed = captureStepSchema.parse({
      position: 1,
      capturedAt: '2026-10-28T10:00:00Z',
      action: 'navigate',
      url: 'https://app.exemple.com',
    });
    expect(parsed.description).toBe('');
    expect(parsed.redactions).toEqual([]);
    expect(parsed.element).toEqual({});
  });

  it('refuse un champ inconnu (href, sélecteur CSS, titre de fenêtre en contrebande)', () => {
    for (const extra of [
      { href: 'https://x.test/?a=1' },
      { cssSelector: '#pwd' },
      { title: 'T' },
    ]) {
      expect(captureStepSchema.safeParse({ ...validStep, ...extra }).success).toBe(false);
    }
    expect(
      captureStepSchema.safeParse({ ...validStep, element: { label: 'x', name: 'password' } })
        .success,
    ).toBe(false);
  });

  it('refuse une action inconnue et une date mal formée', () => {
    expect(captureStepSchema.safeParse({ ...validStep, action: 'hack' }).success).toBe(false);
    expect(captureStepSchema.safeParse({ ...validStep, capturedAt: 'hier' }).success).toBe(false);
  });
});

describe('findStepRefusal', () => {
  it('ne refuse rien sur une étape propre', () => {
    expect(findStepRefusal(captureStepSchema.parse(validStep))).toBeNull();
  });

  it('nomme le champ et le motif sans écho de la valeur', () => {
    const refusal = findStepRefusal(
      captureStepSchema.parse({ ...validStep, element: { label: 'jean@exemple.com' } }),
    );
    expect(refusal).toEqual({ field: 'element.label', reason: 'email' });
    expect(JSON.stringify(refusal)).not.toContain('jean');
  });
});

describe('decodeScreenshot', () => {
  it('accepte un JPEG et calcule son empreinte', () => {
    const decoded = decodeScreenshot(jpeg(64).toString('base64'));
    expect(decoded?.bytes.length).toBe(64);
    expect(decoded?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuse une image qui n’est pas un JPEG complet', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(decodeScreenshot(png.toString('base64'))).toBeNull();
    const truncated = jpeg(64);
    truncated[63] = 0x00;
    expect(decodeScreenshot(truncated.toString('base64'))).toBeNull();
  });

  it('refuse une image trop lourde et un base64 invalide', () => {
    expect(decodeScreenshot(jpeg(MAX_SCREENSHOT_BYTES + 4).toString('base64'))).toBeNull();
    expect(decodeScreenshot('data:image/jpeg;base64,AAAA')).toBeNull();
    expect(decodeScreenshot('')).toBeNull();
  });
});

describe('stepContentHash', () => {
  it('donne la même empreinte quel que soit l’ordre des clés envoyées', () => {
    const a = captureStepSchema.parse(validStep);
    const b = captureStepSchema.parse({
      description: validStep.description,
      viewport: validStep.viewport,
      pointer: validStep.pointer,
      element: validStep.element,
      url: validStep.url,
      action: validStep.action,
      capturedAt: validStep.capturedAt,
      position: validStep.position,
    });
    expect(stepContentHash(a, a.url, null)).toBe(stepContentHash(b, b.url, null));
  });

  it('change quand le contenu ou l’image change', () => {
    const step = captureStepSchema.parse(validStep);
    const base = stepContentHash(step, step.url, null);
    expect(stepContentHash({ ...step, description: 'Autre' }, step.url, null)).not.toBe(base);
    expect(stepContentHash(step, step.url, 'a'.repeat(64))).not.toBe(base);
  });

  it('ignore le contenu de l’image (couvert par sa propre empreinte)', () => {
    const step = captureStepSchema.parse(validStep);
    expect(stepContentHash({ ...step, screenshot: 'AAAA' }, step.url, null)).toBe(
      stepContentHash(step, step.url, null),
    );
  });
});
