import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDreamReflection } from '../server/routes/dreamReflection.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
    return;
  }
  const result = await handleDreamReflection(req.body);
  res.status(result.status).json(result.body);
}
