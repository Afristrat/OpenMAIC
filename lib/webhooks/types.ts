/**
 * Webhook system types for Qalem PaaS layer.
 */

export type WebhookEvent =
  | 'classroom.created'
  | 'classroom.completed'
  | 'quiz.completed'
  | 'certificate.issued'
  | 'payment.received'
  | 'member.joined';

export const WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  'classroom.created',
  'classroom.completed',
  'quiz.completed',
  'certificate.issued',
  'payment.received',
  'member.joined',
] as const;

export interface WebhookConfig {
  id: string;
  orgId: string;
  url: string;
  events: WebhookEvent[];
  secret: string; // HMAC-SHA256 signing secret
  active: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: unknown;
  statusCode: number | null;
  responseBody: string | null;
  attempt: number;
  deliveredAt: string;
}
