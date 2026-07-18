export type QalemCapability =
  | 'chat'
  | 'reasoning'
  | 'vision'
  | 'embedding'
  | 'image-generation'
  | 'image-editing'
  | 'video-generation'
  | 'music-generation'
  | 'speech-generation'
  | 'transcription';

export type CertificationStatus = 'referenced' | 'reachable' | 'validated' | 'failed';

export interface LiteLLMModelInfo {
  model_name: string;
  litellm_params?: { model?: string };
  model_info?: {
    mode?: string | null;
    supports_reasoning?: boolean | null;
    supports_vision?: boolean | null;
    supports_function_calling?: boolean | null;
  };
}

export interface ModelCertification {
  modelId: string;
  transportModel: string;
  transportMode: string | null;
  capabilities: QalemCapability[];
  status: CertificationStatus;
  lastProbeAt: string | null;
  validatedTasks: string[];
  limitations: string[];
  fallbackModelId: string | null;
}

const COMFYUI_CAPABILITIES: Readonly<Record<string, readonly QalemCapability[]>> = {
  'ace-step-audio': ['music-generation'],
  'flux2-klein': ['image-generation'],
  'flux-kontext-edit': ['image-editing'],
  'flux-schnell': ['image-generation'],
  'ltx-2-video': ['video-generation'],
  'sd3.5-large': ['image-generation'],
  'z-image-turbo': ['image-generation'],
};

const MODE_CAPABILITY: Readonly<Record<string, QalemCapability>> = {
  chat: 'chat',
  embedding: 'embedding',
  image_generation: 'image-generation',
  audio_speech: 'speech-generation',
  audio_transcription: 'transcription',
};

export function inferQalemCapabilities(info: LiteLLMModelInfo): QalemCapability[] {
  const capabilities = new Set<QalemCapability>();
  const transportModel = info.litellm_params?.model ?? info.model_name;

  if (transportModel.startsWith('comfyui/')) {
    for (const capability of COMFYUI_CAPABILITIES[info.model_name] ?? []) {
      capabilities.add(capability);
    }
  } else {
    const mode = info.model_info?.mode;
    if (mode && MODE_CAPABILITY[mode]) capabilities.add(MODE_CAPABILITY[mode]);
  }

  if (info.model_info?.supports_reasoning) capabilities.add('reasoning');
  if (info.model_info?.supports_vision) capabilities.add('vision');
  return [...capabilities];
}

export function createReferencedCertification(info: LiteLLMModelInfo): ModelCertification {
  return {
    modelId: info.model_name,
    transportModel: info.litellm_params?.model ?? info.model_name,
    transportMode: info.model_info?.mode ?? null,
    capabilities: inferQalemCapabilities(info),
    status: 'referenced',
    lastProbeAt: null,
    validatedTasks: [],
    limitations: [],
    fallbackModelId: null,
  };
}

export function canUseForTask(
  certification: ModelCertification,
  capability: QalemCapability,
  taskId: string,
): boolean {
  return (
    certification.status === 'validated' &&
    certification.capabilities.includes(capability) &&
    certification.validatedTasks.includes(taskId)
  );
}
