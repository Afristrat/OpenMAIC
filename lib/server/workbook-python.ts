import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { ResourceGenerationRequest } from '@/lib/types/generation';

const MAX_OUTPUT_BYTES = 12 * 1024 * 1024;
const PYTHON_TIMEOUT_MS = 15_000;

export interface WorkbookAssessment {
  profile: string | null;
  score: number;
  verdict: string;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    ratio?: number;
    weight: number;
  }>;
  metrics: Record<string, string | number | null>;
  findings: string[];
  authority?: 'python-deterministic';
}

function pythonExecutable(): string {
  return process.env.PYTHON_BINARY || (process.platform === 'win32' ? 'python' : 'python3');
}

function workbookScriptPath(): string {
  return path.join(process.cwd(), 'scripts', 'workbooks', 'qalem_workbook.py');
}

async function runPython(args: string[], stdin?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable(), [workbookScriptPath(), ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Python workbook operation timed out'));
    }, PYTHON_TIMEOUT_MS);
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        reject(new Error('Python workbook output exceeded the safety limit'));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString('utf8').trim().slice(0, 500);
        reject(
          new Error(`Python workbook operation failed (${code})${detail ? `: ${detail}` : ''}`),
        );
        return;
      }
      resolve(Buffer.concat(stdout));
    });
    child.stdin.end(stdin);
  });
}

export async function generateWorkbookWithPython(
  spec: unknown,
  profile?: ResourceGenerationRequest['evaluationProfile'],
): Promise<Buffer> {
  return runPython(['generate'], Buffer.from(JSON.stringify({ spec, profile }), 'utf8'));
}

export async function evaluateWorkbookWithPython(file: Buffer): Promise<WorkbookAssessment> {
  const directory = await mkdtemp(path.join(tmpdir(), 'qalem-workbook-'));
  const filePath = path.join(directory, 'submission.xlsx');
  try {
    await writeFile(filePath, file, { flag: 'wx' });
    const output = await runPython(['evaluate', filePath]);
    return JSON.parse(output.toString('utf8')) as WorkbookAssessment;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
