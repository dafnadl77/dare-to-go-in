/**
 * ONE paid check of the image model (2026-10-28), only with her explicit approval: the same request the live image route sends (model
 * from imageModel(), 1536x1024, medium, jpeg), built from a synthetic dream through the app's own reconstruction brief. No account, no
 * database, no credits. It prints the tokens the API reports and their list-price cost, and saves the picture for her to look at.
 * Refuses to run without IMAGE_CHECK_APPROVED=yes; sends exactly one request.
 * Run: IMAGE_CHECK_APPROVED=yes npx tsx scripts/imageModelCheck.ts <output.jpg>
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import OpenAI from 'openai';

if (process.env.IMAGE_CHECK_APPROVED !== 'yes') {
  console.error('Not approved: nothing was sent.');
  process.exit(1);
}
const out = process.argv[2];
if (!out) {
  console.error('usage: IMAGE_CHECK_APPROVED=yes npx tsx scripts/imageModelCheck.ts <output.jpg>');
  process.exit(1);
}

const { imageModel } = await import('../server/routes/dreamImage.ts');
const { buildReconstructionBrief } = await import('../src/hero/reconstructionBrief.ts');
const { typedAnalysis } = await import('../src/demo/demoRouter.ts');

const dream = 'I was standing on a ferry at night and the shore kept moving further away. Then I found an old letter in my coat pocket.';
const brief = buildReconstructionBrief(typedAnalysis(dream, false) as never, []);
const prompt = `${brief.imagePrompt}\n\nAdditional constraints (must follow): ${brief.negativePrompt}`;
const model = imageModel();

const t0 = Date.now();
const res = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).images.generate({ model, prompt, size: '1536x1024', quality: 'medium', n: 1, output_format: 'jpeg' });
const ms = Date.now() - t0;
const b64 = res.data?.[0]?.b64_json;
const usage = (res as unknown as { usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } } }).usage;
const inTok = usage?.input_tokens ?? 0;
const outTok = usage?.output_tokens ?? 0;
// list prices from OpenAI's model page (2026-10-28): text input $5 / 1M, image output $30 / 1M
const usd = (inTok * 5 + outTok * 30) / 1_000_000;
if (b64) writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(JSON.stringify({ model, ms, picture: b64 ? `${Math.round((b64.length * 3) / 4 / 1024)} KB saved` : 'NONE', input_tokens: inTok, output_tokens: outTok, usd: Number(usd.toFixed(4)) }));
