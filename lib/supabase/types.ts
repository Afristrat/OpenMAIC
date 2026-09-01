// =============================================================================
// Qalem — Database TypeScript Types
// Mirrors the SQL schema in supabase/migrations/00001_initial_schema.sql
// =============================================================================

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type OrgMemberRole = 'admin' | 'manager' | 'author' | 'formateur' | 'apprenant';

export type OrgSector = 'healthcare' | 'legal' | 'tech' | 'finance' | 'education' | 'industry';

export type SceneType = 'slide' | 'quiz' | 'interactive' | 'pbl' | 'plugin';

export type CurriculumRelationType = 'prerequisite' | 'follows' | 'deepens' | 'reviews';

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface Profile {
  id: string; // UUID — matches auth.users.id
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  locale: string; // default 'fr-FR'
  created_at: string; // ISO 8601
  updated_at: string;
}

/** Données de personnalisation, volontairement isolées de profiles (S2-001). */
export interface UserProfile {
  user_id: string; // UUID — matches auth.users.id
  culture: string; // default 'ma-fr' — référentiel casting (S2-001/S2-002)
  ui_language: string; // 'fr-FR' | 'ar-MA' | 'en-US', default 'fr-FR' (S2-001)
  preferences: Record<string, unknown>; // rythme, humour accepté... (S2-001)
  updated_at: string;
}

/** Historique serveur des équipes de session, garantissant leur variation (S2-003). */
export interface Casting {
  id: string;
  user_id: string;
  course_id: string;
  session_no: number;
  lineup: Record<string, unknown>[];
  lineup_hash: string;
  created_at: string;
}

export interface Organization {
  id: string; // UUID
  name: string;
  sector: OrgSector | null;
  logo: string | null;
  default_locale: string; // default 'fr-FR'
  settings: Record<string, unknown>;
  status: 'active' | 'suspended';
  seat_limit: number;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string; // UUID
  user_id: string; // FK → profiles.id
  org_id: string; // FK → organizations.id
  role: OrgMemberRole;
  created_at: string;
}

export interface Stage {
  id: string;
  owner_id: string | null; // FK → profiles.id
  org_id: string | null; // FK → organizations.id
  name: string;
  description: string | null;
  language: string; // default 'fr-FR'
  style: string | null;
  agent_ids: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Scene {
  id: string;
  stage_id: string; // FK → stages.id
  type: SceneType;
  title: string | null;
  order: number;
  content: Record<string, unknown> | null;
  actions: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
}

export interface QuizAnswer {
  questionId: string;
  userAnswer: string;
  correct: boolean;
  timestamp: string;
}

export interface QuizResult {
  id: string; // UUID
  user_id: string; // FK → profiles.id
  stage_id: string; // FK → stages.id
  scene_id: string;
  answers: QuizAnswer[];
  score: number | null;
  completed_at: string;
}

export interface ReviewCard {
  id: string; // UUID
  user_id: string; // FK → profiles.id
  question: string;
  correct_answer: string;
  user_answer: string | null;
  difficulty: number; // default 0.3
  stability: number; // default 1.0
  due_date: string;
  last_review: string | null;
  reps: number; // default 0
  lapses: number; // default 0
  tags: string[] | null;
  source_ids: string[];
  source_stage_id: string | null; // FK → stages.id
  source_scene_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentConfig {
  id: string;
  owner_id: string | null; // FK → profiles.id
  org_id: string | null; // FK → organizations.id
  name: string;
  role: string;
  persona: string | null;
  avatar: string | null;
  color: string | null;
  priority: number; // default 5
  allowed_actions: string[] | null;
  voice_config: Record<string, unknown> | null;
  is_published: boolean; // default false
  usage_count: number; // default 0
  avg_rating: number; // default 0
  tags: string[] | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentReview {
  id: string; // UUID
  agent_id: string; // FK → agent_configs.id
  user_id: string; // FK → profiles.id
  rating: number; // 1-5
  comment: string | null;
  created_at: string;
}

export interface CurriculumLink {
  id: string; // UUID
  from_stage_id: string; // FK → stages.id
  to_stage_id: string; // FK → stages.id
  relation_type: CurriculumRelationType;
  org_id: string; // FK → organizations.id
  created_by: string | null; // FK → profiles.id
  created_at: string;
}

export interface SharedClassroom {
  id: string; // UUID
  stage_id: string; // FK → stages.id
  org_id: string; // FK → organizations.id
  shared_by: string | null; // FK → profiles.id
  visibility: 'private' | 'organization' | 'public';
  created_at: string;
}

export type CourseSourceKind = 'generated' | 'imported' | 'catalog_copy';
export type CourseStatus = 'draft' | 'ready' | 'archived';
export type CourseImportValidationStatus = 'pending' | 'conform' | 'rejected';

export interface CourseImport {
  id: string;
  owner_id: string;
  original_filename: string;
  storage_path: string;
  canvas_version: 'v1';
  validation_status: CourseImportValidationStatus;
  validation_report: Record<string, unknown>[];
  created_at: string;
}

export interface Course {
  id: string;
  owner_id: string;
  org_id: string | null;
  stage_id: string | null;
  title: string;
  language: 'fr-FR' | 'ar-MA' | 'en-US';
  source_kind: CourseSourceKind;
  import_id: string | null;
  source_manifest_id: string | null;
  outline: Record<string, unknown>;
  status: CourseStatus;
  catalog_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationSource {
  id: string;
  org_id: string;
  owner_id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  content_hash: string;
  parser_id: string;
  text_content: string;
  images: unknown[];
  status: 'ready' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormationSourceManifest {
  id: string;
  org_id: string;
  owner_id: string;
  version: number;
  source_ids: string[];
  previous_manifest_id: string | null;
  created_at: string;
}

export interface ClassroomTemplate {
  id: string; // UUID
  name: string;
  sector: string;
  description: string | null;
  requirements: Record<string, unknown>; // Pre-filled UserRequirements
  agent_config_ids: string[] | null;
  skill_ids: string[] | null;
  org_id: string | null; // FK → organizations.id (null = system template)
  created_by: string | null; // FK → profiles.id
  language: string;
  created_at: string;
}

export interface OrganizationSkill {
  id: string;
  org_id: string;
  skill_id: string;
  manifest: Record<string, unknown>;
  installed_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Insert types (omit server-generated fields)
// ---------------------------------------------------------------------------

export type ProfileInsert = Pick<Profile, 'id'> &
  Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;

export type UserProfileInsert = Pick<UserProfile, 'user_id'> &
  Partial<Pick<UserProfile, 'culture' | 'ui_language' | 'preferences'>>;

export type CastingInsert = Pick<Casting, 'user_id' | 'course_id' | 'lineup' | 'lineup_hash'> &
  Partial<Pick<Casting, 'session_no'>>;

export type OrganizationInsert = Partial<Omit<Organization, 'id' | 'created_at' | 'updated_at'>> &
  Pick<Organization, 'name'>;

export type OrgMemberInsert = Pick<OrgMember, 'user_id' | 'org_id'> &
  Partial<Omit<OrgMember, 'id' | 'created_at' | 'user_id' | 'org_id'>>;

export type StageInsert = Pick<Stage, 'id' | 'name'> &
  Partial<Omit<Stage, 'id' | 'name' | 'created_at' | 'updated_at'>>;

export type SceneInsert = Pick<Scene, 'id' | 'stage_id' | 'type' | 'order'> &
  Partial<Omit<Scene, 'id' | 'stage_id' | 'type' | 'order' | 'created_at'>>;

export type QuizResultInsert = Pick<QuizResult, 'user_id' | 'stage_id' | 'scene_id' | 'answers'> &
  Partial<Pick<QuizResult, 'id' | 'score'>>;

export type ReviewCardInsert = Pick<ReviewCard, 'user_id' | 'question' | 'correct_answer'> &
  Partial<
    Omit<ReviewCard, 'id' | 'user_id' | 'question' | 'correct_answer' | 'created_at' | 'updated_at'>
  >;

export type AgentConfigInsert = Pick<AgentConfig, 'id' | 'name' | 'role'> &
  Partial<Omit<AgentConfig, 'id' | 'name' | 'role' | 'created_at' | 'updated_at'>>;

export type AgentReviewInsert = Pick<AgentReview, 'agent_id' | 'user_id' | 'rating'> &
  Partial<Omit<AgentReview, 'id' | 'agent_id' | 'user_id' | 'rating' | 'created_at'>>;

export type CurriculumLinkInsert = Pick<
  CurriculumLink,
  'from_stage_id' | 'to_stage_id' | 'relation_type' | 'org_id'
> &
  Partial<
    Omit<
      CurriculumLink,
      'id' | 'from_stage_id' | 'to_stage_id' | 'relation_type' | 'org_id' | 'created_at'
    >
  >;

export type SharedClassroomInsert = Pick<SharedClassroom, 'stage_id' | 'org_id'> &
  Partial<Omit<SharedClassroom, 'id' | 'stage_id' | 'org_id' | 'created_at'>>;

export type CourseImportInsert = Pick<
  CourseImport,
  'owner_id' | 'original_filename' | 'storage_path'
> &
  Partial<Pick<CourseImport, 'canvas_version' | 'validation_status' | 'validation_report'>>;

export type CourseInsert = Pick<
  Course,
  'owner_id' | 'title' | 'language' | 'source_kind' | 'outline'
> &
  Partial<
    Pick<
      Course,
      'org_id' | 'stage_id' | 'import_id' | 'source_manifest_id' | 'status' | 'catalog_visible'
    >
  >;

export type OrganizationSourceInsert = Pick<
  OrganizationSource,
  | 'org_id'
  | 'owner_id'
  | 'name'
  | 'mime_type'
  | 'size_bytes'
  | 'content_hash'
  | 'parser_id'
  | 'text_content'
> &
  Partial<Pick<OrganizationSource, 'images' | 'status' | 'rejection_reason'>>;

export type FormationSourceManifestInsert = Pick<
  FormationSourceManifest,
  'org_id' | 'owner_id' | 'version' | 'source_ids'
> &
  Partial<Pick<FormationSourceManifest, 'previous_manifest_id'>>;

export type ClassroomTemplateInsert = Pick<ClassroomTemplate, 'name' | 'sector' | 'requirements'> &
  Partial<Omit<ClassroomTemplate, 'id' | 'name' | 'sector' | 'requirements' | 'created_at'>>;

export type OrganizationSkillInsert = Pick<OrganizationSkill, 'org_id' | 'skill_id' | 'manifest'> &
  Partial<
    Omit<OrganizationSkill, 'id' | 'org_id' | 'skill_id' | 'manifest' | 'created_at' | 'updated_at'>
  >;

// ---------------------------------------------------------------------------
// Update types (all fields optional except id)
// ---------------------------------------------------------------------------

export type ProfileUpdate = Partial<Omit<Profile, 'id' | 'created_at' | 'updated_at'>>;
export type UserProfileUpdate = Partial<Omit<UserProfile, 'user_id' | 'updated_at'>>;
export type OrganizationUpdate = Partial<Omit<Organization, 'id' | 'created_at' | 'updated_at'>>;
export type OrgMemberUpdate = Partial<Pick<OrgMember, 'role'>>;
export type StageUpdate = Partial<Omit<Stage, 'id' | 'created_at' | 'updated_at'>>;
export type SceneUpdate = Partial<Omit<Scene, 'id' | 'created_at'>>;
export type ReviewCardUpdate = Partial<
  Omit<ReviewCard, 'id' | 'user_id' | 'created_at' | 'updated_at'>
>;
export type AgentConfigUpdate = Partial<Omit<AgentConfig, 'id' | 'created_at' | 'updated_at'>>;
export type CurriculumLinkUpdate = Partial<Omit<CurriculumLink, 'id' | 'created_at'>>;
export type SharedClassroomUpdate = Partial<Pick<SharedClassroom, 'visibility'>>;
export type CourseUpdate = Partial<
  Pick<
    Course,
    | 'stage_id'
    | 'title'
    | 'language'
    | 'outline'
    | 'source_manifest_id'
    | 'status'
    | 'catalog_visible'
  >
>;
export type ClassroomTemplateUpdate = Partial<Omit<ClassroomTemplate, 'id' | 'created_at'>>;
export type OrganizationSkillUpdate = Pick<OrganizationSkill, 'manifest'>;

// ---------------------------------------------------------------------------
// Pedagogy Telemetry & Consent types
// ---------------------------------------------------------------------------

export interface PedagogyTelemetry {
  id: string; // UUID
  user_hash: string;
  stage_id: string | null;
  scene_sequence: string[] | null;
  scene_durations: number[] | null;
  quiz_scores: number[] | null;
  completion_rate: number | null;
  total_duration: number | null;
  subject_tags: string[] | null;
  language: string | null;
  level: string | null; // beginner, intermediate, advanced
  agent_count: number | null;
  created_at: string;
}

export type PedagogyTelemetryInsert = Pick<PedagogyTelemetry, 'user_hash'> &
  Partial<Omit<PedagogyTelemetry, 'id' | 'user_hash' | 'created_at'>>;

export interface TelemetryConsent {
  user_id: string; // UUID — FK → profiles.id
  pedagogy_consent: boolean;
  xapi_consent: boolean;
  consented_at: string;
}

export type TelemetryConsentInsert = Pick<TelemetryConsent, 'user_id'> &
  Partial<Omit<TelemetryConsent, 'user_id'>>;

export type TelemetryConsentUpdate = Partial<Omit<TelemetryConsent, 'user_id'>>;

// ---------------------------------------------------------------------------
// Discussion Fingerprint types
// ---------------------------------------------------------------------------

export interface DiscussionPattern {
  id: string; // UUID
  user_hash: string;
  stage_id: string | null;
  agent_sequence: string[] | null;
  intervention_types: string[] | null;
  turn_durations: number[] | null;
  total_turns: number | null;
  post_discussion_quiz_score: number | null;
  engagement_score: number | null;
  subject_tags: string[] | null;
  language: string | null;
  agent_count: number | null;
  created_at: string;
}

export type DiscussionPatternInsert = Pick<DiscussionPattern, 'user_hash'> &
  Partial<Omit<DiscussionPattern, 'id' | 'user_hash' | 'created_at'>>;

// ---------------------------------------------------------------------------
// LTI 1.3 types
// ---------------------------------------------------------------------------

export interface LtiRegistration {
  id: string; // UUID
  client_id: string;
  issuer: string;
  jwks_url: string;
  auth_url: string;
  token_url: string;
  deployment_id: string;
  created_at: string;
}

export type LtiRegistrationInsert = Omit<LtiRegistration, 'id' | 'created_at'>;

export interface LtiNonce {
  nonce: string;
  client_id: string;
  expires_at: string;
  consumed: boolean;
  created_at: string;
}

export type LtiNonceInsert = Pick<LtiNonce, 'nonce' | 'client_id' | 'expires_at'>;

export interface LtiGradeSubmission {
  id: string; // UUID
  user_id: string; // FK → profiles.id
  client_id: string; // FK → lti_registrations.client_id
  resource_link_id: string;
  line_item_url: string;
  score_given: number;
  score_maximum: number;
  activity_progress: string;
  grading_progress: string;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export type LtiGradeSubmissionInsert = Omit<LtiGradeSubmission, 'id' | 'created_at'>;

// ---------------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------------

export interface CertificateDbRow {
  id: string;
  user_id: string;
  stage_id: string;
  course_name: string;
  learner_name: string;
  completion_date: string;
  score: number;
  skills: string[] | null;
  verification_code: string;
  issued_by: string;
  org_id: string | null;
  created_at: string;
}

export type CertificateInsert = Omit<CertificateDbRow, 'id' | 'completion_date' | 'created_at'> &
  Partial<Pick<CertificateDbRow, 'completion_date'>>;

// ---------------------------------------------------------------------------
// Usage Tracking
// ---------------------------------------------------------------------------

export type UsageMetricType = 'tts_minutes' | 'api_calls' | 'ai_tokens' | 'storage_mb';

export interface UsageRecord {
  id: string; // UUID
  org_id: string | null; // FK → organizations.id
  user_id: string | null; // FK → profiles.id
  metric: UsageMetricType;
  quantity: number;
  billing_period: string; // e.g. '2026-03'
  recorded_at: string; // ISO 8601
}

export type UsageRecordInsert = Pick<UsageRecord, 'metric' | 'quantity' | 'billing_period'> & {
  org_id?: string | null;
  user_id?: string | null;
};

export interface UsageSummaryRow {
  org_id: string | null;
  user_id: string | null;
  billing_period: string;
  tts_minutes: number;
  api_calls: number;
  ai_tokens: number;
  storage_mb: number;
}

// ---------------------------------------------------------------------------
// Feature Flags (chantier 0 — SOCLE, docs/foundation/0-socle/02-data-dictionary.md)
// ---------------------------------------------------------------------------

export type FeatureFlagScope = 'global' | 'org' | 'user';

export interface FeatureFlagRow {
  id: string; // UUID
  flag_name: string;
  enabled: boolean;
  scope: FeatureFlagScope;
  description: string;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export type FeatureFlagInsert = Pick<FeatureFlagRow, 'flag_name' | 'description'> &
  Partial<Pick<FeatureFlagRow, 'enabled' | 'scope'>>;

export type FeatureFlagUpdate = Partial<Pick<FeatureFlagRow, 'enabled' | 'scope' | 'description'>>;

// ---------------------------------------------------------------------------
// Video Capsules (chantier 1 — CRÉER, S1-006, capsules Hyperframes)
// ---------------------------------------------------------------------------

export type VideoCapsuleStatus = 'queued' | 'generating' | 'rendering' | 'done' | 'error';

export interface VideoCapsuleVariant {
  lang: string;
  format: string;
  gatePassed: boolean;
  url: string;
}

export interface VideoCapsuleRow {
  id: string; // UUID
  stage_id: string;
  scene_id: string;
  owner_id: string | null;
  status: VideoCapsuleStatus;
  brief: Record<string, unknown>;
  mishkat_production_id: string | null;
  variants: VideoCapsuleVariant[] | null;
  error: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export type VideoCapsuleInsert = Pick<VideoCapsuleRow, 'stage_id' | 'scene_id' | 'brief'> &
  Partial<Pick<VideoCapsuleRow, 'owner_id' | 'status' | 'mishkat_production_id'>>;

export type VideoCapsuleUpdate = Partial<
  Pick<VideoCapsuleRow, 'status' | 'mishkat_production_id' | 'variants' | 'error'>
>;

// ---------------------------------------------------------------------------
// Export Jobs (chantier 1 — CRÉER, S1-007, packages SCORM/cmi5)
// ---------------------------------------------------------------------------

export type ExportJobFormat = 'scorm12' | 'scorm2004' | 'cmi5' | 'mp4';

export type ExportJobStatus = 'queued' | 'generating' | 'done' | 'error';

export interface ExportJobRow {
  id: string; // UUID
  stage_id: string;
  owner_id: string | null;
  format: ExportJobFormat;
  status: ExportJobStatus;
  storage_path: string | null;
  scene_count: number | null;
  error: string | null;
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export type ExportJobInsert = Pick<ExportJobRow, 'stage_id' | 'format'> &
  Partial<Pick<ExportJobRow, 'owner_id' | 'status'>>;

export type ExportJobUpdate = Partial<
  Pick<ExportJobRow, 'status' | 'storage_path' | 'scene_count' | 'error'>
>;

export type VideoGenerationJobStatus = 'queued' | 'generating' | 'done' | 'error';

export interface VideoGenerationJobRow {
  id: string;
  owner_id: string;
  org_id: string | null;
  provider_id: string;
  model_id: string | null;
  request: Record<string, unknown>;
  status: VideoGenerationJobStatus;
  storage_path: string | null;
  result_metadata: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type VideoGenerationJobInsert = Pick<
  VideoGenerationJobRow,
  'owner_id' | 'org_id' | 'provider_id' | 'request'
> &
  Partial<Pick<VideoGenerationJobRow, 'model_id' | 'status'>>;

export type VideoGenerationJobUpdate = Partial<
  Pick<VideoGenerationJobRow, 'status' | 'storage_path' | 'result_metadata' | 'error'>
>;

// ---------------------------------------------------------------------------
// Transmissions (chantier 2 — VIVRE, S2-010)
// ---------------------------------------------------------------------------

export type TransmissionStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface TransmissionRow {
  id: string;
  stage_id: string;
  sender_user_id: string;
  recipient_user_id: string;
  watermark_id: string;
  status: TransmissionStatus;
  source_artifact_path: string | null;
  audio_watermark_path: string | null;
  visual_watermark_path: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type TransmissionInsert = Pick<
  TransmissionRow,
  'stage_id' | 'sender_user_id' | 'recipient_user_id'
> &
  Partial<Pick<TransmissionRow, 'watermark_id' | 'status'>>;

export type TransmissionUpdate = Partial<
  Pick<
    TransmissionRow,
    'status' | 'source_artifact_path' | 'audio_watermark_path' | 'visual_watermark_path' | 'error'
  >
>;

// ---------------------------------------------------------------------------
// Supabase Database type (for createClient<Database>)
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      user_profiles: {
        Row: UserProfile;
        Insert: UserProfileInsert;
        Update: UserProfileUpdate;
      };
      castings: {
        Row: Casting;
        Insert: CastingInsert;
        Update: Record<string, never>;
      };
      organizations: {
        Row: Organization;
        Insert: OrganizationInsert;
        Update: OrganizationUpdate;
      };
      org_members: {
        Row: OrgMember;
        Insert: OrgMemberInsert;
        Update: OrgMemberUpdate;
      };
      stages: {
        Row: Stage;
        Insert: StageInsert;
        Update: StageUpdate;
      };
      scenes: {
        Row: Scene;
        Insert: SceneInsert;
        Update: SceneUpdate;
      };
      quiz_results: {
        Row: QuizResult;
        Insert: QuizResultInsert;
        Update: Record<string, never>;
      };
      review_cards: {
        Row: ReviewCard;
        Insert: ReviewCardInsert;
        Update: ReviewCardUpdate;
      };
      agent_configs: {
        Row: AgentConfig;
        Insert: AgentConfigInsert;
        Update: AgentConfigUpdate;
      };
      agent_reviews: {
        Row: AgentReview;
        Insert: AgentReviewInsert;
        Update: Partial<Pick<AgentReview, 'rating' | 'comment'>>;
      };
      discussion_patterns: {
        Row: DiscussionPattern;
        Insert: DiscussionPatternInsert;
        Update: Record<string, never>;
      };
      pedagogy_telemetry: {
        Row: PedagogyTelemetry;
        Insert: PedagogyTelemetryInsert;
        Update: Record<string, never>;
      };
      telemetry_consent: {
        Row: TelemetryConsent;
        Insert: TelemetryConsentInsert;
        Update: TelemetryConsentUpdate;
      };
      lti_registrations: {
        Row: LtiRegistration;
        Insert: LtiRegistrationInsert;
        Update: Record<string, never>;
      };
      lti_nonces: {
        Row: LtiNonce;
        Insert: LtiNonceInsert;
        Update: Partial<Pick<LtiNonce, 'consumed'>>;
      };
      lti_grade_submissions: {
        Row: LtiGradeSubmission;
        Insert: LtiGradeSubmissionInsert;
        Update: Record<string, never>;
      };
      curriculum_links: {
        Row: CurriculumLink;
        Insert: CurriculumLinkInsert;
        Update: CurriculumLinkUpdate;
      };
      shared_classrooms: {
        Row: SharedClassroom;
        Insert: SharedClassroomInsert;
        Update: SharedClassroomUpdate;
      };
      course_imports: {
        Row: CourseImport;
        Insert: CourseImportInsert;
        Update: Partial<Pick<CourseImport, 'validation_status' | 'validation_report'>>;
      };
      courses: {
        Row: Course;
        Insert: CourseInsert;
        Update: CourseUpdate;
      };
      organization_sources: {
        Row: OrganizationSource;
        Insert: OrganizationSourceInsert;
        Update: Partial<
          Pick<OrganizationSource, 'name' | 'parser_id' | 'status' | 'rejection_reason'>
        >;
      };
      formation_source_manifests: {
        Row: FormationSourceManifest;
        Insert: FormationSourceManifestInsert;
        Update: Record<string, never>;
      };
      classroom_templates: {
        Row: ClassroomTemplate;
        Insert: ClassroomTemplateInsert;
        Update: ClassroomTemplateUpdate;
      };
      organization_skills: {
        Row: OrganizationSkill;
        Insert: OrganizationSkillInsert;
        Update: OrganizationSkillUpdate;
      };
      certificates: {
        Row: CertificateDbRow;
        Insert: CertificateInsert;
        Update: Record<string, never>;
      };
      usage_records: {
        Row: UsageRecord;
        Insert: UsageRecordInsert;
        Update: Record<string, never>;
      };
      feature_flags: {
        Row: FeatureFlagRow;
        Insert: FeatureFlagInsert;
        Update: FeatureFlagUpdate;
      };
      video_capsules: {
        Row: VideoCapsuleRow;
        Insert: VideoCapsuleInsert;
        Update: VideoCapsuleUpdate;
      };
      export_jobs: {
        Row: ExportJobRow;
        Insert: ExportJobInsert;
        Update: ExportJobUpdate;
      };
      video_generation_jobs: {
        Row: VideoGenerationJobRow;
        Insert: VideoGenerationJobInsert;
        Update: VideoGenerationJobUpdate;
      };
      transmissions: {
        Row: TransmissionRow;
        Insert: TransmissionInsert;
        Update: TransmissionUpdate;
      };
    };
    Views: {
      usage_summary: {
        Row: UsageSummaryRow;
      };
    };
    Functions: {
      create_organization_with_admin: {
        Args: {
          organization_name: string;
          organization_sector?: OrgSector | null;
          organization_default_locale?: 'fr-FR' | 'ar-MA' | 'en-US';
        };
        Returns: Organization[];
      };
      replace_formation_source_manifest: {
        Args: {
          p_org_id: string;
          p_owner_id: string;
          p_source_ids: string[];
          p_expected_version?: number | null;
        };
        Returns: FormationSourceManifest[];
      };
    };
    Enums: Record<string, never>;
  };
}
