'use client';

import { useState, useEffect, useMemo, useRef, useDeferredValue, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Clock,
  Copy,
  ImagePlus,
  Pencil,
  Trash2,
  Search,
  Settings,
  Sun,
  Moon,
  Monitor,
  ChevronUp,
  Upload,
  Sparkles,
  Atom,
  X,
  Presentation,
  WandSparkles,
} from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useI18n } from '@/lib/hooks/use-i18n';
import { LanguageSwitcher } from '@/components/language-switcher';
import { createLogger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupInput, InputGroupButton } from '@/components/ui/input-group';
import { Textarea as UITextarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { SettingsDialog } from '@/components/settings';
import { GenerationToolbar } from '@/components/generation/generation-toolbar';
import { OutlinesEditor, type SyllabusAssistTarget } from '@/components/generation/outlines-editor';
import {
  SourceConflictDialog,
  type SourceConflict,
} from '@/components/generation/source-conflict-dialog';
import { AgentBar } from '@/components/agent/agent-bar';
import { useTheme } from '@/lib/hooks/use-theme';
import type { ClassroomPlan, UserRequirements } from '@/lib/types/generation';
import { buildLanguageDirective } from '@/lib/constants/generation';
import { useUserProfileStore, AVATAR_OPTIONS } from '@/lib/store/user-profile';
import { StageListItem, revokeThumbnailSlideMediaUrls } from '@/lib/utils/stage-storage';
import { SlideThumbnail } from '@/components/slide-renderer/SlideThumbnail';
import type { Slide } from '@openmaic/dsl';
import { useMediaGenerationStore } from '@/lib/store/media-generation';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDraftCache } from '@/lib/hooks/use-draft-cache';
import { SpeechButton } from '@/components/audio/speech-button';
import { shouldShowVocationalTestUi } from '@/lib/config/feature-flags';
import { useAuth } from '@/lib/hooks/use-auth';
import { useOrganizations } from '@/lib/hooks/use-organizations';
import { TemplateSelector } from '@/components/org/template-selector';
import { tryCreateClient } from '@/lib/supabase/client';
import { db } from '@/lib/utils/database';
import { isDemoStage } from '@/lib/demo/use-demo-seed';
import { useSettingsStore } from '@/lib/store/settings';
import type { InteractionLevel, LearningApproach } from '@/lib/agents/persona-catalog';
import { TTS_PROVIDERS } from '@/lib/audio/constants';
import type { BuiltInTTSProviderId } from '@/lib/audio/types';
import type { LearningContext } from '@/lib/types/stage';
import {
  COMMON_LEARNING_CURRENCIES,
  DEFAULT_LEARNING_CONTEXT,
  isIso4217CurrencyCode,
  normalizeLearningContext,
} from '@/lib/formation-engine/learning-context';

const log = createLogger('Home');

// Nouvelle clé : une préférence « recherche désactivée » héritée d’avant le
// raccordement Serper + Crawl4AI ne doit pas neutraliser silencieusement les
// sources fraîches de la première génération après cette mise à niveau.
const WEB_SEARCH_STORAGE_KEY = 'webSearchEnabled.v2';
const RECENT_OPEN_STORAGE_KEY = 'recentClassroomsOpen';
const INTERACTIVE_MODE_STORAGE_KEY = 'interactiveModeEnabled';
const REQUIREMENT_EXPANSION_THRESHOLD = 120;
const MIN_PLAN_POLL_MS = process.env.NEXT_PUBLIC_E2E_TEST_MODE === 'true' ? 10 : 30_000;

type ClassroomPlanJobCreationResponse = {
  jobId?: string;
  pollIntervalMs?: number;
  details?: string;
  error?: string;
};

type ClassroomPlanJobStatusResponse = {
  status?: 'queued' | 'running' | 'succeeded' | 'failed';
  done?: boolean;
  result?: ClassroomPlan;
  generationRequest?: Record<string, unknown>;
  pollIntervalMs?: number;
  error?: string;
  errorCode?: string;
  sourceAlignment?: SourceConflict;
};

type CourseImportResponse = {
  importId?: string;
  courseId?: string;
  sourceManifestId?: string;
  plan?: ClassroomPlan;
  validation?: {
    status: 'conform' | 'rejected';
    issues: Array<{ rule: string; path?: string; message: string }>;
  };
  error?: string;
};

async function readJsonResponse<T extends object>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) throw new Error(fallbackMessage);

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}

function authenticatedFirstName(user: User | null): string {
  if (!user) return '';
  const metadata = user.user_metadata as Record<string, unknown>;
  const candidate = [metadata.given_name, metadata.first_name, metadata.full_name, metadata.name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim();
  if (candidate) return candidate.split(/\s+/)[0] ?? candidate;
  const emailPrefix = user.email?.split('@')[0]?.trim();
  return emailPrefix ? (emailPrefix.split(/[._-]+/)[0] ?? emailPrefix) : '';
}

// PPTX import is still scaffolding: `useImportPptx` has no `onImported` consumer
// yet, so the flow only logs the parsed slides. Hide the entry point behind a
// flag until it's wired end-to-end, so the UI doesn't expose a no-op button.
// Enable with NEXT_PUBLIC_ENABLE_PPTX_IMPORT=true.
const PPTX_IMPORT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_PPTX_IMPORT === 'true';

interface FormState {
  requirement: string;
  webSearch: boolean;
  interactiveMode: boolean;
  vocationalTestMode: boolean;
  learningApproach: LearningApproach | null;
  interactionLevel: InteractionLevel | null;
  learningContext: LearningContext;
}

const initialFormState: FormState = {
  requirement: '',
  webSearch: false,
  interactiveMode: false,
  vocationalTestMode: false,
  learningApproach: null,
  interactionLevel: null,
  learningContext: DEFAULT_LEARNING_CONTEXT,
};

function HomePage() {
  const { t, locale } = useI18n();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const showVocationalTestUi = shouldShowVocationalTestUi();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [activeSkillId, setActiveSkillId] = useState<string>();
  const [activeSkill, setActiveSkill] = useState<{ id: string; name: string }>();
  const [isImprovingRequirement, setIsImprovingRequirement] = useState(false);
  const webSearchPreferenceSetRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    import('@/lib/types/settings').SettingsSection | undefined
  >(undefined);

  useEffect(() => {
    const skillId = new URLSearchParams(window.location.search).get('skill')?.trim();
    setActiveSkillId(skillId || undefined);
  }, []);

  // Draft cache for requirement text
  const { cachedValue: cachedRequirement, updateCache: updateRequirementCache } =
    useDraftCache<string>({ key: 'requirementDraft' });

  // A usable LLM provider exists ⇒ a concrete model is always selected (#580
  // invariant). Gate generation on this single condition (state A vs B)
  // instead of inspecting modelId directly.
  const webSearchProvidersConfig = useSettingsStore((s) => s.webSearchProvidersConfig);
  const imageGenerationEnabled = useSettingsStore((s) => s.imageGenerationEnabled);
  const languageProviderId = useSettingsStore((s) => s.providerId);
  const languageModelId = useSettingsStore((s) => s.modelId);
  const imageProviderId = useSettingsStore((s) => s.imageProviderId);
  const imageModelId = useSettingsStore((s) => s.imageModelId);
  const videoGenerationEnabled = useSettingsStore((s) => s.videoGenerationEnabled);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const agentMode = useSettingsStore((s) => s.agentMode);
  const selectedAgentIds = useSettingsStore((s) => s.selectedAgentIds);
  const contextualSpecialists = useSettingsStore((s) => s.contextualSpecialists);
  const agentVoiceOverrides = useSettingsStore((s) => s.agentVoiceOverrides);
  const ttsProviderId = useSettingsStore((s) => s.ttsProviderId);
  const ttsVoice = useSettingsStore((s) => s.ttsVoice);
  const ttsProvidersConfig = useSettingsStore((s) => s.ttsProvidersConfig);
  const pdfProviderId = useSettingsStore((s) => s.pdfProviderId);
  const pdfProvidersConfig = useSettingsStore((s) => s.pdfProvidersConfig);
  const [recentOpen, setRecentOpen] = useState(true);
  const persistRecentOpen = (next: boolean) => {
    setRecentOpen(next);
    try {
      localStorage.setItem(RECENT_OPEN_STORAGE_KEY, String(next));
    } catch {
      /* ignore */
    }
  };

  // Auth + due review count
  const { user } = useAuth();
  const { currentOrg, canAuthor } = useOrganizations();
  const [dueReviewCount, setDueReviewCount] = useState(0);
  const [sourceManifestId, setSourceManifestId] = useState<string>();
  const [selectedSourceCount, setSelectedSourceCount] = useState(0);
  const [sourceIngestionBlocked, setSourceIngestionBlocked] = useState(false);
  const [sourceClearRequestToken, setSourceClearRequestToken] = useState(0);
  const handleSourceManifestChange = useCallback(
    (manifestId: string | undefined, selectedCount: number) => {
      setSourceManifestId(selectedCount > 0 ? manifestId : undefined);
      setSelectedSourceCount(selectedCount);
    },
    [],
  );

  useEffect(() => {
    if (!activeSkillId) return;
    const controller = new AbortController();
    const searchParams = new URLSearchParams({ locale });
    if (currentOrg) searchParams.set('orgId', currentOrg.id);
    void fetch(`/api/skills?${searchParams.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          skills?: Array<{ id: string; name: string }>;
        };
        const selected = payload.skills?.find((skill) => skill.id === activeSkillId);
        if (selected) setActiveSkill({ id: activeSkillId, name: selected.name });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        log.warn('Unable to resolve active skill name', error);
      });
    return () => controller.abort();
  }, [activeSkillId, currentOrg, locale]);

  const loadDueReviewCount = async () => {
    const now = new Date();
    let count = 0;

    // Supabase (authenticated users)
    if (user) {
      try {
        const supabase = tryCreateClient();
        if (!supabase) throw new Error('no supabase');
        const { count: sbCount, error } = await supabase
          .from('review_cards')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .lte('due_date', now.toISOString());
        if (!error && sbCount !== null) count += sbCount;
      } catch {
        // Supabase unavailable
      }
    } else {
      // IndexedDB (guest / offline)
      try {
        const localCount = await db.reviewCards
          .where('dueDate')
          .belowOrEqual(now.getTime())
          .count();
        count += localCount;
      } catch {
        // IndexedDB unavailable
      }
    }

    setDueReviewCount(count);
  };

  useEffect(() => {
    loadDueReviewCount();
    // Intentionally re-runs only when the authenticated user changes (guest ↔
    // signed-in switches the review-card source between IndexedDB/Supabase).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Hydrate client-only state after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_OPEN_STORAGE_KEY);
      if (saved !== null) setRecentOpen(saved !== 'false');
    } catch {
      /* localStorage unavailable */
    }
    try {
      const savedWebSearch = localStorage.getItem(WEB_SEARCH_STORAGE_KEY);
      const savedInteractiveMode = localStorage.getItem(INTERACTIVE_MODE_STORAGE_KEY);
      const updates: Partial<FormState> = {};
      webSearchPreferenceSetRef.current = savedWebSearch !== null;
      if (savedWebSearch === 'true') updates.webSearch = true;
      if (savedInteractiveMode === 'true') updates.interactiveMode = true;
      if (Object.keys(updates).length > 0) {
        setForm((prev) => ({ ...prev, ...updates }));
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  // Lorsqu’aucun choix n’a encore été mémorisé, active la recherche dès qu’un
  // fournisseur géré est disponible. Le contenu d’une nouvelle formation est
  // alors fondé sur des sources récentes, sans empêcher l’utilisateur de la couper.
  useEffect(() => {
    if (webSearchPreferenceSetRef.current) return;
    const hasManagedSearch = Object.values(webSearchProvidersConfig).some(
      (config) => config.isServerConfigured,
    );
    if (hasManagedSearch) {
      setForm((prev) => (prev.webSearch ? prev : { ...prev, webSearch: true }));
    }
  }, [webSearchProvidersConfig]);

  // Restore requirement draft from localStorage on mount. The previous derived-state
  // pattern initialised `prev` from the cached value itself, so on the first client
  // render the comparison was always equal and the restore never fired. Use an effect
  // so the cache is hydrated into the form once we know the live requirement is empty.
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    if (!cachedRequirement) return;
    draftRestoredRef.current = true;
    setForm((prev) => (prev.requirement ? prev : { ...prev, requirement: cachedRequirement }));
  }, [cachedRequirement]);

  const [themeOpen, setThemeOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isStartingGeneration, setIsStartingGeneration] = useState(false);
  const [draftPlan, setDraftPlan] = useState<ClassroomPlan | null>(null);
  const [assistingTarget, setAssistingTarget] = useState<string | null>(null);
  const [sourceConflict, setSourceConflict] = useState<SourceConflict | null>(null);
  const [pendingGenerationRequest, setPendingGenerationRequest] = useState<Record<
    string,
    unknown
  > | null>(null);
  const planPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [classrooms, setClassrooms] = useState<StageListItem[]>([]);
  const [importAvailability, setImportAvailability] = useState<{
    orgId: string;
    enabled: boolean;
  } | null>(null);
  const importEnabled =
    !!currentOrg && importAvailability?.orgId === currentOrg.id && importAvailability.enabled;
  const [importing, setImporting] = useState(false);
  const pptxImporting = true;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pptxFileInputRef = useRef<HTMLInputElement>(null);
  const triggerPptxFileSelect = () => undefined;
  const handlePptxFileChange = () => undefined;
  const [thumbnails, setThumbnails] = useState<Record<string, Slide>>({});
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const thumbnailsRef = useRef<Record<string, Slide>>({});

  const replaceThumbnails = (slides: Record<string, Slide>) => {
    const previous = thumbnailsRef.current;
    thumbnailsRef.current = slides;
    setThumbnails(slides);
    window.setTimeout(() => revokeThumbnailSlideMediaUrls(previous), 0);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!themeOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [themeOpen]);

  useEffect(() => {
    if (!currentOrg || !user || !canAuthor) return;
    const controller = new AbortController();
    const orgId = currentOrg.id;
    void fetch(`/api/courses/import?orgId=${encodeURIComponent(currentOrg.id)}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        if (!response.ok) return setImportAvailability({ orgId, enabled: false });
        const result = (await response.json()) as { enabled?: boolean };
        setImportAvailability({ orgId, enabled: result.enabled === true });
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setImportAvailability({ orgId, enabled: false });
      });
    return () => controller.abort();
  }, [canAuthor, currentOrg, user]);

  const loadClassrooms = async () => {
    if (!currentOrg) {
      setClassrooms([]);
      replaceThumbnails({});
      return;
    }
    try {
      const response = await fetch(`/api/classroom?orgId=${encodeURIComponent(currentOrg.id)}`);
      if (!response.ok) throw new Error('Failed to load persistent classrooms');
      const { classrooms: list } = await response.json();
      setClassrooms(list);
      replaceThumbnails(
        Object.fromEntries(
          (list as StageListItem[])
            .filter((classroom) => classroom.thumbnail)
            .map((classroom) => [classroom.id, classroom.thumbnail as Slide]),
        ),
      );
    } catch (err) {
      log.error('Failed to load classrooms:', err);
    }
  };

  useEffect(() => {
    // Clear stale media store to prevent cross-course thumbnail contamination.
    // The store may hold tasks from a previously visited classroom whose elementIds
    // (gen_img_1, etc.) collide with other courses' placeholders.
    useMediaGenerationStore.getState().revokeObjectUrls();
    useMediaGenerationStore.setState({ tasks: {} });

    return () => {
      revokeThumbnailSlideMediaUrls(thumbnailsRef.current);
      thumbnailsRef.current = {};
    };
    // Intentionally mount-only: loadClassrooms/replaceThumbnails are plain
    // functions (not memoized) redefined every render, so listing them here
    // would either re-run this effect every render or require wrapping a
    // chain of helpers in useCallback — this effect must run exactly once.
  }, []);

  useEffect(() => {
    // The active organisation is restored asynchronously from the persisted
    // session. Loading only on mount races that hydration and leaves the
    // catalogue permanently empty until a full reload.
    void loadClassrooms();
    // loadClassrooms is intentionally scoped to the current render; the org
    // identifier is the only state transition that must trigger this fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrg?.id]);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDelete = async (id: string) => {
    setPendingDeleteId(null);
    try {
      const response = await fetch(`/api/classroom?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete classroom');
      await loadClassrooms();
    } catch (err) {
      log.error('Failed to delete classroom:', err);
      toast.error('Failed to delete classroom');
    }
  };

  const handleRename = async (id: string, newName: string) => {
    try {
      const response = await fetch(`/api/classroom?id=${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!response.ok) throw new Error('Failed to rename classroom');
      setClassrooms((prev) => prev.map((c) => (c.id === id ? { ...c, name: newName } : c)));
    } catch (err) {
      log.error('Failed to rename classroom:', err);
      toast.error(t('classroom.renameFailed'));
    }
  };

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const filteredClassrooms = useMemo(() => {
    const q = deferredSearchQuery.trim().toLowerCase();
    if (!q) return classrooms;
    return classrooms.filter((c) => {
      const name = c.name?.toLowerCase() ?? '';
      const desc = c.description?.toLowerCase() ?? '';
      return name.includes(q) || desc.includes(q);
    });
  }, [classrooms, deferredSearchQuery]);

  const updateForm = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    try {
      if (field === 'webSearch') {
        webSearchPreferenceSetRef.current = true;
        localStorage.setItem(WEB_SEARCH_STORAGE_KEY, String(value));
      }
      if (field === 'interactiveMode')
        localStorage.setItem(INTERACTIVE_MODE_STORAGE_KEY, String(value));
      if (field === 'requirement') updateRequirementCache(value as string);
    } catch {
      /* ignore */
    }
  };

  const clearPlanJobLocation = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('planJobId');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  const pollPlanJobRef = useRef<(jobId: string) => Promise<void>>(async () => undefined);
  const schedulePlanPoll = useCallback((jobId: string, delayMs: number) => {
    if (planPollTimerRef.current) clearTimeout(planPollTimerRef.current);
    planPollTimerRef.current = setTimeout(
      () => void pollPlanJobRef.current(jobId),
      Math.max(MIN_PLAN_POLL_MS, delayMs),
    );
  }, []);

  const pollPlanJob = useCallback(
    async (jobId: string) => {
      try {
        const response = await fetch(`/api/generate-classroom/plan/${encodeURIComponent(jobId)}`, {
          cache: 'no-store',
        });
        const result = await readJsonResponse<ClassroomPlanJobStatusResponse>(
          response,
          t('generation.planGenerationFailed'),
        );
        if (!response.ok) {
          if (response.status >= 400 && response.status < 500) {
            setIsPlanning(false);
            clearPlanJobLocation();
            setError(result.error || t('generation.planGenerationFailed'));
            return;
          }
          throw new Error(result.error || t('generation.planGenerationFailed'));
        }
        if (!result.done) {
          schedulePlanPoll(jobId, result.pollIntervalMs ?? 30_000);
          return;
        }

        setIsPlanning(false);
        clearPlanJobLocation();
        if (
          result.errorCode === 'SOURCE_MATERIAL_CONFLICT' &&
          result.sourceAlignment &&
          (result.sourceAlignment.status === 'conflicting' ||
            result.sourceAlignment.status === 'uncertain')
        ) {
          setSourceConflict(result.sourceAlignment);
          return;
        }
        if (!result.result?.syllabus || !result.result.outlines?.length) {
          setError(result.error || t('generation.planGenerationFailed'));
          return;
        }
        if (!result.generationRequest) {
          setError(t('generation.planGenerationFailed'));
          return;
        }
        const request = result.generationRequest;
        setPendingGenerationRequest(request);
        setForm((previous) => ({
          ...previous,
          learningApproach:
            (request.learningApproach as LearningApproach | undefined) ?? previous.learningApproach,
          interactionLevel:
            (request.interactionLevel as InteractionLevel | undefined) ?? previous.interactionLevel,
        }));
        setDraftPlan(result.result);
      } catch (pollError) {
        log.warn('Unable to read classroom plan job:', pollError);
        schedulePlanPoll(jobId, 30_000);
      }
    },
    [clearPlanJobLocation, schedulePlanPoll, t],
  );
  pollPlanJobRef.current = pollPlanJob;

  useEffect(() => {
    const jobId = new URLSearchParams(window.location.search).get('planJobId');
    if (!jobId) return;
    setIsPlanning(true);
    void pollPlanJobRef.current(jobId);
    return () => {
      if (planPollTimerRef.current) clearTimeout(planPollTimerRef.current);
    };
  }, []);

  const buildGenerationRequest = (input: {
    requirement: string;
    courseId?: string;
    sourceManifestId?: string;
    learningApproach?: LearningApproach;
    interactionLevel?: InteractionLevel;
  }) => {
    if (!currentOrg) throw new Error(t('upload.generateFailed'));
    const learningApproach = input.learningApproach ?? form.learningApproach;
    const interactionLevel = input.interactionLevel ?? form.interactionLevel;
    if (!learningApproach || !interactionLevel) throw new Error(t('animation.selectionRequired'));
    return {
      orgId: currentOrg.id,
      ...(input.courseId ? { courseId: input.courseId } : {}),
      ...(input.sourceManifestId ? { sourceManifestId: input.sourceManifestId } : {}),
      language: locale,
      modelString: `${languageProviderId}:${languageModelId}`,
      learningApproach,
      interactionLevel,
      learningContext: normalizeLearningContext(form.learningContext),
      requirement: input.requirement,
      enableWebSearch: form.webSearch,
      enableImageGeneration: imageGenerationEnabled,
      imageProviderId,
      imageModelId,
      enableVideoGeneration: videoGenerationEnabled,
      enableTTS: ttsEnabled,
      interactiveMode: form.vocationalTestMode ? true : form.interactiveMode,
      agentMode: agentMode === 'auto' ? 'generate' : 'default',
      selectedPersonaIds: selectedAgentIds
        .map((id) => id.replace(/^persona-/, ''))
        .filter((id) => !id.startsWith('default-') && !id.startsWith('specialist-')),
      contextualSpecialists: contextualSpecialists.filter((specialist) =>
        selectedAgentIds.includes(specialist.id),
      ),
      agentVoiceOverrides,
      teacherVoiceConfig: {
        providerId: ttsProviderId,
        modelId: ttsProvidersConfig[ttsProviderId]?.modelId,
        voiceId: ttsVoice,
        voiceName: TTS_PROVIDERS[ttsProviderId as BuiltInTTSProviderId]?.voices.find(
          (voice) => voice.id === ttsVoice,
        )?.name,
        gender: TTS_PROVIDERS[ttsProviderId as BuiltInTTSProviderId]?.voices.find(
          (voice) => voice.id === ttsVoice,
        )?.gender,
      },
      ...(activeSkillId ? { activeSkillId } : {}),
    };
  };

  const triggerFileSelect = () => {
    if (!user) {
      const returnPath = `${window.location.pathname}${window.location.search}`;
      router.push(`/auth?next=${encodeURIComponent(returnPath)}`);
      return;
    }
    if (!currentOrg || !canAuthor || !importEnabled || importing) return;
    if (!window.confirm(t('import.canvasRightsAttestation'))) return;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !currentOrg || !user || !canAuthor || importing) return;
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('orgId', currentOrg.id);
      formData.set('rightsAttested', 'true');
      if (file.name.toLowerCase().endsWith('.pdf')) {
        const preferredProviderId = pdfProvidersConfig.mineru?.isServerConfigured
          ? 'mineru'
          : pdfProvidersConfig['mineru-cloud']?.isServerConfigured
            ? 'mineru-cloud'
            : pdfProviderId;
        const providerConfig = pdfProvidersConfig[preferredProviderId];
        formData.set('providerId', preferredProviderId);
        if (!providerConfig?.isServerConfigured && providerConfig?.apiKey.trim()) {
          formData.set('apiKey', providerConfig.apiKey.trim());
        }
        if (!providerConfig?.isServerConfigured && providerConfig?.baseUrl.trim()) {
          formData.set('baseUrl', providerConfig.baseUrl.trim());
        }
      }
      const response = await fetch('/api/courses/import', { method: 'POST', body: formData });
      const result = await readJsonResponse<CourseImportResponse>(
        response,
        t('import.canvasFailed'),
      );
      if (
        !response.ok ||
        result.validation?.status !== 'conform' ||
        !result.plan ||
        !result.courseId ||
        !result.sourceManifestId
      ) {
        const diagnostics = result.validation?.issues
          .map((issue) =>
            t(`import.canvas.${issue.rule.toLowerCase()}`, {
              chapter: issue.path ?? '',
            }),
          )
          .join('\n');
        throw new Error(diagnostics || result.error || t('import.canvasFailed'));
      }
      const learningApproach = form.learningApproach ?? 'andragogy';
      const interactionLevel = form.interactionLevel ?? 'balanced';
      const requirement = `${result.plan.languageDirective}\n\n${result.plan.syllabus.overallObjective}\n\n${result.plan.syllabus.expectedDeliverable}`;
      setForm((previous) => ({
        ...previous,
        requirement: result.plan!.syllabus.overallObjective,
        learningApproach,
        interactionLevel,
      }));
      setPendingGenerationRequest(
        buildGenerationRequest({
          requirement,
          courseId: result.courseId,
          sourceManifestId: result.sourceManifestId,
          learningApproach,
          interactionLevel,
        }),
      );
      setDraftPlan(result.plan);
      toast.success(t('import.canvasReady'));
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t('import.canvasFailed'));
    } finally {
      setImporting(false);
    }
  };

  const handleGenerate = async () => {
    // No model/provider guard here: generation is gated by `canGenerate`
    // (requires a usable provider), and under the #580 invariant a usable
    // provider always has a concrete model. State A (no usable provider)
    // surfaces through the toolbar's single Configure-Provider affordance.
    if (!form.requirement.trim()) {
      setError(t('upload.requirementRequired'));
      return;
    }
    if (!form.learningApproach || !form.interactionLevel) {
      setError(t('animation.selectionRequired'));
      return;
    }
    if (sourceIngestionBlocked) {
      setError(t('sources.resolveRejected'));
      return;
    }
    if (!user || !currentOrg || !canAuthor) {
      setError(t('upload.generateFailed'));
      return;
    }

    setError(null);
    setSourceConflict(null);

    try {
      const userProfile = useUserProfileStore.getState();
      // UserRequirements has no `language` field (upstream v0.3.0 infers the
      // target language from the free-form requirement text) — this page has
      // no separate language selector, so ground that inference in the
      // current UI locale (also switchable via LanguageSwitcher) rather than
      // leaving it to guesswork.
      const requirements: UserRequirements = {
        requirement: `${buildLanguageDirective(locale)}\n\n${form.requirement}`,
        userNickname: userProfile.nickname || authenticatedFirstName(user) || undefined,
        userBio: userProfile.bio || undefined,
        webSearch: form.webSearch || undefined,
        interactiveMode: form.vocationalTestMode ? true : form.interactiveMode,
        ...(form.vocationalTestMode ? { taskEngineMode: true } : {}),
        activeSkillId,
      };

      setIsPlanning(true);
      const generationRequest = buildGenerationRequest({
        requirement: requirements.requirement,
        sourceManifestId,
      });
      const response = await fetch('/api/generate-classroom/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generationRequest),
      });
      const result = await readJsonResponse<ClassroomPlanJobCreationResponse>(
        response,
        response.status >= 502 && response.status <= 504
          ? t('generation.planGatewayTimeout')
          : t('generation.planGenerationFailed'),
      );
      if (!response.ok || !result.jobId) {
        throw new Error(result.details || result.error || t('generation.planGenerationFailed'));
      }
      const location = new URL(window.location.href);
      location.searchParams.set('planJobId', result.jobId);
      window.history.replaceState(
        window.history.state,
        '',
        `${location.pathname}${location.search}${location.hash}`,
      );
      schedulePlanPoll(result.jobId, result.pollIntervalMs ?? 30_000);
    } catch (err) {
      log.error('Error preparing generation:', err);
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
      setIsPlanning(false);
    }
  };

  const handleConfirmPlan = async () => {
    if (!draftPlan || !pendingGenerationRequest || isStartingGeneration) return;
    setIsStartingGeneration(true);
    setError(null);
    try {
      const response = await fetch('/api/generate-classroom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pendingGenerationRequest, approvedPlan: draftPlan }),
      });
      const result = await response.json();
      if (!response.ok || !result.jobId) {
        throw new Error(result.details || result.error || t('upload.generateFailed'));
      }
      router.push(`/generation-status?jobId=${encodeURIComponent(result.jobId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('upload.generateFailed'));
    } finally {
      setIsStartingGeneration(false);
    }
  };

  const handleAssistPlan = async (target: SyllabusAssistTarget) => {
    if (
      !draftPlan ||
      !currentOrg ||
      !form.learningApproach ||
      !form.interactionLevel ||
      assistingTarget
    ) {
      return;
    }
    const targetKey = target.kind === 'scene' ? `scene:${target.sceneIndex}` : 'syllabus';
    const previousPlan = draftPlan;
    setAssistingTarget(targetKey);
    setError(null);
    try {
      const response = await fetch('/api/generate/assist-syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: currentOrg.id,
          locale,
          learningApproach: form.learningApproach,
          interactionLevel: form.interactionLevel,
          target,
          plan: draftPlan,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.plan) {
        throw new Error(result.error || t('generation.syllabusAssistFailed'));
      }
      setDraftPlan(result.plan as ClassroomPlan);
      toast(t('generation.syllabusAssistApplied'), {
        action: {
          label: t('edit.undo'),
          onClick: () => setDraftPlan(previousPlan),
        },
      });
    } catch (assistError) {
      setError(
        assistError instanceof Error ? assistError.message : t('generation.syllabusAssistFailed'),
      );
    } finally {
      setAssistingTarget(null);
    }
  };

  const handleImproveRequirement = async () => {
    const requirement = form.requirement.trim();
    if (!requirement || !currentOrg || !canAuthor || isImprovingRequirement) return;
    setIsImprovingRequirement(true);
    setError(null);
    try {
      const response = await fetch('/api/generate/refine-requirement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: currentOrg.id,
          requirement,
          locale,
          mode: requirement.length < REQUIREMENT_EXPANSION_THRESHOLD ? 'expand' : 'improve',
          sourceFileName:
            selectedSourceCount > 0 ? `${selectedSourceCount} selected sources` : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok || typeof result.requirement !== 'string') {
        throw new Error(result.error || t('upload.generateFailed'));
      }
      updateForm('requirement', result.requirement);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('upload.generateFailed'));
    } finally {
      setIsImprovingRequirement(false);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return t('classroom.today');
    if (diffDays === 1) return t('classroom.yesterday');
    if (diffDays < 7) return `${diffDays} ${t('classroom.daysAgo')}`;
    return date.toLocaleDateString();
  };

  const canGenerate =
    !!form.requirement.trim() &&
    !!form.learningApproach &&
    !!form.interactionLevel &&
    !!form.learningContext.territory.trim() &&
    isIso4217CurrencyCode(form.learningContext.currencyCode) &&
    !!user &&
    !!currentOrg &&
    canAuthor;
  const requiresAuthentication = !user;
  const missingAuthoringSelections = !form.learningApproach || !form.interactionLevel;
  const generateDisabled = !requiresAuthentication && (!canGenerate || isPlanning);

  const handleGenerateAction = () => {
    if (requiresAuthentication) {
      const returnPath = `${window.location.pathname}${window.location.search}`;
      router.push(`/auth?next=${encodeURIComponent(returnPath)}`);
      return;
    }
    handleGenerate();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canGenerate && !isPlanning) handleGenerate();
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center p-4 pt-16 md:p-8 md:pt-16 overflow-x-hidden">
      <SourceConflictDialog
        conflict={sourceConflict}
        onReview={() => setSourceConflict(null)}
        onRemoveSource={() => {
          setSourceManifestId(undefined);
          setSelectedSourceCount(0);
          setSourceClearRequestToken((token) => token + 1);
          setSourceConflict(null);
        }}
        onUseSuggestion={(requirement) => {
          setForm((previous) => ({ ...previous, requirement }));
          updateRequirementCache(requirement);
          setSourceConflict(null);
        }}
      />
      {draftPlan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('generation.outlineEditorTitle')}
          className="fixed inset-0 z-[100] overflow-y-auto bg-background"
        >
          <div className="h-full w-full">
            <OutlinesEditor
              courseTitle={draftPlan.courseTitle}
              syllabus={draftPlan.syllabus}
              outlines={draftPlan.outlines}
              onCourseTitleChange={(courseTitle) =>
                setDraftPlan((plan) => (plan ? { ...plan, courseTitle } : plan))
              }
              onSyllabusChange={(syllabus) =>
                setDraftPlan((plan) => (plan ? { ...plan, syllabus } : plan))
              }
              onChange={(outlines) => setDraftPlan((plan) => (plan ? { ...plan, outlines } : plan))}
              onConfirm={handleConfirmPlan}
              onBack={() => {
                setDraftPlan(null);
                setPendingGenerationRequest(null);
              }}
              alwaysReview
              isLoading={isStartingGeneration}
              learningApproach={form.learningApproach ?? undefined}
              interactionLevel={form.interactionLevel ?? undefined}
              onAssist={handleAssistPlan}
              assistingTarget={assistingTarget}
            />
          </div>
        </div>
      )}
      {importEnabled && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,text/markdown,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,application/pdf"
          onChange={handleFileChange}
          className="hidden"
          data-testid="course-canvas-file-input"
        />
      )}
      {PPTX_IMPORT_ENABLED && (
        <input
          ref={pptxFileInputRef}
          type="file"
          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
          onChange={handlePptxFileChange}
          className="hidden"
        />
      )}
      {/* ═══ Top-right pill (unchanged) ═══ */}
      <div
        ref={toolbarRef}
        className="fixed top-4 right-4 z-50 flex items-center gap-1 bg-white/60 dark:bg-gray-800/60 backdrop-blur-md px-2 py-1.5 rounded-full border border-gray-100/50 dark:border-gray-700/50 shadow-sm"
      >
        {/* Language Selector */}
        <LanguageSwitcher onOpen={() => setThemeOpen(false)} />

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Theme Selector */}
        <div className="relative">
          <button
            onClick={() => {
              setThemeOpen(!themeOpen);
            }}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
          >
            {theme === 'light' && <Sun className="w-4 h-4" />}
            {theme === 'dark' && <Moon className="w-4 h-4" />}
            {theme === 'system' && <Monitor className="w-4 h-4" />}
          </button>
          {themeOpen && (
            <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50 min-w-[140px]">
              <button
                onClick={() => {
                  setTheme('light');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'light' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Sun className="w-4 h-4" />
                {t('settings.themeOptions.light')}
              </button>
              <button
                onClick={() => {
                  setTheme('dark');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'dark' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Moon className="w-4 h-4" />
                {t('settings.themeOptions.dark')}
              </button>
              <button
                onClick={() => {
                  setTheme('system');
                  setThemeOpen(false);
                }}
                className={cn(
                  'w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2',
                  theme === 'system' &&
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
                )}
              >
                <Monitor className="w-4 h-4" />
                {t('settings.themeOptions.system')}
              </button>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />

        {/* Settings Button */}
        <div className="relative">
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-full text-gray-400 dark:text-gray-500 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all group"
          >
            <Settings className="w-4 h-4 group-hover:rotate-90 transition-transform duration-500" />
          </button>
        </div>

        {/* User avatar / profile link (signed-in users only) */}
        {user && (
          <>
            <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700" />
            <Link
              href="/profile"
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-full text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200 hover:shadow-sm transition-all"
            >
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold uppercase">
                {user.email?.charAt(0) ?? 'U'}
              </div>
            </Link>
          </>
        )}
      </div>
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />

      {/* ═══ Background Decor ═══ */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '4s' }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse"
          style={{ animationDuration: '6s' }}
        />
      </div>

      {/* ═══ Hero section: title + input (centered, wider) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className={cn(
          'relative z-20 w-full max-w-[1120px] flex flex-col items-center',
          classrooms.length === 0 ? 'justify-center min-h-[calc(100dvh-8rem)]' : 'mt-[10vh]',
        )}
      >
        {/* ── Logo ── */}
        <motion.span
          data-testid="app-logo"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            delay: 0.1,
            type: 'spring',
            stiffness: 200,
            damping: 20,
          }}
          className="text-4xl md:text-5xl font-bold tracking-tight text-primary mb-2"
        >
          Qalem
        </motion.span>

        {/* ── Slogan ── */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="text-sm text-muted-foreground/60 mb-8"
        >
          {t('home.slogan')}
        </motion.p>

        {/* ── Unified input area ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 }}
          className="w-full"
        >
          <div className="w-full rounded-2xl border border-border/60 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl shadow-xl shadow-black/[0.03] dark:shadow-black/20 transition-shadow focus-within:shadow-2xl focus-within:shadow-violet-500/[0.06]">
            {/* ── Greeting + Profile + Agents ── */}
            <div className="relative z-20 flex items-start justify-between">
              <GreetingBar user={user} />
              <div className="pr-3 pt-3.5 shrink-0">
                <AgentBar
                  organizationSettings={currentOrg?.settings}
                  orgId={currentOrg?.id}
                  topic={form.requirement}
                  territory={form.learningContext.territory}
                />
              </div>
            </div>

            {activeSkillId && (
              <div
                data-testid="active-skill-indicator"
                className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200"
              >
                <BookOpen className="size-3.5" />
                <span>{t('skills.activeLabel')}</span>
                <strong>
                  {activeSkill?.id === activeSkillId ? activeSkill.name : activeSkillId}
                </strong>
                <Link className="ms-auto font-medium underline underline-offset-2" href="/skills">
                  {t('skills.changeActive')}
                </Link>
                <button
                  type="button"
                  aria-label={t('skills.removeActive')}
                  className="rounded-full p-1 hover:bg-violet-100 dark:hover:bg-violet-900"
                  onClick={() => {
                    setActiveSkillId(undefined);
                    setActiveSkill(undefined);
                    router.replace('/app');
                  }}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            {/* Textarea */}
            <div className="relative">
              <textarea
                ref={textareaRef}
                placeholder={t('upload.requirementPlaceholder')}
                className="w-full resize-none border-0 bg-transparent px-4 pt-1 pb-10 text-[13px] leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none min-h-[140px] max-h-[300px]"
                value={form.requirement}
                onChange={(e) => updateForm('requirement', e.target.value)}
                onKeyDown={handleKeyDown}
                rows={4}
              />
              {form.requirement.trim() && canAuthor && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleImproveRequirement}
                      disabled={isImprovingRequirement}
                      className="absolute bottom-2 right-3 inline-flex h-7 items-center gap-1.5 rounded-full border border-violet-300/60 bg-violet-50 px-2.5 text-[11px] font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-300"
                    >
                      {form.requirement.trim().length < REQUIREMENT_EXPANSION_THRESHOLD ? (
                        <WandSparkles className="size-3.5" />
                      ) : (
                        <Sparkles className="size-3.5" />
                      )}
                      {form.requirement.trim().length < REQUIREMENT_EXPANSION_THRESHOLD
                        ? t('generation.expandRequest')
                        : t('generation.improveRequest')}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {t('generation.requirementAssistantHint')}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Toolbar row */}
            <div className="flex flex-wrap items-end gap-2 px-3 pb-3 xl:flex-nowrap">
              <div className="min-w-0 basis-full xl:flex-1 xl:basis-auto">
                <GenerationToolbar
                  webSearch={form.webSearch}
                  onWebSearchChange={(v) => updateForm('webSearch', v)}
                  onSettingsOpen={(section) => {
                    setSettingsSection(section);
                    setSettingsOpen(true);
                  }}
                  orgId={currentOrg?.id}
                  sourceClearRequestToken={sourceClearRequestToken}
                  onSourceManifestChange={handleSourceManifestChange}
                  onSourceIngestionBlockChange={setSourceIngestionBlocked}
                  onSourceError={setError}
                />
              </div>

              {/* Template selector — picks a requirement preset; the template's
                  own language field is ignored here since generation language
                  is now driven globally by the LanguageSwitcher locale. */}
              <TemplateSelector
                onSelect={(template) => {
                  const requirement = template.requirements.requirement;
                  if (typeof requirement === 'string') updateForm('requirement', requirement);
                  const learningApproach = template.requirements.learningApproach;
                  if (
                    learningApproach === 'pedagogy' ||
                    learningApproach === 'hybrid' ||
                    learningApproach === 'andragogy'
                  ) {
                    updateForm('learningApproach', learningApproach);
                  }
                  const templateContext = template.requirements.learningContext;
                  if (
                    templateContext &&
                    typeof templateContext === 'object' &&
                    typeof (templateContext as Record<string, unknown>).territory === 'string' &&
                    typeof (templateContext as Record<string, unknown>).currencyCode === 'string'
                  ) {
                    updateForm(
                      'learningContext',
                      normalizeLearningContext(templateContext as unknown as LearningContext),
                    );
                  }
                }}
              />

              {/* Interactive mode toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                    onClick={() => updateForm('interactiveMode', !form.interactiveMode)}
                    className={cn(
                      'relative inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all cursor-pointer select-none whitespace-nowrap border shrink-0 h-8',
                      form.interactiveMode
                        ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.35)] dark:shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                        : 'border-cyan-300/60 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20',
                    )}
                  >
                    {form.interactiveMode && (
                      <span
                        className="absolute inset-[-4px] rounded-full border border-cyan-400/40 dark:border-cyan-400/25"
                        style={{
                          animation: 'interactive-mode-breathe 2s ease-in-out infinite',
                        }}
                      />
                    )}
                    <Atom className="size-3.5 relative z-10 animate-[spin_3s_linear_infinite]" />
                    <span className="relative z-10">{t('toolbar.interactiveModeLabel')}</span>
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {t('toolbar.interactiveModeHint')}
                </TooltipContent>
              </Tooltip>

              {/* Voice input */}
              <SpeechButton
                size="md"
                continuous
                onTranscription={(text) => {
                  setForm((prev) => {
                    const next = prev.requirement + (prev.requirement ? ' ' : '') + text;
                    updateRequirementCache(next);
                    return { ...prev, requirement: next };
                  });
                }}
              />

              {/* Send button */}
              <button
                onClick={handleGenerateAction}
                disabled={generateDisabled}
                aria-describedby={
                  missingAuthoringSelections ? 'generation-selection-requirement' : undefined
                }
                className={cn(
                  'shrink-0 h-8 rounded-lg flex items-center justify-center gap-1.5 transition-all px-3',
                  !generateDisabled
                    ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm cursor-pointer'
                    : 'bg-muted text-muted-foreground/40 cursor-not-allowed',
                )}
              >
                <span className="text-xs font-medium">
                  {requiresAuthentication
                    ? t('toolbar.loginToGenerate')
                    : isPlanning
                      ? t('generation.generatingOutlines')
                      : t('toolbar.enterClassroom')}
                </span>
                <ArrowUp className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.div>

        <div
          className="mt-2 flex w-full flex-wrap items-center gap-2 px-1"
          data-testid="animation-authoring-controls"
        >
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {t('generation.territory')}
            <input
              data-testid="learning-territory"
              value={form.learningContext.territory}
              onChange={(event) =>
                updateForm('learningContext', {
                  ...form.learningContext,
                  territory: event.target.value,
                })
              }
              className="h-7 w-28 rounded-md border border-border bg-background px-2 text-foreground"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {t('generation.currency')}
            <input
              data-testid="learning-currency"
              list="learning-currency-codes"
              value={form.learningContext.currencyCode}
              maxLength={3}
              onChange={(event) =>
                updateForm('learningContext', {
                  ...form.learningContext,
                  currencyCode: event.target.value.toUpperCase(),
                })
              }
              className="h-7 w-16 rounded-md border border-border bg-background px-2 uppercase text-foreground"
            />
            <datalist id="learning-currency-codes">
              {COMMON_LEARNING_CURRENCIES.map((currency) => (
                <option key={currency} value={currency} />
              ))}
            </datalist>
          </label>
          <span className="text-xs font-medium text-muted-foreground">
            {t('animation.learningApproach')}
          </span>
          {(['pedagogy', 'hybrid', 'andragogy'] as LearningApproach[]).map((approach) => (
            <button
              key={approach}
              data-testid={`learning-approach-${approach}`}
              type="button"
              onClick={() => updateForm('learningApproach', approach)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                form.learningApproach === approach
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`org.learningApproaches.${approach}`)}
            </button>
          ))}
          <span className="ml-1 text-xs font-medium text-muted-foreground">
            {t('animation.interactionLevel')}
          </span>
          {(['guided', 'balanced', 'immersive'] as InteractionLevel[]).map((level) => (
            <button
              key={level}
              data-testid={`interaction-level-${level}`}
              type="button"
              onClick={() => updateForm('interactionLevel', level)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                form.interactionLevel === level
                  ? 'border-cyan-500 bg-cyan-500 text-white'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`org.interactionLevels.${level}`)}
            </button>
          ))}
          {missingAuthoringSelections && (
            <p
              id="generation-selection-requirement"
              data-testid="generation-selection-requirement"
              className="basis-full text-xs font-medium text-amber-700 dark:text-amber-300"
            >
              {t('animation.selectionRequired')}
            </p>
          )}
        </div>

        {showVocationalTestUi && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-2 flex w-full justify-start px-1"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.vocationalTestMode}
                  onClick={() => updateForm('vocationalTestMode', !form.vocationalTestMode)}
                  className={cn(
                    'inline-flex h-7 items-center gap-2 rounded-full border px-2.5 text-[11px] font-medium transition-colors',
                    form.vocationalTestMode
                      ? 'border-cyan-400/70 bg-cyan-50 text-cyan-700 shadow-[0_0_10px_rgba(6,182,212,0.16)] dark:bg-cyan-950/40 dark:text-cyan-300'
                      : 'border-border/70 bg-background/70 text-muted-foreground hover:border-cyan-300/60 hover:text-cyan-700 dark:hover:text-cyan-300',
                  )}
                >
                  <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-normal text-cyan-700 dark:bg-cyan-900/45 dark:text-cyan-300">
                    测试功能
                  </span>
                  <Sparkles className="size-3.5" />
                  <span>职教任务</span>
                  <span
                    className={cn(
                      'relative h-3.5 w-6 rounded-full transition-colors',
                      form.vocationalTestMode ? 'bg-cyan-500' : 'bg-muted-foreground/25',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 size-2.5 rounded-full bg-white transition-transform',
                        form.vocationalTestMode ? 'translate-x-3' : 'translate-x-0.5',
                      )}
                    />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                从当前输入框提交职教实操训练测试
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}

        {/* ── Error ── */}
        {isPlanning && (
          <p className="mt-3 w-full text-sm text-muted-foreground" role="status">
            {t('generation.planAsyncHint')}
          </p>
        )}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 w-full p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <p className="whitespace-pre-line text-sm text-destructive">{error}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Import buttons (empty state) ── */}
        {classrooms.length === 0 && importEnabled && (
          <div className="relative z-10 mt-4 flex items-center gap-4">
            <button
              type="button"
              onClick={triggerFileSelect}
              disabled={importing}
              data-testid="course-canvas-import"
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground/40 hover:text-foreground/60 transition-colors"
            >
              <Upload className="size-3.5" />
              <span>{importing ? t('import.canvasProcessing') : t('import.canvas')}</span>
            </button>
            {PPTX_IMPORT_ENABLED && (
              <button
                onClick={triggerPptxFileSelect}
                disabled={pptxImporting}
                className="flex items-center gap-1.5 text-[12px] text-muted-foreground/40 hover:text-foreground/60 transition-colors"
              >
                <Presentation className="size-3.5" />
                <span>{t('import.pptx')}</span>
              </button>
            )}
          </div>
        )}
      </motion.div>

      {/* ═══ Review badge ═══ */}
      {dueReviewCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="relative z-10 mt-6 w-full max-w-[800px]"
        >
          <Link
            href="/review"
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50/80 dark:bg-violet-950/30 border border-violet-200/60 dark:border-violet-800/40 hover:bg-violet-100/80 dark:hover:bg-violet-950/50 transition-colors group"
          >
            <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center ring-1 ring-violet-200/50 dark:ring-violet-800/30">
              <BookOpen className="size-4 text-violet-600 dark:text-violet-400" />
            </div>
            <span className="text-sm font-medium text-violet-700 dark:text-violet-300">
              {t('review.dueCards', { n: dueReviewCount })}
            </span>
            <span className="ml-auto text-xs text-violet-500 dark:text-violet-400 group-hover:translate-x-0.5 transition-transform">
              &rarr;
            </span>
          </Link>
        </motion.div>
      )}

      {/* ═══ Recent classrooms — collapsible ═══ */}
      {classrooms.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative z-10 mt-10 w-full max-w-6xl flex flex-col items-center"
        >
          {/* Trigger — divider-line with centered text */}
          <div className="group w-full flex items-center gap-4 py-2">
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
            <div className="shrink-0 flex items-center gap-3 text-[13px] text-muted-foreground/60 select-none">
              <button
                onClick={() => persistRecentOpen(!recentOpen)}
                className="flex items-center gap-2 hover:text-foreground/70 transition-colors cursor-pointer"
              >
                <Clock className="size-3.5" />
                {t('classroom.recentClassrooms')}
                <span className="text-[11px] tabular-nums opacity-60">{classrooms.length}</span>
                <motion.div
                  animate={{ rotate: recentOpen ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                >
                  <ChevronDown className="size-3.5" />
                </motion.div>
              </button>

              {/* Search toggle — icon that expands into an input in place */}
              <AnimatePresence initial={false}>
                {!searchOpen ? (
                  <motion.button
                    key="search-icon"
                    ref={searchButtonRef}
                    type="button"
                    aria-label={t('classroom.searchAriaLabel')}
                    onClick={() => {
                      setSearchOpen(true);
                      if (!recentOpen) persistRecentOpen(true);
                      requestAnimationFrame(() => searchInputRef.current?.focus());
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12, ease: 'easeOut' }}
                    className="flex items-center justify-center size-6 rounded-full text-muted-foreground/50 hover:text-foreground/70 hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <Search className="size-3.5" />
                  </motion.button>
                ) : (
                  <motion.div
                    key="search-input"
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 200 }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                    className="overflow-hidden"
                  >
                    <InputGroup
                      className={cn(
                        'h-7 text-[12px] rounded-full bg-muted/40 border-transparent shadow-none',
                        'transition-colors',
                        'hover:bg-muted/60',
                        'has-[[data-slot=input-group-control]:focus-visible]:bg-muted/60',
                        'has-[[data-slot=input-group-control]:focus-visible]:border-transparent',
                        'has-[[data-slot=input-group-control]:focus-visible]:ring-0',
                      )}
                    >
                      <InputGroupInput
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            if (searchQuery) {
                              setSearchQuery('');
                            } else {
                              setSearchOpen(false);
                              requestAnimationFrame(() => searchButtonRef.current?.focus());
                            }
                          }
                        }}
                        onBlur={() => {
                          if (!searchQuery) {
                            setSearchOpen(false);
                          }
                        }}
                        placeholder={t('classroom.searchPlaceholder')}
                        aria-label={t('classroom.searchAriaLabel')}
                        className="h-7 pl-3 placeholder:text-muted-foreground/50"
                      />
                      {searchQuery && (
                        <InputGroupButton
                          size="icon-xs"
                          aria-label={t('classroom.clearSearch')}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSearchQuery('');
                            searchInputRef.current?.focus();
                          }}
                        >
                          <X />
                        </InputGroupButton>
                      )}
                    </InputGroup>
                  </motion.div>
                )}
              </AnimatePresence>

              {importEnabled && (
                <button
                  type="button"
                  onClick={triggerFileSelect}
                  disabled={importing}
                  data-testid="course-canvas-import"
                  className="group/import grid grid-cols-[auto_0fr] hover:grid-cols-[auto_1fr] items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] text-muted-foreground/35 hover:text-muted-foreground/70 hover:bg-muted/50 transition-all duration-200 cursor-pointer"
                >
                  <Upload className="size-3" />
                  <span className="overflow-hidden opacity-0 group-hover/import:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                    {importing ? t('import.canvasProcessing') : t('import.canvas')}
                  </span>
                </button>
              )}
              {PPTX_IMPORT_ENABLED && (
                <button
                  onClick={triggerPptxFileSelect}
                  disabled={pptxImporting}
                  className="group/import-pptx grid grid-cols-[auto_0fr] hover:grid-cols-[auto_1fr] items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] text-muted-foreground/35 hover:text-muted-foreground/70 hover:bg-muted/50 transition-all duration-200 cursor-pointer"
                >
                  <Presentation className="size-3" />
                  <span className="overflow-hidden opacity-0 group-hover/import-pptx:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                    {t('import.pptx')}
                  </span>
                </button>
              )}
            </div>
            <div className="flex-1 h-px bg-border/40 group-hover:bg-border/70 transition-colors" />
          </div>

          {/* Expandable content */}
          <AnimatePresence>
            {recentOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full overflow-hidden"
              >
                {searchQuery.trim() && filteredClassrooms.length === 0 ? (
                  <div className="pt-8 pb-2 text-center text-[13px] text-muted-foreground/60">
                    {t('classroom.searchEmpty')}
                  </div>
                ) : (
                  <div className="pt-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-8">
                    {filteredClassrooms.map((classroom, i) => (
                      <motion.div
                        key={classroom.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          delay: i * 0.04,
                          duration: 0.35,
                          ease: 'easeOut',
                        }}
                      >
                        <ClassroomCard
                          classroom={classroom}
                          isDemo={isDemoStage(classroom.id)}
                          slide={thumbnails[classroom.id]}
                          formatDate={formatDate}
                          onDelete={handleDelete}
                          onRename={handleRename}
                          confirmingDelete={pendingDeleteId === classroom.id}
                          onConfirmDelete={() => confirmDelete(classroom.id)}
                          onCancelDelete={() => setPendingDeleteId(null)}
                          onClick={() => router.push(`/classroom/${classroom.id}`)}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Footer — flows with content, at the very end */}
      <div className="mt-auto pt-12 pb-4 text-center text-xs text-muted-foreground/40">Qalem</div>
    </div>
  );
}

// ─── Greeting Bar — avatar + "Hi, Name", click to edit in-place ────
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

function isCustomAvatar(src: string) {
  return src.startsWith('data:');
}

function GreetingBar({ user }: { user: User | null }) {
  const { t } = useI18n();
  const avatar = useUserProfileStore((s) => s.avatar);
  const nickname = useUserProfileStore((s) => s.nickname);
  const bio = useUserProfileStore((s) => s.bio);
  const setAvatar = useUserProfileStore((s) => s.setAvatar);
  const setNickname = useUserProfileStore((s) => s.setNickname);
  const setBio = useUserProfileStore((s) => s.setBio);

  const [open, setOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const displayName = nickname || authenticatedFirstName(user) || t('profile.defaultNickname');

  // Click-outside to collapse
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingName(false);
        setAvatarPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const startEditName = () => {
    setNameDraft(nickname);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const commitName = () => {
    setNickname(nameDraft.trim());
    setEditingName(false);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d')!;
        const scale = Math.max(128 / img.width, 128 / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (128 - w) / 2, (128 - h) / 2, w, h);
        setAvatar(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div ref={containerRef} className="relative pl-4 pr-2 pt-3.5 pb-1 w-auto">
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* ── Collapsed pill (always in flow) ── */}
      {!open && (
        <div
          className="flex items-center gap-2.5 cursor-pointer transition-all duration-200 group rounded-full px-2.5 py-1.5 border border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/60 active:scale-[0.97]"
          onClick={() => setOpen(true)}
        >
          <div className="shrink-0 relative">
            <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-border/30 group-hover:ring-violet-400/60 dark:group-hover:ring-violet-400/40 transition-all duration-300">
              <img src={avatar} alt="" className="size-full object-cover" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/40 flex items-center justify-center opacity-60 group-hover:opacity-100 transition-opacity">
              <Pencil className="size-[7px] text-muted-foreground/70" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="leading-none select-none flex items-center gap-1">
                  <span className="text-[13px] font-semibold text-foreground/85 group-hover:text-foreground transition-colors">
                    {t('home.greetingWithName', { name: displayName })}
                  </span>
                  <ChevronDown className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors shrink-0" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {t('profile.editTooltip')}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}

      {/* ── Expanded panel (absolute, floating) ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="absolute left-4 top-3.5 z-50 w-64"
          >
            <div className="rounded-2xl bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06] shadow-[0_1px_8px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_1px_8px_-2px_rgba(0,0,0,0.3)] px-2.5 py-2">
              {/* ── Row: avatar + name ── */}
              <div
                className="flex items-center gap-2.5 cursor-pointer transition-all duration-200"
                onClick={() => {
                  setOpen(false);
                  setEditingName(false);
                  setAvatarPickerOpen(false);
                }}
              >
                {/* Avatar */}
                <div
                  className="shrink-0 relative cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPickerOpen(!avatarPickerOpen);
                  }}
                >
                  <div className="size-8 rounded-full overflow-hidden ring-[1.5px] ring-violet-300/70 dark:ring-violet-500/40 transition-all duration-300">
                    <img src={avatar} alt="" className="size-full object-cover" />
                  </div>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-white dark:bg-slate-800 border border-border/60 flex items-center justify-center"
                  >
                    <ChevronDown
                      className={cn(
                        'size-2 text-muted-foreground/70 transition-transform duration-200',
                        avatarPickerOpen && 'rotate-180',
                      )}
                    />
                  </motion.div>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {editingName ? (
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        ref={nameInputRef}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitName();
                          if (e.key === 'Escape') {
                            setEditingName(false);
                          }
                        }}
                        onBlur={commitName}
                        maxLength={20}
                        placeholder={t('profile.defaultNickname')}
                        className="flex-1 min-w-0 h-6 bg-transparent border-b border-border/80 text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                      />
                      <button
                        onClick={commitName}
                        className="shrink-0 size-5 rounded flex items-center justify-center text-violet-500 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                      >
                        <Check className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditName();
                      }}
                      className="group/name inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span className="text-[13px] font-semibold text-foreground/85 group-hover/name:text-foreground transition-colors">
                        {displayName}
                      </span>
                      <Pencil className="size-2.5 text-muted-foreground/30 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                    </span>
                  )}
                </div>

                {/* Collapse arrow */}
                <motion.div
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="shrink-0 size-6 rounded-full flex items-center justify-center hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
                >
                  <ChevronUp className="size-3.5 text-muted-foreground/50" />
                </motion.div>
              </div>

              {/* ── Expandable content ── */}
              <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                {/* Avatar picker */}
                <AnimatePresence>
                  {avatarPickerOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="p-1 pb-2.5 flex items-center gap-1.5 flex-wrap">
                        {AVATAR_OPTIONS.map((url) => (
                          <button
                            key={url}
                            onClick={() => setAvatar(url)}
                            className={cn(
                              'size-7 rounded-full overflow-hidden bg-gray-50 dark:bg-gray-800 cursor-pointer transition-all duration-150',
                              'hover:scale-110 active:scale-95',
                              avatar === url
                                ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0'
                                : 'hover:ring-1 hover:ring-muted-foreground/30',
                            )}
                          >
                            <img src={url} alt="" className="size-full" />
                          </button>
                        ))}
                        <label
                          className={cn(
                            'size-7 rounded-full flex items-center justify-center cursor-pointer transition-all duration-150 border border-dashed',
                            'hover:scale-110 active:scale-95',
                            isCustomAvatar(avatar)
                              ? 'ring-2 ring-violet-400 dark:ring-violet-500 ring-offset-0 border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/30'
                              : 'border-muted-foreground/30 text-muted-foreground/50 hover:border-muted-foreground/50',
                          )}
                          onClick={() => avatarInputRef.current?.click()}
                          title={t('profile.uploadAvatar')}
                        >
                          <ImagePlus className="size-3" />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Bio */}
                <UITextarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={t('profile.bioPlaceholder')}
                  maxLength={200}
                  rows={2}
                  className="resize-none border-border/40 bg-transparent min-h-[72px] !text-[13px] !leading-relaxed placeholder:!text-[11px] placeholder:!leading-relaxed focus-visible:ring-1 focus-visible:ring-border/60"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Classroom Card — clean, minimal style ──────────────────────
function ClassroomCard({
  classroom,
  isDemo,
  slide,
  formatDate,
  onDelete,
  onRename,
  confirmingDelete,
  onConfirmDelete,
  onCancelDelete,
  onClick,
}: {
  classroom: StageListItem;
  isDemo?: boolean;
  slide?: Slide;
  formatDate: (ts: number) => string;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onRename: (id: string, newName: string) => void;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onClick: () => void;
}) {
  const { t } = useI18n();
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumbWidth, setThumbWidth] = useState(0);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = thumbRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setThumbWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (editing) nameInputRef.current?.focus();
  }, [editing]);

  const isTaskEngineMode = classroom.taskEngineMode === true;
  const showModeBadge = classroom.interactiveMode || isTaskEngineMode;
  const ModeBadgeIcon = isTaskEngineMode ? Sparkles : Atom;
  const modeBadgeLabel = isTaskEngineMode ? 'Vocational Mode' : t('toolbar.interactiveModeLabel');

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(classroom.name);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== classroom.name) {
      onRename(classroom.id, trimmed);
    }
    setEditing(false);
  };

  return (
    <div className="group cursor-pointer" onClick={confirmingDelete ? undefined : onClick}>
      {/* Thumbnail — large radius, no border, subtle bg */}
      <div
        ref={thumbRef}
        className="relative w-full aspect-[16/9] rounded-2xl bg-slate-100 dark:bg-slate-800/80 overflow-hidden transition-transform duration-200 group-hover:scale-[1.02]"
      >
        {slide && thumbWidth > 0 ? (
          <SlideThumbnail
            slide={slide}
            size={thumbWidth}
            viewportSize={slide.viewportSize ?? 1000}
            viewportRatio={slide.viewportRatio ?? 0.5625}
          />
        ) : !slide ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 flex items-center justify-center">
              <span className="text-xl opacity-50">📄</span>
            </div>
          </div>
        ) : null}

        {showModeBadge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                aria-label={modeBadgeLabel}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  'absolute bottom-2 left-2 inline-flex items-center justify-center size-5 rounded-full bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm shadow-sm z-10',
                  isTaskEngineMode
                    ? 'text-amber-600 dark:text-amber-300 ring-1 ring-amber-500/35'
                    : 'text-cyan-600 dark:text-cyan-300 ring-1 ring-cyan-500/30',
                )}
              >
                <ModeBadgeIcon className="size-3" />
              </span>
            </TooltipTrigger>
            {/* Negative sideOffset compensates for the global Tooltip Arrow's
                rotate-45 bounding box, which Radix reserves as spacing. */}
            <TooltipContent
              side="top"
              align="start"
              sideOffset={-4}
              collisionPadding={0}
              className="text-xs"
            >
              {modeBadgeLabel}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Delete — top-right, only on hover */}
        <AnimatePresence>
          {!confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-destructive/80 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(classroom.id, e);
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="absolute top-2 right-11 size-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 hover:bg-black/50 text-white hover:text-white backdrop-blur-sm rounded-full"
                onClick={startRename}
              >
                <Pencil className="size-3.5" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Inline delete confirmation overlay */}
        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[6px]"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-[13px] font-medium text-white/90">
                {t('classroom.deleteConfirmTitle')}?
              </span>
              <div className="flex gap-2">
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-white/15 text-white/80 hover:bg-white/25 backdrop-blur-sm transition-colors"
                  onClick={onCancelDelete}
                >
                  {t('common.cancel')}
                </button>
                <button
                  className="px-3.5 py-1 rounded-lg text-[12px] font-medium bg-red-500/90 text-white hover:bg-red-500 transition-colors"
                  onClick={onConfirmDelete}
                >
                  {t('classroom.delete')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info — outside the thumbnail */}
      <div className="mt-2.5 px-1 flex items-center gap-2">
        {isDemo && (
          <span className="shrink-0 inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            Démo
          </span>
        )}
        <span className="shrink-0 inline-flex items-center rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">
          {classroom.sceneCount} {t('classroom.slides')} · {formatDate(classroom.updatedAt)}
        </span>
        {editing ? (
          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input
              ref={nameInputRef}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') setEditing(false);
              }}
              onBlur={commitRename}
              maxLength={100}
              placeholder={t('classroom.renamePlaceholder')}
              className="w-full bg-transparent border-b border-violet-400/60 text-[15px] font-medium text-foreground/90 outline-none placeholder:text-muted-foreground/40"
            />
          </div>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <p
                className="font-medium text-[15px] truncate text-foreground/90 min-w-0 cursor-text"
                onDoubleClick={startRename}
              >
                {classroom.name}
              </p>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={4}
              className="!max-w-[min(90vw,32rem)] break-words whitespace-normal"
            >
              <div className="flex items-center gap-1.5">
                <span className="break-all">{classroom.name}</span>
                <button
                  className="shrink-0 p-0.5 rounded hover:bg-foreground/10 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(classroom.name);
                    toast.success(t('classroom.nameCopied'));
                  }}
                >
                  <Copy className="size-3 opacity-60" />
                </button>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <HomePage />;
}
