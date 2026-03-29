/**
 * MCP-Compatible HTTP Endpoint
 *
 * Exposes Qalem tools via a JSON-RPC-like API compatible with MCP clients.
 *
 * GET  /api/mcp — Server info and available tools
 * POST /api/mcp — Call a tool: { method: "tools/call", params: { name, arguments } }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { TOOLS, callTool } from '@/lib/mcp/server';

export const maxDuration = 300;

function authenticate(req: NextRequest): Response | null {
  const apiKey = process.env.MCP_API_KEY;
  if (!apiKey) {
    // In production, refuse to run without auth configured
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'MCP endpoint not configured' },
        { status: 503 },
      );
    }
    return null; // Development only: open access when no key is set
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (token !== apiKey) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 403 });
  }

  return null;
}

export async function POST(req: NextRequest): Promise<Response> {
  const authError = authenticate(req);
  if (authError) return authError;

  try {
    const body = (await req.json()) as {
      method: string;
      params?: { name: string; arguments?: Record<string, unknown> };
      id?: number;
    };

    if (body.method === 'tools/list') {
      return NextResponse.json({ jsonrpc: '2.0', result: { tools: TOOLS }, id: body.id ?? 1 });
    }

    if (body.method === 'tools/call') {
      const result = await callTool(
        body.params?.name ?? '',
        body.params?.arguments ?? {},
      );
      return NextResponse.json({ jsonrpc: '2.0', result, id: body.id ?? 1 });
    }

    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32601, message: `Unknown method: ${body.method}` } },
      { status: 400 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32603, message } },
      { status: 500 },
    );
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json({
    name: 'qalem',
    version: '0.1.0',
    description: 'Qalem MCP Server — interactive AI classroom generation',
    tools: TOOLS,
  });
}
