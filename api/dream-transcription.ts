import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDreamTranscription } from '../server/routes/dreamTranscription.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
    return;
  }
  const result = await handleDreamTranscription(req.body, { authorization: req.headers.authorization, cookie: req.headers.cookie });
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) res.setHeader(key, value);
  }
  res.status(result.status).json(result.body);
}
