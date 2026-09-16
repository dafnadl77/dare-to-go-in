import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleClaimTrial } from '../server/routes/claimTrial.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
    return;
  }
  const result = await handleClaimTrial(req.body, { authorization: req.headers.authorization, cookie: req.headers.cookie });
  res.status(result.status).json(result.body);
}
