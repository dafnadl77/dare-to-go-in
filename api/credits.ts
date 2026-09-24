import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCredits } from '../server/routes/credits.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  const result = await handleCredits({ authorization: req.headers.authorization, cookie: req.headers.cookie });
  res.status(result.status).json(result.body);
}
