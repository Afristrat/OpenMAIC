import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('API');

export class AppError extends Error {
  constructor(
    message: string,
    public code: string = 'INTERNAL_ERROR',
    public status: number = 500,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function withErrorHandler(
  handler: (req: NextRequest, context?: unknown) => Promise<NextResponse>,
) {
  return async (req: NextRequest, context?: unknown): Promise<NextResponse> => {
    try {
      return await handler(req, context);
    } catch (error) {
      if (error instanceof AppError) {
        return NextResponse.json(
          { error: error.message, code: error.code, status: error.status },
          { status: error.status },
        );
      }

      const message =
        error instanceof Error ? error.message : 'Internal server error';
      log.error(
        `Unhandled error in ${req.method} ${req.nextUrl.pathname}: ${message}`,
      );

      return NextResponse.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR', status: 500 },
        { status: 500 },
      );
    }
  };
}
