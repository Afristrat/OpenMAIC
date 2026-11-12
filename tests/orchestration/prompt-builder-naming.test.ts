/**
 * Le formateur nomme l'auteur d'une intervention : le prénom de la personne
 * arrive au modèle (profil et signature du message) et la consigne de le
 * nommer est présente, sans jamais inventer un prénom absent du contexte.
 */
import { describe, it, expect } from 'vitest';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import type { StatelessChatRequest } from '@/lib/types/chat';
import { buildStructuredPrompt } from '@/lib/orchestration/prompt-builder';
import { buildPeerContextSection } from '@/lib/orchestration/summarizers/peer-context';
import { convertMessagesToOpenAI } from '@/lib/orchestration/summarizers/message-converter';

const teacher = {
  id: 'persona-professor',
  name: 'Hanae',
  role: 'teacher',
  persona: 'Formatrice bienveillante.',
  allowedActions: [],
} as unknown as AgentConfig;

const storeState = {
  stage: null,
  scenes: [],
  currentSceneId: null,
  mode: 'playback',
  whiteboardOpen: false,
} as unknown as StatelessChatRequest['storeState'];

describe('consigne de nommer l’auteur d’une intervention', () => {
  it('le prompt du formateur demande de nommer Amine dans la première phrase, une seule fois', () => {
    const prompt = buildStructuredPrompt(teacher, storeState, undefined, undefined, {
      nickname: 'Amine',
    });
    expect(prompt).toContain('Amine');
    expect(prompt).toMatch(/first sentence/i);
    expect(prompt).toMatch(/only once/i);
    expect(prompt).toMatch(/never invent a name/i);
  });

  it('le prompt garde la consigne de ne pas inventer de prénom même sans profil', () => {
    const prompt = buildStructuredPrompt(teacher, storeState);
    expect(prompt).toMatch(/never invent a name/i);
  });

  it('le contexte des pairs demande de nommer le camarade Rim auquel on répond', () => {
    const section = buildPeerContextSection(
      [{ agentId: 'persona-coach', agentName: 'Rim', contentPreview: 'Et le coût ?' }] as never,
      'Hanae',
    );
    expect(section).toContain('Rim');
    expect(section).toMatch(/by (their )?first name/i);
    expect(section).toMatch(/never invent a name/i);
  });
});

describe('signature du message utilisateur transmise au modèle', () => {
  it('convertMessagesToOpenAI signe l’intervention avec le prénom et non « Vous »', () => {
    const messages = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Pourquoi ce chiffre ?' }],
        metadata: { senderName: 'Vous', originalRole: 'user' },
      },
    ] as unknown as StatelessChatRequest['messages'];
    const converted = convertMessagesToOpenAI(messages, 'persona-professor', 'Amine');
    expect(converted[0].content).toBe('[Amine]: Pourquoi ce chiffre ?');
  });

  it('sans prénom connu, la signature d’affichage reste inchangée', () => {
    const messages = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Bonjour' }],
        metadata: { senderName: 'Vous' },
      },
    ] as unknown as StatelessChatRequest['messages'];
    expect(convertMessagesToOpenAI(messages)[0].content).toBe('[Vous]: Bonjour');
  });
});
