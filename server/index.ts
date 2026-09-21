import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import { handleDreamAnalysis } from './routes/dreamAnalysis.js';
import { handleDreamImage } from './routes/dreamImage.js';
import { handleDreamReflection } from './routes/dreamReflection.js';
import { handleDreamElementLabels } from './routes/dreamElementLabels.js';
import { handleDreamTranslation } from './routes/dreamTranslation.js';
import { handleDreamTranscription } from './routes/dreamTranscription.js';
import { handleClaimTrial } from './routes/claimTrial.js';
import { handleTrialSession } from './routes/trialSession.js';
import type { HandlerResult } from './httpResult.js';
import type { RequestHeaders } from './callerIdentity.js';

const app = express();
// Raised from the original 2mb to comfortably fit a base64-encoded audio
// recording (see dreamTranscription.ts's own MAX_AUDIO_BASE64_CHARS for
// the real, tighter limit enforced on that route specifically) — every
// other route's payloads are tiny JSON and are unaffected by a larger cap.
app.use(express.json({ limit: '10mb' }));

function requestHeaders(req: Request): RequestHeaders {
  return { authorization: req.headers.authorization, cookie: req.headers.cookie };
}

function send(res: Response, result: HandlerResult) {
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  }
  res.status(result.status).json(result.body);
}

app.post('/api/dream-analysis', async (req, res) => {
  send(res, await handleDreamAnalysis(req.body, requestHeaders(req)));
});

app.post('/api/dream-image', async (req, res) => {
  send(res, await handleDreamImage(req.body, requestHeaders(req)));
});

app.post('/api/dream-reflection', async (req, res) => {
  send(res, await handleDreamReflection(req.body, requestHeaders(req)));
});

app.post('/api/dream-element-labels', async (req, res) => {
  send(res, await handleDreamElementLabels(req.body, requestHeaders(req)));
});

app.post('/api/dream-translation', async (req, res) => {
  send(res, await handleDreamTranslation(req.body, requestHeaders(req)));
});

app.post('/api/dream-transcription', async (req, res) => {
  send(res, await handleDreamTranscription(req.body, requestHeaders(req)));
});

app.post('/api/trial-session', async (req, res) => {
  send(res, await handleTrialSession(requestHeaders(req)));
});

app.post('/api/claim-trial', async (req, res) => {
  send(res, await handleClaimTrial(req.body, requestHeaders(req)));
});

// A distinct name (not PORT) so it can never collide with an ambient PORT
// env var some other tool (e.g. the frontend dev server) already uses.
// Local development only — Vercel never executes this file in production;
// see api/*.ts for the serverless entry points that run there instead.
const port = Number(process.env.DREAM_ANALYSIS_PORT) || 8787;
app.listen(port, () => {
  console.log(`Dream Analysis backend listening on http://localhost:${port}`);
});
