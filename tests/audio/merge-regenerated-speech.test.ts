import { describe, expect, it } from 'vitest';
import type { Action } from '@/lib/types/action';
import {
  completedVoiceUpdates,
  isRegeneratedSpeechPiece,
  mergeRegeneratedSpeech,
} from '@/lib/audio/merge-regenerated-speech';

const speech = (id: string, text: string, audioUrl?: string): Action =>
  ({ id, type: 'speech', text, ...(audioUrl ? { audioUrl } : {}) }) as Action;

describe('mergeRegeneratedSpeech', () => {
  it('ne remplace que la ligne régénérée et garde les autres lignes actuelles', () => {
    const current = [speech('A', 'a1'), speech('B', 'b2')];
    const server = [speech('A', 'a1', '/a.wav'), speech('B', 'b1')];
    expect(mergeRegeneratedSpeech(current, server, 'A', 'a1')).toEqual([
      speech('A', 'a1', '/a.wav'),
      speech('B', 'b2'),
    ]);
  });

  it('insère à sa place les morceaux du découpage serveur', () => {
    const current = [speech('A', 'long'), speech('B', 'b')];
    const server = [
      speech('A_lang_1', 'lo', '/1'),
      speech('A_lang_2_tts_1', 'n', '/2'),
      speech('A_tts_3', 'g', '/3'),
      speech('AB', 'autre', '/x'),
    ];
    expect(
      mergeRegeneratedSpeech(current, server, 'A', 'long')?.map((action) => action.id),
    ).toEqual(['A_lang_1', 'A_lang_2_tts_1', 'A_tts_3', 'B']);
  });

  it('ne fait rien si le texte local n’est plus celui envoyé, ou si la ligne a disparu', () => {
    const server = [speech('A', 'a1', '/a.wav')];
    expect(mergeRegeneratedSpeech([speech('A', 'a2')], server, 'A', 'a1')).toBeNull();
    expect(mergeRegeneratedSpeech([speech('B', 'b')], server, 'A', 'a1')).toBeNull();
    expect(mergeRegeneratedSpeech([speech('A', 'a1')], [], 'A', 'a1')).toBeNull();
  });

  it('compare les textes sans les espaces de bord, comme l’envoi', () => {
    expect(
      mergeRegeneratedSpeech([speech('A', ' a1 ')], [speech('A', 'a1', '/a')], 'A', 'a1'),
    ).toEqual([speech('A', 'a1', '/a')]);
  });

  it('reconnaît les morceaux d’une ligne sans confondre un identifiant voisin', () => {
    expect(isRegeneratedSpeechPiece('A', 'A')).toBe(true);
    expect(isRegeneratedSpeechPiece('A_tts_2', 'A')).toBe(true);
    expect(isRegeneratedSpeechPiece('A_lang_1', 'A')).toBe(true);
    expect(isRegeneratedSpeechPiece('A2', 'A')).toBe(false);
    expect(isRegeneratedSpeechPiece(undefined, 'A')).toBe(false);
  });
});

describe('completedVoiceUpdates', () => {
  it('ne donne leur voix qu’aux lignes muettes inchangées depuis l’envoi', () => {
    const sent = [{ id: 's1', actions: [speech('A', 'a1'), speech('B', 'b1'), speech('C', 'c1')] }];
    const updated = [
      {
        id: 's1',
        actions: [speech('A', 'a1', '/a'), speech('B', 'b1', '/b'), speech('C', 'c1')],
      },
    ];
    // Pendant la complétion : B a été corrigée, une ligne D a été ajoutée.
    const current = [
      {
        id: 's1',
        actions: [speech('A', 'a1'), speech('B', 'b2'), speech('C', 'c1'), speech('D', 'd')],
      },
    ];
    expect(completedVoiceUpdates(sent, updated, current)).toEqual([
      {
        id: 's1',
        actions: [speech('A', 'a1', '/a'), speech('B', 'b2'), speech('C', 'c1'), speech('D', 'd')],
      },
    ]);
  });

  it('ignore une scène supprimée localement pendant la complétion', () => {
    const sent = [{ id: 's1', actions: [speech('A', 'a1')] }];
    const updated = [{ id: 's1', actions: [speech('A', 'a1', '/a')] }];
    expect(completedVoiceUpdates(sent, updated, [])).toEqual([]);
  });
});
