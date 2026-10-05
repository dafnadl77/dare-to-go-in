import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDreamJournal } from '../server/routes/dreamJournal.js';
import { sendPdf } from '../server/pdf/sendPdf.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ reason: 'request_failed', message: 'Method not allowed.' });
    return;
  }
  const result = await handleDreamJournal(req.body, { authorization: req.headers.authorization, cookie: req.headers.cookie });
  if ('pdf' in result) {
    await sendPdf(res, result.pdf);
    return;
  }
  res.status(result.status).json(result.body);
}
