import express from 'express';
import { runCapture, type CaptureRequest } from './capture.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/capture', async (req, res) => {
  const body = req.body as Partial<CaptureRequest>;
  if (!body.url || !Array.isArray(body.interactionSteps) || !body.format) {
    res.status(400).json({ success: false, error: 'Missing url/interactionSteps/format' });
    return;
  }
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
});

const port = Number(process.env.PORT) || 8090;
app.listen(port, () => console.log(`capture-worker listening on :${port}`));
