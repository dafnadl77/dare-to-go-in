import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDreamElementLabels } from '../server/routes/dreamElementLabels.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
    return;
  }
  const result = await handleDreamElementLabels(req.body);
  res.status(result.status).json(result.body);
}
