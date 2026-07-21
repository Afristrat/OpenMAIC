import express from 'express';
import { runCapture, type CaptureRequest } from './capture.js';
import { isAuthorized } from './auth.js';
import { validateUrlForSSRF } from './ssrf-guard.js';

export const app = express();
app.use(express.json({ limit: '2mb' }));

function boundedInteger(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, maximum);
}

const maxConcurrency = boundedInteger('CAPTURE_MAX_CONCURRENCY', 1, 2);
let activeCaptures = 0;

app.get('/health', (_req, res) => res.json({ ok: true, activeCaptures, maxConcurrency }));

app.post('/capture', async (req, res) => {
  if (!isAuthorized(req.header('authorization'))) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const body = req.body as Partial<CaptureRequest>;
  if (
    !body.url ||
    !Array.isArray(body.interactionSteps) ||
    (body.format !== 'image' && body.format !== 'video')
  ) {
    res.status(400).json({ success: false, error: 'Missing url/interactionSteps/format' });
    return;
  }
  if (
    body.interactionSteps.length > 20 ||
    body.interactionSteps.some((step) => (step.ms ?? 0) < 0 || (step.ms ?? 0) > 5000)
  ) {
    res.status(400).json({ success: false, error: 'Interaction plan exceeds capture limits' });
    return;
  }

  const ssrfError = await validateUrlForSSRF(body.url);
  if (ssrfError) {
    res.status(400).json({ success: false, error: ssrfError });
    return;
  }

  if (activeCaptures >= maxConcurrency) {
    res.setHeader('Retry-After', '5');
    res.status(429).json({ success: false, error: 'Capture capacity reached' });
    return;
  }

  activeCaptures += 1;
  try {
    const result = await runCapture(body as CaptureRequest);
    if (!result.success) {
      res.status(200).json({ success: false, error: result.error });
      return;
    }
    res.status(200).json({
      success: true,
      buffer: result.buffer.toString('base64'),
      contentType: result.contentType,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    activeCaptures -= 1;
  }
});

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const port = Number(process.env.PORT) || 8090;
  app.listen(port, () => console.log(`capture-worker listening on :${port}`));
}
