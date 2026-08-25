import OpenAI from 'openai';

let client: OpenAI | null = null;
let clientKey: string | undefined;

/**
 * Lazily constructs the OpenAI client so a missing key is reported as a
 * controlled error at request time, not a crash at server boot.
 */
export function getOpenAIClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  if (!client || clientKey !== apiKey) {
    client = new OpenAI({ apiKey });
    clientKey = apiKey;
  }
  return client;
}
