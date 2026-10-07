import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePaymentComplete } from '../server/payments/paymentComplete.js';

// Server-to-server only (Make). Authenticated by a dedicated bearer secret; see server/payments/paymentComplete.ts.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
    return;
  }
  const result = await handlePaymentComplete(req.body, { authorization: req.headers.authorization });
  res.status(result.status).json(result.body);
}
