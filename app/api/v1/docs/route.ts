/**
 * OpenAPI v1 Documentation Endpoint
 *
 * GET /api/v1/docs — Returns the OpenAPI 3.0.3 spec for the Qalem v1 API.
 */

import { NextResponse } from 'next/server';

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Qalem API',
    version: '1.0.0',
    description:
      'API for AI classroom generation — create interactive classrooms, grade quizzes, and generate TTS audio.',
    license: { name: 'AGPL-3.0', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
  },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/classrooms': {
      get: {
        summary: 'Retrieve a classroom by ID',
        parameters: [
          {
            name: 'classroomId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'The classroom UUID',
          },
        ],
        responses: {
          '200': { description: 'Classroom data' },
          '400': { description: 'Missing or invalid classroomId' },
          '404': { description: 'Classroom not found' },
        },
      },
      post: {
        summary: 'Create or persist a classroom',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  classroomId: { type: 'string' },
                  title: { type: 'string' },
                  scenes: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Classroom saved successfully' },
          '400': { description: 'Invalid request body' },
        },
      },
    },
    '/generate': {
      post: {
        summary: 'Generate a full classroom',
        description:
          'Starts an asynchronous classroom generation job. Returns a jobId for polling progress.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['topic'],
                properties: {
                  topic: { type: 'string', description: 'The topic for the classroom' },
                  language: {
                    type: 'string',
                    enum: ['fr', 'ar', 'en'],
                    description: 'Target language',
                  },
                  sceneCount: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 20,
                    description: 'Number of scenes to generate',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Generation job created' },
          '401': { description: 'Authentication required' },
        },
      },
    },
    '/quiz': {
      post: {
        summary: 'Grade quiz answers',
        description:
          'Submits a text question and user answer for AI-powered grading and feedback.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['question', 'answer'],
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' },
                  context: { type: 'string', description: 'Optional context for grading' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Grading result with score and feedback' },
          '400': { description: 'Missing question or answer' },
        },
      },
    },
    '/tts': {
      post: {
        summary: 'Generate TTS audio',
        description: 'Generates text-to-speech audio and returns base64-encoded data.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['text'],
                properties: {
                  text: { type: 'string', description: 'Text to synthesize' },
                  voice: { type: 'string', description: 'Voice identifier' },
                  language: { type: 'string', description: 'Language code (fr, ar, en)' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Base64-encoded audio data' },
          '400': { description: 'Missing text parameter' },
        },
      },
    },
  },
} as const;

export function GET(): NextResponse {
  return NextResponse.json(spec, {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  });
}
