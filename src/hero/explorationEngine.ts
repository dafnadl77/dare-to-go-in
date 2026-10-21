import { paidFetch } from '../auth/paidFetch';
import { getAuthHeader } from '../auth/getAccessToken';
import { createExplorationEngine } from './explorationEngineCore';

export * from './explorationEngineCore';

/** The engine for this page: real requests through paidFetch, with the account's bearer token. */
export const explorationEngine = createExplorationEngine({
  async post(url, body, timeoutMs) {
    const authHeader = await getAuthHeader();
    const res = await paidFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader }, body: JSON.stringify(body) }, { timeoutMs });
    return { status: res.status, data: await res.json().catch(() => null) };
  },
});
