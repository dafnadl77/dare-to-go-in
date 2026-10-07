import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCredits } from '../server/routes/credits.js';
import { handleStartCheckout } from '../server/payments/checkoutStart.js';

// One function, two verbs (both about the account's credits): GET = the balance, POST = start a purchase.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const headers = { authorization: req.headers.authorization, cookie: req.headers.cookie };
  if (req.method === 'GET') {
    const result = await handleCredits(headers);
    res.status(result.status).json(result.body);
    return;
  }
  if (req.method === 'POST') {
    const result = await handleStartCheckout(req.body, headers);
    res.status(result.status).json(result.body);
    return;
  }
  res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
}
