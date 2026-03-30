/**
 * Zod schemas for ALL API route inputs (POST/PATCH/DELETE with JSON body).
 *
 * Naming convention: <route><Method>Schema
 */

import { z } from 'zod/v4';

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

const orgSectors = ['healthcare', 'legal', 'tech', 'finance', 'education', 'industry'] as const;

export const organizationsCreateSchema = z.object({
  name: z.string().min(1, 'Organization name is required'),
  sector: z.enum(orgSectors).optional(),
  default_locale: z.string().optional(),
});

export const organizationPatchSchema = z.object({
  name: z.string().min(1).optional(),
  sector: z.enum(orgSectors).nullable().optional(),
  default_locale: z.string().optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  logo: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Organization Members
// ---------------------------------------------------------------------------

const orgMemberRoles = ['admin', 'manager', 'formateur', 'apprenant'] as const;

export const orgMembersInviteSchema = z.object({
  email: z.string().email('Valid email is required'),
  role: z.enum(orgMemberRoles).optional(),
  user_id: z.string().optional(),
});

export const orgMembersPatchSchema = z.object({
  member_id: z.string().min(1, 'member_id is required'),
  role: z.enum(orgMemberRoles),
});

export const orgMembersDeleteSchema = z.object({
  member_id: z.string().min(1, 'member_id is required'),
});

// ---------------------------------------------------------------------------
// Organization Invite (invitations)
// ---------------------------------------------------------------------------

export const orgInviteSchema = z.object({
  email: z.string().email().optional(),
  role: z.enum(orgMemberRoles).optional(),
});

// ---------------------------------------------------------------------------
// Curriculum Links
// ---------------------------------------------------------------------------

const curriculumRelationTypes = ['prerequisite', 'follows', 'deepens', 'reviews'] as const;

export const curriculumCreateSchema = z.object({
  from_stage_id: z.string().min(1, 'from_stage_id is required'),
  to_stage_id: z.string().min(1, 'to_stage_id is required'),
  relation_type: z.enum(curriculumRelationTypes),
});

export const curriculumDeleteSchema = z.object({
  id: z.string().min(1, 'id is required'),
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

const paymentProviders = ['cinetpay', 'orange-money', 'wave', 'paypal'] as const;
const paymentCurrencies = ['MAD', 'XOF', 'TND', 'DZD', 'USD', 'EUR'] as const;

export const paymentInitiateSchema = z.object({
  provider: z.enum(paymentProviders),
  amount: z.number().positive('amount must be a positive number'),
  currency: z.enum(paymentCurrencies),
  description: z.string().optional().default(''),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export const certificateGenerateSchema = z.object({
  stageId: z.string().min(1, 'stageId is required'),
});

// ---------------------------------------------------------------------------
// Marketplace Agents
// ---------------------------------------------------------------------------

export const marketplacePublishSchema = z.object({
  agentId: z.string().min(1, 'agentId is required'),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const marketplaceReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().optional(),
});

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

export const mcpCallSchema = z.object({
  method: z.string().min(1, 'method is required'),
  params: z.object({
    name: z.string().optional(),
    arguments: z.record(z.string(), z.unknown()).optional(),
  }).optional(),
  id: z.number().optional(),
});

// ---------------------------------------------------------------------------
// Telemetry Consent
// ---------------------------------------------------------------------------

export const telemetryConsentSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  consent: z.boolean(),
});

// ---------------------------------------------------------------------------
// Invitations Consume
// ---------------------------------------------------------------------------

export const invitationConsumeSchema = z.object({
  token: z.string().min(1, 'token is required'),
});

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export const chatSchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1, 'messages must not be empty'),
  storeState: z.record(z.string(), z.unknown()),
  config: z.object({
    agentIds: z.array(z.string()).min(1, 'config.agentIds must not be empty'),
    sessionType: z.string().optional(),
  }),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
  providerType: z.string().optional(),
  requiresApiKey: z.boolean().optional(),
  directorState: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Quiz Grade
// ---------------------------------------------------------------------------

export const quizGradeSchema = z.object({
  question: z.string().min(1, 'question is required'),
  userAnswer: z.string().min(1, 'userAnswer is required'),
  points: z.number().positive(),
  commentPrompt: z.string().optional(),
  language: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Generate: Agent Profiles
// ---------------------------------------------------------------------------

export const generateAgentProfilesSchema = z.object({
  stageInfo: z.object({
    name: z.string().min(1, 'stageInfo.name is required'),
    description: z.string().optional(),
  }),
  sceneOutlines: z.array(z.object({
    title: z.string(),
    description: z.string().optional(),
  })).optional(),
  language: z.string().min(1, 'language is required'),
  availableAvatars: z.array(z.string()).min(1, 'availableAvatars must not be empty'),
  avatarDescriptions: z.array(z.object({
    path: z.string(),
    desc: z.string(),
  })).optional(),
  availableVoices: z.array(z.object({
    providerId: z.string(),
    voiceId: z.string(),
    voiceName: z.string(),
  })).optional(),
});

// ---------------------------------------------------------------------------
// Generate: Image
// ---------------------------------------------------------------------------

export const generateImageSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  negativePrompt: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  aspectRatio: z.string().optional(),
  style: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Generate: Scene Actions
// ---------------------------------------------------------------------------

export const generateSceneActionsSchema = z.object({
  outline: z.record(z.string(), z.unknown()),
  allOutlines: z.array(z.record(z.string(), z.unknown())).min(1, 'allOutlines must not be empty'),
  content: z.record(z.string(), z.unknown()),
  stageId: z.string().min(1, 'stageId is required'),
  agents: z.array(z.record(z.string(), z.unknown())).optional(),
  previousSpeeches: z.array(z.string()).optional(),
  userProfile: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Generate: Scene Content
// ---------------------------------------------------------------------------

export const generateSceneContentSchema = z.object({
  outline: z.record(z.string(), z.unknown()),
  allOutlines: z.array(z.record(z.string(), z.unknown())).min(1, 'allOutlines must not be empty'),
  pdfImages: z.array(z.record(z.string(), z.unknown())).optional(),
  imageMapping: z.record(z.string(), z.string()).optional(),
  stageInfo: z.object({
    name: z.string(),
    description: z.string().optional(),
    language: z.string().optional(),
    style: z.string().optional(),
  }).optional(),
  stageId: z.string().min(1, 'stageId is required'),
  agents: z.array(z.record(z.string(), z.unknown())).optional(),
});

// ---------------------------------------------------------------------------
// Generate: Scene Outlines Stream
// ---------------------------------------------------------------------------

export const generateSceneOutlinesStreamSchema = z.object({
  requirements: z.record(z.string(), z.unknown()),
  pdfText: z.string().optional(),
  pdfImages: z.array(z.record(z.string(), z.unknown())).optional(),
  imageMapping: z.record(z.string(), z.string()).optional(),
  researchContext: z.string().optional(),
  agents: z.array(z.record(z.string(), z.unknown())).optional(),
});

// ---------------------------------------------------------------------------
// Generate: TTS
// ---------------------------------------------------------------------------

export const generateTtsSchema = z.object({
  text: z.string().min(1, 'text is required'),
  audioId: z.string().min(1, 'audioId is required'),
  ttsProviderId: z.string().min(1, 'ttsProviderId is required'),
  ttsVoice: z.string().min(1, 'ttsVoice is required'),
  ttsSpeed: z.number().optional(),
  ttsApiKey: z.string().optional(),
  ttsBaseUrl: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Generate: Video
// ---------------------------------------------------------------------------

export const generateVideoSchema = z.object({
  prompt: z.string().min(1, 'prompt is required'),
  duration: z.number().optional(),
  aspectRatio: z.string().optional(),
  resolution: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Generate Classroom
// ---------------------------------------------------------------------------

export const generateClassroomSchema = z.object({
  requirement: z.string().min(1, 'requirement is required'),
  pdfContent: z.object({
    text: z.string(),
    images: z.array(z.string()),
  }).optional(),
  language: z.string().optional(),
  enableWebSearch: z.boolean().optional(),
  enableImageGeneration: z.boolean().optional(),
  enableVideoGeneration: z.boolean().optional(),
  enableTTS: z.boolean().optional(),
  agentMode: z.enum(['default', 'generate']).optional(),
});

// ---------------------------------------------------------------------------
// PBL Chat
// ---------------------------------------------------------------------------

export const pblChatSchema = z.object({
  message: z.string().min(1, 'message is required'),
  agent: z.record(z.string(), z.unknown()),
  currentIssue: z.record(z.string(), z.unknown()).nullable(),
  recentMessages: z.array(z.object({
    agent_name: z.string(),
    message: z.string(),
  })),
  userRole: z.string().optional().default(''),
  agentType: z.enum(['question', 'judge']).optional(),
});

// ---------------------------------------------------------------------------
// Classroom (persist)
// ---------------------------------------------------------------------------

export const classroomPersistSchema = z.object({
  stage: z.record(z.string(), z.unknown()),
  scenes: z.array(z.record(z.string(), z.unknown())),
});

// ---------------------------------------------------------------------------
// Web Search
// ---------------------------------------------------------------------------

export const webSearchSchema = z.object({
  query: z.string().min(1, 'query is required'),
  apiKey: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Verify Model
// ---------------------------------------------------------------------------

export const verifyModelSchema = z.object({
  model: z.string().min(1, 'Model name is required'),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  providerType: z.string().optional(),
  requiresApiKey: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Verify PDF Provider
// ---------------------------------------------------------------------------

export const verifyPdfProviderSchema = z.object({
  providerId: z.string().min(1, 'Provider ID is required'),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

// ---------------------------------------------------------------------------
// LTI Platforms (add)
// ---------------------------------------------------------------------------

export const ltiPlatformAddSchema = z.object({
  client_id: z.string().min(1),
  issuer: z.string().min(1),
  jwks_url: z.string().url(),
  auth_url: z.string().url(),
  token_url: z.string().url(),
  deployment_id: z.string().min(1),
});
