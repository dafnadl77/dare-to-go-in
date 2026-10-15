import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCredits } from '../server/routes/credits.js';
import { handleStartCheckout } from '../server/payments/checkoutStart.js';
import { handleUnlimitedAccess } from '../server/routes/adminUnlimitedAccess.js';
import { handleAdminPaidOrders } from '../server/routes/adminPaidOrders.js';

// One function, two verbs (both about the account's credits): GET = the balance, POST = start a purchase.
// ?admin=unlimited is the administrator's unlimited-access area (GET = the list, POST = grant or revoke) and ?admin=orders is the
// administrator's read-only list of completed purchases; both are checked first and their handlers refuse everyone but the verified administrator.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const headers = { authorization: req.headers.authorization, cookie: req.headers.cookie };
  if (req.query.admin === 'unlimited') {
    const result = await handleUnlimitedAccess(req.method, req.body, headers);
    res.status(result.status).json(result.body);
    return;
  }
  if (req.query.admin === 'orders') {
    const result = await handleAdminPaidOrders(req.method, headers);
    res.status(result.status).json(result.body);
    return;
  }
  if (req.method === 'GET') {
    const order = typeof req.query.order === 'string' ? req.query.order : undefined;
    const result = await handleCredits(headers, order);
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
