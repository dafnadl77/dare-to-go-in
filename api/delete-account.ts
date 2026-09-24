import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDeleteAccount } from '../server/routes/deleteAccount.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  const result = await handleDeleteAccount(req.body, { authorization: req.headers.authorization, cookie: req.headers.cookie });
  res.status(result.status).json(result.body);
}
