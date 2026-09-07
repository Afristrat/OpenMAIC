import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { HumanMessage } from '@langchain/core/messages';
import { AISdkLangGraphAdapter } from '@/lib/orchestration/ai-sdk-adapter';
import {
  callExternalTool,
  checkMCPHealth,
  disconnectAll,
  getConnectedServers,
  getExternalTools,
  initMCPClients,
} from '@/lib/mcp/client';

it('uses the real HTTP SDK, rejects invalid results and bounds a silent tool', async () => {
  const calls: string[] = [];
  let healthy = true;
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405).end();
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    const message = JSON.parse(body);
    if (message.id === undefined) {
      response.writeHead(202).end();
      return;
    }
    if (message.method === 'ping' && !healthy) return;
    let result: unknown = {};
    if (message.method === 'initialize') {
      result = {
        protocolVersion: message.params.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'qalem-test', version: '1.0.0' },
      };
    } else if (message.method === 'tools/list') {
      result = {
        tools: ['echo', 'invalid', 'silent'].map((name) => ({
          name,
          inputSchema: { type: 'object' },
        })),
      };
    } else if (message.method === 'tools/call') {
      calls.push(message.params.name);
      if (message.params.name === 'silent') return;
      result = {
        content: [{ type: 'text', text: message.params.name === 'invalid' ? 42 : 'résultat réel' }],
      };
    }
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server address');
  try {
    await initMCPClients([
      {
        id: 'http-test',
        name: 'HTTP test',
        url: `http://127.0.0.1:${address.port}/mcp`,
        enabled: true,
        organizationIds: ['tenant-a'],
        timeoutMs: 200,
      },
    ]);
    expect(getConnectedServers()).toEqual([
      expect.objectContaining({ id: 'http-test', status: 'connected', toolCount: 3 }),
    ]);
    await expect(callExternalTool('http-test', 'echo', {}, 'tenant-b')).rejects.toThrow(
      'access denied',
    );
    expect(calls).toEqual([]);
    await expect(callExternalTool('http-test', 'echo', {}, 'tenant-a')).resolves.toBe(
      'résultat réel',
    );
    // Only the model is scripted: the adapter, AI SDK loop and HTTP tool execute for real.
    let modelCalls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async ({ prompt }) => {
        modelCalls++;
        const first = modelCalls === 1;
        if (!first) expect(JSON.stringify(prompt)).toContain('résultat réel');
        return {
          content: first
            ? [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'http-test__echo', input: '{}' }]
            : [{ type: 'text', text: 'Réponse après consultation' }],
          finishReason: { unified: first ? 'tool-calls' : 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 0, text: 0, reasoning: 0 },
          },
          warnings: [],
        };
      },
    });
    const adapter = new AISdkLangGraphAdapter(model, undefined, getExternalTools('tenant-a'));
    const answer = await adapter.invoke([new HumanMessage('Consulte les documents.')]);
    expect(answer.content).toBe('Réponse après consultation');
    expect(modelCalls).toBe(2);
    await expect(callExternalTool('http-test', 'invalid', {}, 'tenant-a')).rejects.toThrow(
      'MCP tool call failed',
    );
    const started = performance.now();
    await expect(callExternalTool('http-test', 'silent', {}, 'tenant-a')).rejects.toThrow(
      'MCP tool call failed',
    );
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(calls).toEqual(['echo', 'echo', 'invalid', 'silent']);
    expect(await checkMCPHealth()).toEqual([expect.objectContaining({ status: 'connected' })]);
    healthy = false;
    expect(await checkMCPHealth()).toEqual([
      expect.objectContaining({ status: 'error', errorMessage: 'MCP health check failed' }),
    ]);
    await expect(callExternalTool('http-test', 'echo', {}, 'tenant-a')).rejects.toThrow(
      'not connected',
    );
    healthy = true;
    expect(await checkMCPHealth()).toEqual([
      expect.objectContaining({ status: 'connected', errorMessage: undefined }),
    ]);
  } finally {
    await disconnectAll();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
