import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePaymentComplete } from '../server/payments/paymentComplete.js';
import { handleGrowNotify } from '../server/payments/growNotify.js';

// Server-to-server only. Two independent callers share this one function (the project stays at 12 functions):
//  - Make (the existing path): authenticated by a dedicated bearer secret; see server/payments/paymentComplete.ts.
//  - Grow directly, at /api/grow-notify (a vercel.json rewrite adds ?via=grow-notify): checked by source address, order
//    binding and content; see server/payments/growNotify.ts. Off unless GROW_NOTIFY_MODE is set; it cannot grant yet.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.query.via === 'grow-notify') {
    try {
      const result = await handleGrowNotify({
        method: req.method,
        vercelForwardedFor: req.headers['x-vercel-forwarded-for'],
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        // @vercel/node parses the body lazily on first access: it is read only after the source address passed.
        readBody: () => req.body,
      });
      res.status(result.status).json(result.body);
    } catch {
      // A fixed code only: an error message could carry request data. 503 = Grow keeps the notification and retries.
      console.error('grow_notify_failed');
      res.status(503).json({ reason: 'not_configured', message: 'Not available right now.' });
    }
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
    return;
  }
  const result = await handlePaymentComplete(req.body, { authorization: req.headers.authorization });
  res.status(result.status).json(result.body);
}
