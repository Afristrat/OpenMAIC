import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { createLogger } from '@/lib/logger';
import type { CaptureDecision } from '@/lib/generation/web-capture-plan';

const log = createLogger('CaptureClient');

const CAPTURE_WORKER_URL = process.env.CAPTURE_WORKER_URL || 'http://capture-worker:8090';

export interface CaptureAsset {
  assetUrl: string;
  format: 'image' | 'video';
}

/**
 * Calls the dedicated capture service and, on success, uploads the result to
 * Supabase Storage (bucket `classroom-media`, same convention as
 * `uploadClassroomMedia` in classroom-media-generation.ts). Returns `null` on
 * ANY failure — network, service-reported error, upload error — the caller
 * must treat this exactly like "no capture" and continue scene generation.
 */
export async function requestWebCapture(
  decision: CaptureDecision,
  classroomId: string,
): Promise<CaptureAsset | null> {
  try {
    const captureWorkerToken = process.env.CAPTURE_WORKER_TOKEN;
    const response = await fetch(`${CAPTURE_WORKER_URL}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(captureWorkerToken ? { Authorization: `Bearer ${captureWorkerToken}` } : {}),
      },
      body: JSON.stringify({
        url: decision.url,
        interactionSteps: decision.interactionSteps,
        format: decision.format,
      }),
    });
    if (!response.ok) {
      log.warn(`capture-worker HTTP ${response.status} for ${decision.url}`);
      return null;
    }
    const data = (await response.json()) as
      | { success: true; buffer: string; contentType: string }
      | { success: false; error: string };

    if (!data.success) {
      log.warn(`capture failed for ${decision.url}: ${data.error}`);
      return null;
    }

    const buf = Buffer.from(data.buffer, 'base64');
    const ext = data.contentType === 'video/webm' ? 'webm' : 'png';
    const filename = `capture_${Date.now()}.${ext}`;
    const supabase = createServiceSupabaseClient();
    const { error: uploadError } = await supabase.storage
      .from('classroom-media')
      .upload(`${classroomId}/media/${filename}`, buf, {
        contentType: data.contentType,
        upsert: true,
      });
    if (uploadError) {
      log.warn(`upload failed for capture of ${decision.url}: ${uploadError.message}`);
      return null;
    }

    return {
      assetUrl: `/api/classroom-media/${classroomId}/media/${filename}`,
      format: decision.format,
    };
  } catch (err) {
    log.warn(`capture-worker unreachable for ${decision.url}:`, err);
    return null;
  }
}
