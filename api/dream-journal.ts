import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDreamJournal } from '../server/routes/dreamJournal.js';
import { sendPdf } from '../server/pdf/sendPdf.js';
// PREVIEW ONLY (preview/* branch, never merged to main): see server/pdf/previewHarness.ts
import { handlePreviewHarness, harnessAllowed } from '../server/pdf/previewHarness.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  // Preview fixtures are served on GET only, and only on a Vercel preview deployment; POST (the real export) is untouched.
  if (req.method === 'GET' && harnessAllowed()) {
    await handlePreviewHarness(req, res);
    return;
  }
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
