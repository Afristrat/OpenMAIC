import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { InsufficientCreditsError } from '@/lib/billing/insufficient-credits';

const ORG_ID = '00000000-0000-4000-8000-000000000015';

const mocks = vi.hoisted(() => ({
  assertCredits: vi.fn(),
  createJob: vi.fn(),
  createPlanJob: vi.fn(),
  enqueue: vi.fn(),
  enqueuePlan: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/billing/credit-preflight', () => ({ assertCreditsAvailable: mocks.assertCredits }));
vi.mock('@/lib/api/auth', () => ({
  requireSuperAdminOrOrgAuthor: async () => ({
    user: { id: 'author', email: 'author@qalem.ma' },
    authoredByRole: 'admin',
  }),
}));
vi.mock('@/lib/server/course-generation-access', () => ({
  assertCourseGenerationAccess: vi.fn(),
  CourseAccessError: class CourseAccessError extends Error {},
  FreeCourseLimitError: class FreeCourseLimitError extends Error {},
}));
vi.mock('@/lib/server/classroom-storage', () => ({ buildRequestOrigin: () => 'https://qalem.ma' }));
vi.mock('@/lib/server/classroom-job-store', () => ({
  createClassroomGenerationJob: mocks.createJob,
  markClassroomGenerationJobFailed: vi.fn(),
}));
vi.mock('@/lib/server/classroom-plan-job-store', () => ({
  createClassroomPlanJob: mocks.createPlanJob,
  markClassroomPlanJobFailed: vi.fn(),
}));
vi.mock('@/lib/jobs/queue', () => ({
  enqueueClassroomGeneration: mocks.enqueue,
  enqueueClassroomPlan: mocks.enqueuePlan,
}));

import { POST as generate } from '@/app/api/generate-classroom/route';
import { POST as plan } from '@/app/api/generate-classroom/plan/route';

function request(url: string): NextRequest {
  return new NextRequest(`https://qalem.ma${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      orgId: ORG_ID,
      requirement: 'Cours de gestion de projet',
      learningApproach: 'andragogy',
      interactionLevel: 'guided',
      learningContext: { territory: 'MA', currencyCode: 'MAD' },
    }),
  });
}

describe('pré-contrôle des crédits avant la création d’un job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createJob.mockResolvedValue({ id: 'j', status: 'queued', step: 'queued', message: 'm' });
    mocks.createPlanJob.mockResolvedValue({ id: 'p', status: 'queued' });
  });

  it.each([
    ['cours', generate, '/api/generate-classroom'],
    ['plan', plan, '/api/generate-classroom/plan'],
  ])('refuse en 402 avec le code stable, sans créer de job (%s)', async (_label, handler, url) => {
    mocks.assertCredits.mockRejectedValue(
      new InsufficientCreditsError('INSUFFICIENT_TENANT_CREDITS', {
        balanceMicrounits: 1_000_000,
        requiredMicrounits: 7_000_000,
      }),
    );
    const response = await handler(request(url));
    const body = await response.json();
    expect(response.status).toBe(402);
    expect(body.errorCode).toBe('INSUFFICIENT_CREDITS');
    expect(JSON.parse(body.details)).toEqual({
      balanceMicrounits: 1_000_000,
      requiredMicrounits: 7_000_000,
    });
    expect(mocks.createJob).not.toHaveBeenCalled();
    expect(mocks.createPlanJob).not.toHaveBeenCalled();
  });

  it('laisse passer quand le solde suffit', async () => {
    mocks.assertCredits.mockResolvedValue({ blocked: false });
    const response = await generate(request('/api/generate-classroom'));
    expect(response.status).toBe(202);
    expect(mocks.createJob).toHaveBeenCalledOnce();
  });

  it('ne bloque pas quand la lecture du solde échoue : la réservation tranchera', async () => {
    mocks.assertCredits.mockRejectedValue(new Error('Credit status read failed'));
    const response = await generate(request('/api/generate-classroom'));
    expect(response.status).toBe(202);
  });
});
