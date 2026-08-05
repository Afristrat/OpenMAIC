/**
 * Stateless Chat API Endpoint
 *
 * POST /api/chat - Send message, receive SSE stream
 *
 * This endpoint:
 * 1. Receives full state from client (messages + storeState)
 * 2. Runs single-pass generation
 * 3. Streams events as SSE (text deltas + tool calls)
 *
 * Fully stateless: interruption is handled by the client aborting
 * the fetch request, which triggers req.signal on the server side.
 */

import { NextRequest } from 'next/server';
import { statelessGenerate } from '@/lib/orchestration/stateless-generate';
import { isProviderKeyRequired } from '@/lib/ai/providers';
import type { StatelessChatRequest, StatelessEvent } from '@/lib/types/chat';
import { apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { resolveModel } from '@/lib/server/resolve-model';
import type { ThinkingConfig } from '@/lib/types/provider';
import { isFeatureEnabled } from '@/lib/flags';
import {
  persistInterventionDecision,
  readClassroomSkillPromptContext,
} from '@/lib/server/classroom-storage';
import { resolveOrganizationSkillId } from '@/lib/server/skill-resolution';
import { requireAuth, requireSuperAdminOrOrgMember } from '@/lib/api/auth';
import { latestExplicitLearnerMessage } from '@/lib/webhooks/classroom-interaction';
import { enqueueClassroomInteraction } from '@/lib/jobs/queue';
const log = createLogger('Chat API');

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

/**
 * POST /api/chat
 * Send a message and receive SSE stream of generation events
 *
 * Request body: StatelessChatRequest
 * {
 *   messages: UIMessage[],
 *   storeState: { stage, scenes, currentSceneId, mode },
 *   config: { agentIds, sessionType? },
 *   apiKey: string,
 *   baseUrl?: string,
 *   model?: string
 * }
 *
 * Response: SSE stream of StatelessEvent
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  let chatModel: string | undefined;
  let chatMessageCount: number | undefined;
  let liveOrgId: string | null = null;

  try {
    const authentication = await requireAuth(req);
    if (authentication.response) return authentication.response;

    const body: StatelessChatRequest = await req.json();
    chatModel = body.model;
    chatMessageCount = body.messages?.length;

    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: messages');
    }

    if (!body.storeState) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: storeState');
    }

    if (!body.config || !body.config.agentIds || body.config.agentIds.length === 0) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: config.agentIds');
    }

    // The browser sends the stage back on every stateless turn, so prompt
    // activation must be re-established from server-owned state. This also
    // activates the global formation engine for classrooms created before the
    // prompt context was persisted.
    if (body.storeState.stage) {
      const skillEngineEnabled = await isFeatureEnabled('skill_engine');
      let persisted: Awaited<ReturnType<typeof readClassroomSkillPromptContext>> = null;
      try {
        persisted = await readClassroomSkillPromptContext(body.storeState.stage.id);
      } catch (error) {
        log.warn('Persisted live skill context is unavailable; using the core engine', error);
      }
      if (persisted) {
        liveOrgId = persisted.orgId;
        const access = await requireSuperAdminOrOrgMember(req, persisted.orgId);
        if (access.response) return access.response;

        if (persisted.animationConstitution) {
          const allowedIds = new Set(
            persisted.animationConstitution.agentRosterSnapshot
              .filter((agent) => agent.enabled)
              .map((agent) => agent.agentId),
          );
          if (body.config.agentIds.some((id) => !allowedIds.has(id))) {
            return apiError('INVALID_REQUEST', 400, 'An agent is not authorized for this classroom');
          }
          const serverAgents = persisted.generatedAgentConfigs ?? [];
          const requestedAgents = body.config.agentIds.map((id) =>
            serverAgents.find((agent) => agent.id === id),
          );
          if (requestedAgents.some((agent) => !agent)) {
            return apiError('INVALID_REQUEST', 400, 'An agent identity is unavailable');
          }
          body.config.agentConfigs = requestedAgents.map((agent) => ({
            id: agent!.id,
            name: agent!.name,
            role: agent!.role,
            persona: agent!.persona,
            avatar: agent!.avatar,
            color: agent!.color,
            allowedActions: [],
            priority: agent!.priority,
            interactionWeight: agent!.interactionWeight,
            mechanismId: agent!.mechanismId,
            gender: agent!.gender,
            isGenerated: true,
            boundStageId: body.storeState.stage!.id,
          }));
        }

        const learnerMessage = latestExplicitLearnerMessage(body.messages);
        if (learnerMessage) {
          await enqueueClassroomInteraction({
            event: 'classroom.interaction',
            orgId: persisted.orgId,
            interactionId: learnerMessage.id,
            payload: {
              classroomId: body.storeState.stage.id,
              sceneId: body.storeState.currentSceneId,
              user: authentication.user,
              transcript: body.messages,
            },
          });
        }
      }
      let activeSkillId = persisted?.context?.activeSkillId;
      if (skillEngineEnabled && activeSkillId && persisted) {
        try {
          activeSkillId = await resolveOrganizationSkillId(persisted.orgId, activeSkillId);
        } catch (error) {
          log.warn(`Live skill "${activeSkillId}" is unavailable; using the core engine`, error);
          activeSkillId = undefined;
        }
      }
      body.storeState.stage = {
        ...body.storeState.stage,
        skillPromptContext: {
          enabled: skillEngineEnabled,
          activeSkillId: skillEngineEnabled ? activeSkillId : undefined,
        },
      };
      body.animationConstitution = persisted?.animationConstitution;
    }

    const {
      model: languageModel,
      apiKey: resolvedApiKey,
      providerId,
      thinkingConfig: resolvedThinking,
    } = await resolveModel({
      modelString: body.model,
      stage: 'chat-adapter',
      apiKey: body.apiKey,
      baseUrl: body.baseUrl,
      providerType: body.providerType,
      // Let resolveModel arbitrate thinking too: a routed chat-adapter's thinking
      // wins, an unrouted one honors this client thinking (see resolve-model.ts).
      thinkingConfig: body.thinkingConfig ?? body.thinking,
    });

    if (isProviderKeyRequired(providerId) && !resolvedApiKey) {
      return apiError('MISSING_API_KEY', 401, 'API Key is required');
    }

    log.info('Processing request');
    log.info(
      `Agents: ${body.config.agentIds.join(', ')}, Messages: ${body.messages.length}, Turn: ${body.directorState?.turnCount ?? 0}`,
    );

    // Use the native request signal for abort propagation
    const signal = req.signal;

    // Create SSE stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Stream generation in background with heartbeat to prevent connection timeout
    const HEARTBEAT_INTERVAL_MS = 15_000;
    (async () => {
      // Heartbeat: periodically send SSE comments to keep the connection alive.
      // Proxies / browsers may close idle SSE connections after 30-120s of silence.
      let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
      const startHeartbeat = () => {
        stopHeartbeat();
        heartbeatTimer = setInterval(() => {
          try {
            writer.write(encoder.encode(`:heartbeat\n\n`)).catch(() => stopHeartbeat());
          } catch {
            stopHeartbeat();
          }
        }, HEARTBEAT_INTERVAL_MS);
      };
      const stopHeartbeat = () => {
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
      };

      try {
        startHeartbeat();

        // Use the resolved thinking (route-pinned for a routed chat-adapter,
        // else the client's). Default to disabled for low-latency chat.
        const thinkingConfig: ThinkingConfig = resolvedThinking ?? {
          mode: 'disabled',
          enabled: false,
        };

        const generator = statelessGenerate(
          {
            ...body,
            apiKey: resolvedApiKey,
          },
          signal,
          languageModel,
          thinkingConfig,
        );

        for await (const event of generator) {
          if (signal.aborted) {
            log.info('Request was aborted');
            break;
          }

          if (event.type === 'intervention_decision') {
            if (!liveOrgId) throw new Error('Intervention decision has no persisted classroom.');
            await persistInterventionDecision(event.data, liveOrgId, authentication.user.id);
          }

          const data = `data: ${JSON.stringify(event)}\n\n`;
          await writer.write(encoder.encode(data));
        }

        stopHeartbeat();
        await writer.close();
      } catch (error) {
        stopHeartbeat();

        // If aborted, just close the writer silently
        if (signal.aborted) {
          log.info('Request aborted during streaming');
          try {
            await writer.close();
          } catch {
            /* already closed */
          }
          return;
        }

        log.error(
          `Chat stream error [model=${body.model ?? 'unknown'}, agents=${body.config?.agentIds?.length ?? 0}, messages=${body.messages?.length ?? 0}]:`,
          error,
        );

        // Try to send error event
        try {
          const errorEvent: StatelessEvent = {
            type: 'error',
            data: {
              message: error instanceof Error ? error.message : String(error),
            },
          };
          await writer.write(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
          await writer.close();
        } catch {
          // Writer may already be closed
        }
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    log.error(
      `Chat request failed [model=${chatModel ?? 'unknown'}, messages=${chatMessageCount ?? 0}]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Failed to process request',
    );
  }
}
