import 'dotenv/config';
import express from 'express';
import { handleDreamAnalysis } from './routes/dreamAnalysis.js';
import { handleDreamImage } from './routes/dreamImage.js';
import { handleDreamReflection } from './routes/dreamReflection.js';
import { handleDreamElementLabels } from './routes/dreamElementLabels.js';
import { handleDreamTranslation } from './routes/dreamTranslation.js';
import { handleDreamTranscription } from './routes/dreamTranscription.js';

const app = express();
// Raised from the original 2mb to comfortably fit a base64-encoded audio
// recording (see dreamTranscription.ts's own MAX_AUDIO_BASE64_CHARS for
// the real, tighter limit enforced on that route specifically) — every
// other route's payloads are tiny JSON and are unaffected by a larger cap.
app.use(express.json({ limit: '10mb' }));

app.post('/api/dream-analysis', async (req, res) => {
  const result = await handleDreamAnalysis(req.body);
  res.status(result.status).json(result.body);
});

app.post('/api/dream-image', async (req, res) => {
  const result = await handleDreamImage(req.body);
  res.status(result.status).json(result.body);
});

app.post('/api/dream-reflection', async (req, res) => {
  const result = await handleDreamReflection(req.body);
  res.status(result.status).json(result.body);
});

app.post('/api/dream-element-labels', async (req, res) => {
  const result = await handleDreamElementLabels(req.body);
  res.status(result.status).json(result.body);
});

app.post('/api/dream-translation', async (req, res) => {
  const result = await handleDreamTranslation(req.body);
  res.status(result.status).json(result.body);
});

app.post('/api/dream-transcription', async (req, res) => {
  const result = await handleDreamTranscription(req.body);
  res.status(result.status).json(result.body);
});

// A distinct name (not PORT) so it can never collide with an ambient PORT
// env var some other tool (e.g. the frontend dev server) already uses.
// Local development only — Vercel never executes this file in production;
// see api/*.ts for the serverless entry points that run there instead.
const port = Number(process.env.DREAM_ANALYSIS_PORT) || 8787;
app.listen(port, () => {
  console.log(`Dream Analysis backend listening on http://localhost:${port}`);
});
