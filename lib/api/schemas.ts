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
  logo: z.string().url().max(2048).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Organization Members
// ---------------------------------------------------------------------------

const orgMemberRoles = ['admin', 'manager', 'author', 'formateur', 'apprenant'] as const;

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
  params: z
    .object({
      name: z.string().optional(),
      arguments: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
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
// Generate: TTS
// ---------------------------------------------------------------------------

export const generateTTSSchema = z.object({
  text: z.string().min(1, 'text is required'),
  audioId: z.string().min(1, 'audioId is required'),
  ttsProviderId: z.string().min(1, 'ttsProviderId is required'),
  ttsModelId: z.string().optional(),
  ttsVoice: z.string().min(1, 'ttsVoice is required'),
  ttsSpeed: z.number().optional(),
  ttsApiKey: z.string().optional(),
  ttsBaseUrl: z.string().optional(),
  ttsProviderOptions: z.record(z.string(), z.unknown()).optional(),
  ttsLanguageOverride: z.enum(['fr', 'en']).optional(),
});

// ---------------------------------------------------------------------------
// Quiz Grade
// ---------------------------------------------------------------------------

export const quizGradeSchema = z.object({
  question: z.string().min(1, 'question is required'),
  userAnswer: z.string().min(1, 'userAnswer is required'),
  points: z.number().positive(),
  commentPrompt: z.string().optional(),
  language: z.enum(['fr-FR', 'ar-MA', 'en-US']).optional(),
});

// ---------------------------------------------------------------------------
// Generate: Agent Profiles
// ---------------------------------------------------------------------------

export const generateAgentProfilesSchema = z.object({
  stageInfo: z.object({
    name: z.string().min(1, 'stageInfo.name is required'),
    description: z.string().optional(),
  }),
  sceneOutlines: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
  language: z.string().min(1, 'language is required'),
  availableAvatars: z.array(z.string()).min(1, 'availableAvatars must not be empty'),
  avatarDescriptions: z
    .array(
      z.object({
        path: z.string(),
        desc: z.string(),
      }),
    )
    .optional(),
  availableVoices: z
    .array(
      z.object({
        providerId: z.string(),
        voiceId: z.string(),
        voiceName: z.string(),
      }),
    )
    .optional(),
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
  stageInfo: z
    .object({
      name: z.string(),
      description: z.string().optional(),
      language: z.string().optional(),
      style: z.string().optional(),
    })
    .optional(),
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

export const approvedSceneOutlineSchema = z
  .object({
    id: z.string().min(1).max(120),
    type: z.enum(['slide', 'quiz', 'interactive', 'pbl', 'plugin']),
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(4000),
    keyPoints: z.array(z.string().trim().min(1).max(1000)).max(12),
    teachingObjective: z.string().trim().min(1).max(1000).optional(),
    estimatedDuration: z.number().int().positive().max(7200).optional(),
    order: z.number().int().positive(),
    languageNote: z.string().trim().min(1).max(1000).optional(),
    suggestedImageIds: z.array(z.string().min(1).max(120)).max(30).optional(),
  })
  .passthrough();

export const approvedClassroomPlanSchema = z.object({
  courseTitle: z.string().trim().min(1).max(300),
  languageDirective: z.string().trim().min(1).max(2000),
  syllabus: z.object({
    audience: z.string().trim().min(1).max(2000),
    prerequisites: z.string().trim().min(1).max(2000),
    overallObjective: z.string().trim().min(1).max(2000),
    learningObjectives: z.array(z.string().trim().min(1).max(1000)).min(1).max(12),
    totalDurationMinutes: z.number().int().positive().max(10080),
    deliveryMode: z.string().trim().min(1).max(1000),
    assessmentStrategy: z.string().trim().min(1).max(2000),
    expectedDeliverable: z.string().trim().min(1).max(2000),
  }),
  outlines: z.array(approvedSceneOutlineSchema).min(1).max(60),
});

export const generateClassroomSchema = z.object({
  orgId: z.string().uuid('orgId must be a valid UUID'),
  courseId: z.string().uuid('courseId must be a valid UUID').optional(),
  requirement: z.string().min(1, 'requirement is required'),
  modelString: z
    .string()
    .trim()
    .min(3)
    .max(240)
    .regex(/^[A-Za-z0-9_-]+:.+$/)
    .optional(),
  pdfContent: z
    .object({
      text: z.string(),
      name: z.string().trim().min(1).max(260).optional(),
      images: z.array(
        z.union([
          z.string(),
          z.object({
            id: z.string().trim().min(1).max(120),
            src: z.string(),
            pageNumber: z.number().int().nonnegative(),
            description: z.string().max(2000).optional(),
            width: z.number().positive().optional(),
            height: z.number().positive().optional(),
          }),
        ]),
      ),
    })
    .optional(),
  language: z.enum(['fr-FR', 'ar-MA', 'en-US']).optional(),
  learningApproach: z.enum(['pedagogy', 'hybrid', 'andragogy']),
  interactionLevel: z.enum(['guided', 'balanced', 'immersive']),
  learningContext: z.object({
    territory: z.string().trim().min(1).max(120),
    currencyCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/),
  }),
  enableWebSearch: z.boolean().optional(),
  webSearchProviderId: z
    .enum(['tavily', 'bocha', 'brave', 'baidu', 'minimax', 'serper'])
    .optional(),
  webSearchApiKey: z.string().optional(),
  baiduSubSources: z
    .object({
      webSearch: z.boolean(),
      baike: z.boolean(),
      scholar: z.boolean(),
    })
    .optional(),
  enableImageGeneration: z.boolean().optional(),
  imageProviderId: z.string().min(1).max(80).optional(),
  imageModelId: z.string().min(1).max(160).optional(),
  enableVideoGeneration: z.boolean().optional(),
  enableTTS: z.boolean().optional(),
  interactiveMode: z.boolean().optional(),
  agentMode: z.enum(['default', 'generate']).optional(),
  selectedPersonaIds: z.array(z.string().min(1).max(80)).max(10).optional(),
  contextualSpecialists: z
    .array(
      z.object({
        id: z.string().regex(/^specialist-[A-Za-z0-9_-]+$/),
        name: z.string().min(1).max(80),
        occupationTitle: z.string().min(1).max(240),
        iscoCode: z.string().regex(/^\d{4}$/),
        escoUri: z.string().url(),
        reason: z.string().min(1).max(800),
        gender: z.enum(['female', 'male']),
        avatar: z.string().startsWith('/avatars/'),
        role: z.literal('assistant'),
        persona: z.string().min(1).max(4000),
        occupationalProfile: z.object({
          standard: z.literal('ISCO-08'),
          unitGroupCode: z.string().regex(/^\d{4}$/),
          unitGroupTitle: z.string().min(1).max(240),
          occupationDescription: z.string().min(1).max(4000),
          tasks: z.array(z.string().min(1).max(1000)).min(1).max(12),
          sourceTasks: z.array(z.string().min(1).max(1000)).min(1).max(12),
          taskLocale: z.enum(['fr-FR', 'ar-MA', 'en-US']),
          sourceVersion: z.literal('v1.2.1'),
          essentialSkills: z.array(z.string().min(1).max(400)).max(12),
          knowledge: z.array(z.string().min(1).max(400)).max(8),
          iscoUri: z.string().url(),
          occupationUri: z.string().url(),
          sourceUrl: z.string().url(),
        }),
        voiceConfig: z.object({
          providerId: z.string().min(1).max(80),
          voiceId: z.string().min(1).max(160),
        }),
      }),
    )
    .max(3)
    .optional(),
  teacherVoiceConfig: z
    .object({
      providerId: z.string().min(1).max(80),
      modelId: z.string().max(160).optional(),
      voiceId: z.string().min(1).max(160),
      voiceName: z.string().min(1).max(120).optional(),
      gender: z.enum(['female', 'male', 'neutral']).optional(),
    })
    .optional(),
  activeSkillId: z.string().min(1).max(120).optional(),
  approvedPlan: approvedClassroomPlanSchema.optional(),
});

// ---------------------------------------------------------------------------
// PBL Chat
// ---------------------------------------------------------------------------

export const pblChatSchema = z.object({
  message: z.string().min(1, 'message is required'),
  agent: z.record(z.string(), z.unknown()),
  currentIssue: z.record(z.string(), z.unknown()).nullable(),
  recentMessages: z.array(
    z.object({
      agent_name: z.string(),
      message: z.string(),
    }),
  ),
  userRole: z.string().optional().default(''),
  agentType: z.enum(['question', 'judge']).optional(),
});

// ---------------------------------------------------------------------------
// Classroom (persist)
// ---------------------------------------------------------------------------

export const classroomPersistSchema = z.object({
  orgId: z.string().uuid('orgId must be a valid UUID'),
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
// Profile (rich profile — culture, langue, préférences — S2-001)
// ---------------------------------------------------------------------------

export const profilePatchSchema = z.object({
  culture: z.string().min(1).max(40).optional(),
  uiLanguage: z.enum(['fr-FR', 'ar-MA', 'en-US']).optional(),
  preferences: z
    .object({
      pace: z.enum(['slow', 'normal', 'fast']).optional(),
      humorOk: z.boolean().optional(),
    })
    .strict()
    .optional(),
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
