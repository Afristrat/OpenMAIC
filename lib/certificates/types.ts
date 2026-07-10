/**
 * Certificate issued when a learner completes a classroom stage.
 * Includes a unique verification code and QR-friendly URL.
 */
export interface Certificate {
  id: string; // UUID
  userId: string;
  stageId: string;
  courseName: string;
  learnerName: string;
  completionDate: Date;
  score: number; // 0-100
  skills: string[]; // skills/competencies covered
  verificationCode: string; // e.g. "QAL-2026-ABCD1234"
  verificationUrl: string; // https://qalem.example/verify/QAL-2026-ABCD1234
  issuedBy: string; // organization name or "Qalem"
  orgId?: string; // optional organization UUID
}

/**
 * Row shape returned by the Supabase `certificates` table.
 */
export interface CertificateRow {
  id: string;
  user_id: string;
  stage_id: string;
  course_name: string;
  learner_name: string;
  completion_date: string; // ISO timestamp
  score: number;
  skills: string[] | null;
  verification_code: string;
  issued_by: string;
  org_id: string | null;
  created_at: string;
}

/** Minimum quiz score (0-100) required to earn a certificate. */
export const CERTIFICATE_SCORE_THRESHOLD = 60;
