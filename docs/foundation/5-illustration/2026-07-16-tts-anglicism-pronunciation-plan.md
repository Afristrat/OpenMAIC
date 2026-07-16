# Prononciation des anglicismes en narration TTS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire prononcer en anglais les anglicismes/noms propres (LiteLLM, MIT) dans une narration française, sans casser la prononciation française des mots ordinaires (ex. "budget"), en câblant le paramètre `language` déjà présent dans l'API native de Higgs TTS mais jamais envoyé par le code.

**Architecture:** Un découpage déterministe (dictionnaire + regex, pas de nouvel appel LLM) segmente le texte d'une action `speech` en runs consécutifs français/anglais ; chaque run devient une sous-action `speech` indépendante (même pattern que `splitLongSpeechActions`, un audio par run, aucune concaténation de buffers). Le run anglais porte `ttsLanguageOverride: 'en'`, transmis jusqu'à `generateTTS` qui l'injecte dans le payload `/v1/audio/speech` de Higgs.

**Tech Stack:** TypeScript, Next.js API routes, vitest.

## Global Constraints

- Ne s'applique qu'au provider `higgs-tts` — comportement empiriquement vérifié UNIQUEMENT sur ce provider (`SpeechReq.language` dans le schéma OpenAPI natif du service DGX-2). Ne pas envoyer `language` aux autres providers.
- Zéro nouvel appel réseau/LLM pour la segmentation — dictionnaire statique + regex, déterministe, testable sans mock réseau.
- Aucune concaténation de buffers audio — réutiliser le pattern "un audio par sous-action" déjà établi par `splitLongSpeechActions` (`lib/audio/tts-utils.ts:82-106`).
- Le champ `language` déjà utilisé dans `AgentVoiceResolveOptions`/`resolveAgentVoiceOptions` (`lib/audio/agent-voice.ts:37`) est un concept DIFFÉRENT (langue/locale du cours entier, pour VoxCPM uniquement) — ne pas réutiliser ce nom, le nouveau champ s'appelle `ttsLanguageOverride` pour éviter toute confusion.

---

### Task 1: Dictionnaire d'anglicismes + segmentation déterministe du texte

**Files:**
- Create: `lib/audio/anglicism-dictionary.ts`
- Create: `lib/audio/language-segments.ts`
- Test: `tests/audio/language-segments.test.ts`

**Interfaces:**
- Produces: `ANGLICISM_TERMS: readonly string[]` (export de `anglicism-dictionary.ts`), `splitTextIntoLanguageSegments(text: string, dictionary?: readonly string[]): Array<{ text: string; language: 'fr' | 'en' }>` (export de `language-segments.ts`)

- [ ] **Step 1: Write the failing test**

```typescript
// tests/audio/language-segments.test.ts
import { describe, it, expect } from 'vitest';
import { splitTextIntoLanguageSegments } from '@/lib/audio/language-segments';
import { ANGLICISM_TERMS } from '@/lib/audio/anglicism-dictionary';

describe('splitTextIntoLanguageSegments', () => {
  it('keeps a pure French sentence as a single fr segment', () => {
    const segments = splitTextIntoLanguageSegments(
      'Nous allons gérer notre budget de production.',
      ANGLICISM_TERMS,
    );
    expect(segments).toEqual([
      { text: 'Nous allons gérer notre budget de production.', language: 'fr' },
    ]);
  });

  it('isolates a known anglicism as its own en segment', () => {
    const segments = splitTextIntoLanguageSegments(
      'Nous allons configurer LiteLLM pour la production.',
      ANGLICISM_TERMS,
    );
    expect(segments).toEqual([
      { text: 'Nous allons configurer', language: 'fr' },
      { text: 'LiteLLM', language: 'en' },
      { text: 'pour la production.', language: 'fr' },
    ]);
  });

  it('keeps a French connector between two anglicisms as its own fr segment (never mispronounce "et chez" in English)', () => {
    const segments = splitTextIntoLanguageSegments(
      "C'est le standard utilisé au MIT et chez LiteLLM aujourd'hui.",
      ANGLICISM_TERMS,
    );
    expect(segments).toEqual([
      { text: "C'est le standard utilisé au", language: 'fr' },
      { text: 'MIT', language: 'en' },
      { text: 'et chez', language: 'fr' },
      { text: 'LiteLLM', language: 'en' },
      { text: "aujourd'hui.", language: 'fr' },
    ]);
  });

  it('merges two adjacent anglicisms (no French word between them) into a single en segment', () => {
    const segments = splitTextIntoLanguageSegments('Le duo LiteLLM MIT est cité en exemple.', [
      ...ANGLICISM_TERMS,
    ]);
    expect(segments).toEqual([
      { text: 'Le duo', language: 'fr' },
      { text: 'LiteLLM MIT', language: 'en' },
      { text: 'est cité en exemple.', language: 'fr' },
    ]);
  });

  it('does not match a dictionary term as a substring of another French word', () => {
    // "MIT" must not match inside "admit" / "mitaine" — word-boundary only
    const segments = splitTextIntoLanguageSegments('Elle porte des mitaines.', ANGLICISM_TERMS);
    expect(segments).toEqual([{ text: 'Elle porte des mitaines.', language: 'fr' }]);
  });

  it('returns a single fr segment for empty or whitespace-only text', () => {
    expect(splitTextIntoLanguageSegments('   ', ANGLICISM_TERMS)).toEqual([
      { text: '', language: 'fr' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/audio/language-segments.test.ts`
Expected: FAIL — `Cannot find module '@/lib/audio/language-segments'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/audio/anglicism-dictionary.ts
/**
 * Anglicismes/noms propres à prononcer en anglais dans une narration
 * française — liste courte, maintenue manuellement (pas d'inférence
 * automatique : chaque faux positif casse la prononciation d'un mot
 * français légitime, cf. "budget").
 */
export const ANGLICISM_TERMS: readonly string[] = ['LiteLLM', 'MIT'];
```

```typescript
// lib/audio/language-segments.ts
export interface LanguageSegment {
  text: string;
  language: 'fr' | 'en';
}

/**
 * Split text into runs of consecutive French/anglicism tokens, using a
 * whole-word (case-sensitive) match against `dictionary`. Consecutive
 * anglicism matches merge into a single `en` segment to minimize the
 * number of TTS sub-actions/audio files produced downstream.
 */
export function splitTextIntoLanguageSegments(
  text: string,
  dictionary: readonly string[] = [],
): LanguageSegment[] {
  const normalized = text.trim();
  if (!normalized || dictionary.length === 0) {
    return [{ text: normalized, language: 'fr' }];
  }

  const escaped = dictionary
    .slice()
    .sort((a, b) => b.length - a.length) // longest-first avoids partial shadowing
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escaped.join('|')})\\b`, 'g');

  const segments: LanguageSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let pendingEnWords: string[] = [];

  const flushFr = (end: number) => {
    const chunk = normalized.slice(lastIndex, end).trim();
    if (chunk) segments.push({ text: chunk, language: 'fr' });
  };
  const flushEn = () => {
    if (pendingEnWords.length > 0) {
      segments.push({ text: pendingEnWords.join(' '), language: 'en' });
      pendingEnWords = [];
    }
  };

  while ((match = pattern.exec(normalized)) !== null) {
    const gapBefore = normalized.slice(lastIndex, match.index);
    if (gapBefore.trim()) {
      flushEn();
      flushFr(match.index);
    }
    pendingEnWords.push(match[0]);
    lastIndex = pattern.lastIndex;
  }
  flushEn();
  flushFr(normalized.length);

  return segments.length > 0 ? segments : [{ text: normalized, language: 'fr' }];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/audio/language-segments.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add lib/audio/anglicism-dictionary.ts lib/audio/language-segments.ts tests/audio/language-segments.test.ts
git commit -m "feat: segmentation déterministe fr/en pour la prononciation des anglicismes"
```

---

### Task 2: `SpeechAction.ttsLanguageOverride` + sous-actions par segment de langue

**Files:**
- Modify: `lib/types/action.ts:39-46`
- Modify: `lib/audio/tts-utils.ts`
- Test: `tests/audio/tts-utils.test.ts` (créer si absent, sinon ajouter au fichier existant)

**Interfaces:**
- Consumes: `splitTextIntoLanguageSegments` (Task 1), `ANGLICISM_TERMS` (Task 1)
- Produces: `splitSpeechActionsByAnglicisms(actions: Action[], providerId: TTSProviderId): Action[]`, `SpeechAction.ttsLanguageOverride?: 'fr' | 'en'`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/audio/tts-utils.test.ts (ajouter ce describe au fichier existant, ou créer le fichier)
import { describe, it, expect } from 'vitest';
import { splitSpeechActionsByAnglicisms } from '@/lib/audio/tts-utils';
import type { SpeechAction } from '@/lib/types/action';

describe('splitSpeechActionsByAnglicisms', () => {
  it('splits a higgs-tts speech action containing an anglicism into fr/en sub-actions', () => {
    const action: SpeechAction = {
      id: 'action_3',
      type: 'speech',
      text: 'Nous allons configurer LiteLLM pour la production.',
    };
    const result = splitSpeechActionsByAnglicisms([action], 'higgs-tts');
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      id: 'action_3_lang_1',
      text: 'Nous allons configurer',
      ttsLanguageOverride: 'fr',
    });
    expect(result[1]).toMatchObject({
      id: 'action_3_lang_2',
      text: 'LiteLLM',
      ttsLanguageOverride: 'en',
    });
    expect(result[2]).toMatchObject({
      id: 'action_3_lang_3',
      text: 'pour la production.',
      ttsLanguageOverride: 'fr',
    });
  });

  it('leaves actions untouched for providers other than higgs-tts', () => {
    const action: SpeechAction = {
      id: 'action_1',
      type: 'speech',
      text: 'Nous allons configurer LiteLLM pour la production.',
    };
    const result = splitSpeechActionsByAnglicisms([action], 'openai-tts');
    expect(result).toEqual([action]);
  });

  it('leaves a pure-French speech action as a single action', () => {
    const action: SpeechAction = {
      id: 'action_2',
      type: 'speech',
      text: 'Nous allons gérer notre budget.',
    };
    const result = splitSpeechActionsByAnglicisms([action], 'higgs-tts');
    expect(result).toEqual([action]);
  });

  it('leaves non-speech actions untouched', () => {
    const action = { id: 'a1', type: 'spotlight' as const, elementId: 'el1' };
    const result = splitSpeechActionsByAnglicisms([action], 'higgs-tts');
    expect(result).toEqual([action]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/audio/tts-utils.test.ts`
Expected: FAIL — `splitSpeechActionsByAnglicisms is not a function`

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/types/action.ts:39-46 — remplacer le bloc SpeechAction existant par :
/** Speech — teacher narration (wait for TTS to finish) */
export interface SpeechAction extends ActionBase {
  type: 'speech';
  text: string;
  audioId?: string;
  audioUrl?: string; // Server-generated TTS audio URL
  voice?: string;
  speed?: number; // default 1.0
  /** Forces the TTS provider's language for THIS segment (higgs-tts only) — set by splitSpeechActionsByAnglicisms, never authored directly. */
  ttsLanguageOverride?: 'fr' | 'en';
}
```

```typescript
// lib/audio/tts-utils.ts — ajouter en bas du fichier (après splitLongSpeechActions) :
import { splitTextIntoLanguageSegments } from './language-segments';
import { ANGLICISM_TERMS } from './anglicism-dictionary';

/** Providers empiriquement confirmés pour accepter un `language` par appel TTS. */
const ANGLICISM_AWARE_PROVIDERS: ReadonlySet<TTSProviderId> = new Set(['higgs-tts']);

/**
 * Split speech actions so each run of consecutive anglicisms (LiteLLM, MIT…)
 * becomes its own sub-action with `ttsLanguageOverride: 'en'`, while the rest
 * stays `'fr'`. One audio file per sub-action — no byte concatenation. Only
 * applies to providers in ANGLICISM_AWARE_PROVIDERS (empirically verified).
 */
export function splitSpeechActionsByAnglicisms(
  actions: Action[],
  providerId: TTSProviderId,
): Action[] {
  if (!ANGLICISM_AWARE_PROVIDERS.has(providerId)) return actions;

  let didSplit = false;
  const nextActions: Action[] = actions.flatMap((action) => {
    if (action.type !== 'speech' || !action.text) return [action];

    const segments = splitTextIntoLanguageSegments(action.text, ANGLICISM_TERMS);
    if (segments.length <= 1) return [action];
    didSplit = true;
    const { audioId: _audioId, ...baseAction } = action as SpeechAction;

    log.info(
      `Split speech by language for ${providerId}: action=${action.id}, segments=${segments.length}`,
    );
    return segments.map((segment, i) => ({
      ...baseAction,
      id: `${action.id}_lang_${i + 1}`,
      text: segment.text,
      ttsLanguageOverride: segment.language,
    }));
  });
  return didSplit ? nextActions : actions;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/audio/tts-utils.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add lib/types/action.ts lib/audio/tts-utils.ts tests/audio/tts-utils.test.ts
git commit -m "feat: découpe les actions speech higgs-tts en sous-actions fr/en par anglicisme"
```

---

### Task 3: Câbler `ttsLanguageOverride` jusqu'à l'appel Higgs (`TTSModelConfig` → `generateOpenAITTS`)

**Files:**
- Modify: `lib/audio/types.ts:140-149`
- Modify: `lib/audio/tts-providers.ts:236-270`
- Test: `tests/audio/tts-providers.test.ts` (ajouter au fichier existant s'il existe, sinon créer)

**Interfaces:**
- Consumes: `TTSModelConfig` (existant, à étendre)
- Produces: `TTSModelConfig.language?: string`, `generateOpenAITTS` envoie `language` dans le payload JSON quand défini

- [ ] **Step 1: Write the failing test**

```typescript
// tests/audio/tts-providers.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateTTS } from '@/lib/audio/tts-providers';
import type { TTSModelConfig } from '@/lib/audio/types';

describe('generateTTS — higgs-tts language passthrough', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes language in the request body when config.language is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: new Headers({ 'content-type': 'audio/wav' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const config: TTSModelConfig = {
      providerId: 'higgs-tts',
      voice: 'default',
      baseUrl: 'http://192.168.100.7:7861',
      language: 'en',
    };
    await generateTTS(config, 'LiteLLM');

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.language).toBe('en');
  });

  it('omits language from the request body when config.language is undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: new Headers({ 'content-type': 'audio/wav' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const config: TTSModelConfig = {
      providerId: 'higgs-tts',
      voice: 'default',
      baseUrl: 'http://192.168.100.7:7861',
    };
    await generateTTS(config, 'Nous allons gérer notre budget.');

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body as string);
    expect(body.language).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/audio/tts-providers.test.ts`
Expected: FAIL — `body.language` is `undefined` in the first assertion (currently never sent) → first test fails, second passes vacuously

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/audio/types.ts:140-149 — remplacer TTSModelConfig par :
export interface TTSModelConfig {
  providerId: TTSProviderId;
  modelId?: string;
  apiKey?: string;
  baseUrl?: string;
  voice: string;
  speed?: number;
  format?: string;
  providerOptions?: Record<string, unknown>;
  /** Per-call language override (currently only honored by higgs-tts). */
  language?: string;
}
```

```typescript
// lib/audio/tts-providers.ts:236-255 — remplacer le corps de generateOpenAITTS par :
async function generateOpenAITTS(
  config: TTSModelConfig,
  text: string,
): Promise<TTSGenerationResult> {
  const baseUrl = config.baseUrl || TTS_PROVIDERS['openai-tts'].defaultBaseUrl;

  const response = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      model: config.modelId || 'gpt-4o-mini-tts',
      input: text,
      voice: config.voice,
      speed: config.speed || 1.0,
      ...(config.language ? { language: config.language } : {}),
    }),
  });
  // ... (reste de la fonction inchangé)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/audio/tts-providers.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add lib/audio/types.ts lib/audio/tts-providers.ts tests/audio/tts-providers.test.ts
git commit -m "feat: câble TTSModelConfig.language jusqu'au payload /v1/audio/speech"
```

---

### Task 4: Brancher `ttsLanguageOverride` sur les deux chemins d'appel réels (client + serveur)

**Files:**
- Modify: `lib/hooks/use-scene-generator.ts:216-330` (fonction de génération TTS par action + `generateTTSForScene`)
- Modify: `app/api/generate/tts/route.ts:29-124`
- Modify: `lib/server/classroom-media-generation.ts` (site d'appel `generateTTS`, ligne ~261-290 après le split existant)
- Test: `tests/api/generate-tts.test.ts` (ajouter au fichier existant s'il existe)

**Interfaces:**
- Consumes: `SpeechAction.ttsLanguageOverride` (Task 2), `TTSModelConfig.language` (Task 3), `splitSpeechActionsByAnglicisms` (Task 2)
- Produces: chemin bout-en-bout `action.ttsLanguageOverride` → body HTTP `ttsLanguageOverride` → `config.language` → payload Higgs `language`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/generate-tts.test.ts — ajouter ce cas au fichier de test existant de la route
import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/generate/tts/route';

describe('POST /api/generate/tts — ttsLanguageOverride passthrough', () => {
  it('forwards ttsLanguageOverride into the TTSModelConfig passed to generateTTS', async () => {
    const generateTTSMock = vi.fn().mockResolvedValue({ audio: new Uint8Array([1]), format: 'wav' });
    vi.doMock('@/lib/audio/tts-providers', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/lib/audio/tts-providers')>()),
      generateTTS: generateTTSMock,
    }));

    const req = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      body: JSON.stringify({
        text: 'LiteLLM',
        audioId: 'a1',
        ttsProviderId: 'higgs-tts',
        ttsVoice: 'default',
        ttsLanguageOverride: 'en',
      }),
    });
    await POST(req as unknown as Parameters<typeof POST>[0]);

    const [config] = generateTTSMock.mock.calls[0];
    expect(config.language).toBe('en');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/api/generate-tts.test.ts`
Expected: FAIL — `config.language` is `undefined` (route doesn't read `ttsLanguageOverride` from body yet)

- [ ] **Step 3: Write minimal implementation**

```typescript
// app/api/generate/tts/route.ts:35-45 — étendre la déstructuration du body :
const { text, ttsModelId, ttsSpeed, ttsApiKey, ttsBaseUrl, ttsProviderOptions, ttsLanguageOverride } =
  body as {
    text: string;
    audioId: string;
    ttsProviderId: TTSProviderId;
    ttsModelId?: string;
    ttsVoice: string;
    ttsSpeed?: number;
    ttsApiKey?: string;
    ttsBaseUrl?: string;
    ttsProviderOptions?: Record<string, unknown>;
    ttsLanguageOverride?: 'fr' | 'en';
  };
```

```typescript
// app/api/generate/tts/route.ts:103-111 — ajouter language au config :
const config = {
  providerId: ttsProviderId as TTSProviderId,
  modelId: resolveTTSModel(ttsProviderId, ttsModelId),
  voice: ttsVoice,
  speed: ttsSpeed ?? 1.0,
  apiKey,
  baseUrl,
  providerOptions: ttsProviderOptions,
  language: ttsLanguageOverride,
};
```

**Important — signature exacte de `generateAndStoreTTS`** (`lib/hooks/use-scene-generator.ts:215-221`) : `(audioId: string, text: string, language?: string, signal?: AbortSignal, retryOptions?: ClientRetryOptions<TTSApiResponse>)`. Elle a 4 autres call sites réels (`app/generation-preview/page.tsx:926`, `tests/hooks/use-scene-generator-retry.test.ts:198`, `lib/audio/regenerate-speech-tts.ts:90`, et l'appel ligne 325 ci-dessous) — le nouveau paramètre doit être ajouté **en dernière position, optionnel**, pour ne casser aucun de ces appels positionnels existants.

```typescript
// lib/hooks/use-scene-generator.ts:215-221 — étendre la signature :
export async function generateAndStoreTTS(
  audioId: string,
  text: string,
  language?: string,
  signal?: AbortSignal,
  retryOptions?: ClientRetryOptions<TTSApiResponse>,
  ttsLanguageOverride?: 'fr' | 'en',
): Promise<void> {
```

```typescript
// lib/hooks/use-scene-generator.ts:248-261 — ajouter ttsLanguageOverride au body du fetch :
body: JSON.stringify({
  text,
  audioId,
  ttsProviderId: settings.ttsProviderId,
  ttsModelId: ttsProviderConfig?.modelId,
  ttsVoice: settings.ttsVoice,
  ttsSpeed: settings.ttsSpeed,
  ttsApiKey: ttsProviderConfig?.apiKey || undefined,
  ttsBaseUrl:
    ttsProviderConfig?.baseUrl || ttsProviderConfig?.customDefaultBaseUrl || undefined,
  ttsProviderOptions: providerOptions,
  ttsLanguageOverride,
}),
```

```typescript
// lib/hooks/use-scene-generator.ts:307 — chaîner le nouveau split après celui déjà en place :
scene.actions = splitSpeechActionsByAnglicisms(
  splitLongSpeechActions(scene.actions || [], providerId),
  providerId,
);
```

```typescript
// lib/hooks/use-scene-generator.ts:320-325 — transmettre le champ au call-site (6ᵉ argument, positions 4-5 inchangées) :
for (const action of speechActions) {
  const audioId = `tts_s${sceneOrder}_${action.id}`;
  action.audioId = audioId;
  try {
    await generateAndStoreTTS(
      audioId,
      action.text,
      language,
      signal,
      undefined,
      (action as SpeechAction).ttsLanguageOverride,
    );
  } catch (error) {
    // ... inchangé
  }
}
```

```typescript
// lib/server/classroom-media-generation.ts:261 — chaîner le split par anglicisme après le split par longueur :
scene.actions = splitSpeechActionsByAnglicisms(
  splitLongSpeechActions(scene.actions, providerId),
  providerId,
);
```

```typescript
// lib/server/classroom-media-generation.ts:273-283 — ajouter language au config, à partir de
// l'action courante (speechAction est déjà casté SpeechAction ligne 268) :
const result = await generateTTS(
  {
    providerId,
    modelId: DEFAULT_TTS_MODELS[providerId as keyof typeof DEFAULT_TTS_MODELS] || '',
    apiKey,
    baseUrl: ttsBaseUrl,
    voice,
    speed: speechAction.speed,
    language: speechAction.ttsLanguageOverride,
  },
  speechAction.text,
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/api/generate-tts.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full unit suite (non-régression)**

Run: `npx tsc --noEmit && pnpm lint && pnpm test`
Expected: 0 erreur TypeScript, 0 erreur lint, tous les tests verts (y compris les 1829 existants)

- [ ] **Step 6: Commit**

```bash
git add lib/hooks/use-scene-generator.ts app/api/generate/tts/route.ts lib/server/classroom-media-generation.ts tests/api/generate-tts.test.ts
git commit -m "feat: branche ttsLanguageOverride sur les chemins client et serveur de génération TTS"
```

---

### Task 5: Vérification déployée réelle (SOP-011) + story Ralph

**Files:**
- Modify: `.ralph/prd-v2.json`

**Interfaces:** aucune (tâche de clôture)

- [ ] **Step 1: Ajouter la story Ralph**

```json
{
  "id": "S1-011",
  "title": "Prononciation anglicismes higgs-tts (LiteLLM, MIT) via segmentation fr/en déterministe",
  "epic": "1-CREER",
  "phase": 1,
  "passes": false,
  "dependencies": [],
  "acceptance": [
    "splitTextIntoLanguageSegments et splitSpeechActionsByAnglicisms couverts par tests unitaires verts",
    "TTSModelConfig.language câblé jusqu'au payload /v1/audio/speech de higgs-tts uniquement",
    "npx tsc --noEmit && pnpm lint && pnpm test verts",
    "Vérification déployée (SOP-011) : narration réelle générée sur préprod/prod contenant 'LiteLLM' et 'budget' dans la même phrase, écoutée par Amine, prononciation confirmée correcte des deux côtés"
  ]
}
```

- [ ] **Step 2: Déployer sur préprod (SOP-014) et vérifier en réel**

Générer (ou régénérer une seule scène via `regenerate_scene`) une narration contenant "LiteLLM" et "budget" dans la même phrase sur `qalem-preprod.ai-mpower.com`, envoyer le résultat à Amine pour écoute — ne marquer `passes: true` qu'après sa confirmation explicite.

- [ ] **Step 3: Commit**

```bash
git add .ralph/prd-v2.json
git commit -m "chore: ajoute la story S1-011 (prononciation anglicismes higgs-tts)"
```
