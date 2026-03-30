import { z, type ZodType } from 'zod/v4';
import { NextResponse } from 'next/server';

/**
 * Validate an unknown body against a Zod schema.
 * Returns either the parsed data or a 400 NextResponse with issue details.
 */
export function validateBody<T>(
  schema: ZodType<T>,
  body: unknown,
): { success: true; data: T } | { success: false; response: NextResponse } {
  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Validation failed', details: result.error.issues },
        { status: 400 },
      ),
    };
  }
  return { success: true, data: result.data };
}
