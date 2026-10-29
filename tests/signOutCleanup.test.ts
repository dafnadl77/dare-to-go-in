import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

// The translation module reaches the Supabase client, which reads Vite's environment when it loads; here it is a plain stand-in
// (no network in this test, nothing signs in).
register(
  'data:text/javascript,' +
    encodeURIComponent(
      `export async function load(url, context, next) { if (/\\/src\\/auth\\/supabaseClient\\.ts$/.test(url)) return { format: 'module', source: 'export const supabase = { auth: {} }; export const isSupabaseConfigured = false;', shortCircuit: true }; return next(url, context); }`,
    ),
);

/**
 * SIGNING OUT CLEARS THE ACCOUNT'S TEMPORARY DREAM DATA FROM THIS BROWSER (2026-10-29). The privacy policy says that on sign-out the
 * draft and the account's temporary storage are removed from the device; sign-out removed only the unfinished journeys. Now it also
 * removes the draft, a dream waiting to be saved, the last submission record and the translations (stored and in memory), so the next
 * person to sign in on the same browser sees nothing of them. What lives in the account (dreams, conversations, credits, purchases)
 * is on the server and is never touched; device settings stay; deleting the account still removes everything.
 */

class MemoryStore {
  private items = new Map<string, string>();
  getItem(key: string) {
    return this.items.has(key) ? this.items.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  clear() {
    this.items.clear();
  }
  keys() {
    return [...this.items.keys()].sort();
  }
}

const local = new MemoryStore();
const session = new MemoryStore();
Object.assign(globalThis, { localStorage: local, sessionStorage: session });

const { clearSignOutState, clearLocalAccountState, SIGN_OUT_LOCAL_STORAGE_KEYS, ACCOUNT_LOCAL_STORAGE_KEYS } = await import('../src/auth/localAccountState');
const { saveDreamDraft, takeDreamDraft } = await import('../src/hero/dreamDraft');
const { cacheReflectionText, getCachedReflectionText, clearTranslationMemory } = await import('../src/archive/dreamTitleTranslation');

const read = (p: string) => readFileSync(p, 'utf8');

/** A browser with everything DARE may keep: the temporary dream data, the legacy local dreams, and the device settings. */
function fillBrowser() {
  local.clear();
  session.clear();
  local.setItem('dare.dreamDraft.v1', JSON.stringify({ text: 'החלום של א', savedAt: Date.now() }));
  local.setItem('dare.pendingDreamSave.v1', '{"dream":"of A"}');
  local.setItem('dare.savedDreams.v1', '[{"id":"legacy"}]');
  local.setItem('dare.localDreamMigration.v1', '{"user-a":"imported"}');
  local.setItem('dare-language', 'he');
  local.setItem('dare-a11y-settings', '{}');
  local.setItem('dare.liveWordsOff.v1', '{}');
  session.setItem('dare.analysisSubmission.v1', '{"key":"k","textHash":"h","savedAt":1}');
  session.setItem('dare.archiveTranslations.v2', '{"title|en|חלום":"Dream"}');
}

test('signing out removes the temporary dream data and keeps the device settings and the dreams kept here from before accounts', () => {
  fillBrowser();
  clearSignOutState(local, session);
  assert.deepEqual(local.keys(), ['dare-a11y-settings', 'dare-language', 'dare.liveWordsOff.v1', 'dare.localDreamMigration.v1', 'dare.savedDreams.v1']);
  assert.deepEqual(session.keys(), [], 'the submission record and the translations are gone');
  assert.deepEqual([...SIGN_OUT_LOCAL_STORAGE_KEYS].sort(), ['dare.dreamDraft.v1', 'dare.pendingDreamSave.v1']);
});

test('deleting the account still removes every DARE key that can hold account or dream content', () => {
  fillBrowser();
  clearLocalAccountState(local, session);
  assert.deepEqual(local.keys(), ['dare-a11y-settings', 'dare-language', 'dare.liveWordsOff.v1']);
  assert.deepEqual(session.keys(), []);
  assert.equal(ACCOUNT_LOCAL_STORAGE_KEYS.length, 4);
  // deletion reloads the page, which also empties every memory cache
  assert.match(read('src/auth/deleteAccount.ts'), /clearLocalAccountState\(\);[\s\S]*clearAllOpenJourneys\(\);[\s\S]*window\.location\.replace\('\/'\)/);
});

test('switching accounts in the same browser: the next account gets none of the previous account\'s draft', () => {
  fillBrowser();
  saveDreamDraft('חלמתי על בית ישן');
  clearSignOutState(local, session);
  assert.equal(takeDreamDraft(), null, 'account B finds no draft of account A');
  // signing in again is unaffected: a new draft works as before
  saveDreamDraft('חלום חדש');
  assert.equal(takeDreamDraft(), 'חלום חדש');
});

test('the translations held in memory are forgotten too, and never written back for the next account', () => {
  fillBrowser();
  cacheReflectionText('הפרשנות של א', 'en', "A's reflection");
  assert.equal(getCachedReflectionText('הפרשנות של א', 'en'), "A's reflection");
  clearSignOutState(local, session);
  clearTranslationMemory();
  assert.equal(getCachedReflectionText('הפרשנות של א', 'en'), null);
  // account B's first translation is stored alone: A's text is not copied back into the tab's storage
  cacheReflectionText('הפרשנות של ב', 'en', "B's reflection");
  const stored = session.getItem('dare.archiveTranslations.v2') ?? '';
  assert.doesNotMatch(stored, /הפרשנות של א|A's reflection/);
  assert.match(stored, /B's reflection/);
});

test('the sign-out she chooses clears all of it before the session ends; a session that merely ended keeps the draft for her', () => {
  const auth = read('src/auth/AuthContext.tsx');
  const signOut = auth.match(/async signOut\(\) \{([\s\S]*?)\n {6}\},/)?.[1] ?? '';
  assert.match(signOut, /await clearAllOpenJourneys\(\);\s*[\s\S]*?clearSignOutState\(\);\s*clearTranslationMemory\(\);\s*await supabase\.auth\.signOut\(\{ scope: 'local' \}\);/);
  // nothing in sign-out reaches the account itself: its dreams, conversations, credits and purchases stay on the server untouched
  assert.doesNotMatch(signOut, /\.from\(|\.rpc\(|fetch\(|delete/i);
  // an expired or revoked session (SIGNED_OUT without her choosing it) clears only the unfinished journeys, as before: the draft
  // saved so she can continue after signing in again is kept
  const signedOut = auth.match(/if \(event === 'SIGNED_OUT'\) \{([\s\S]*?)\}/)?.[1] ?? '';
  assert.match(signedOut, /clearAllOpenJourneys\(\)/);
  assert.doesNotMatch(signedOut, /clearSignOutState|clearLocalAccountState/);
});

test('the privacy policy says exactly what signing out removes and keeps (HE and EN, approved 2026-10-29)', () => {
  const privacy = read('src/legal/privacyContent.ts');
  assert.match(privacy, /When you sign out, the dream draft, a dream waiting to be saved, an unfinished dream journey and the tab's temporary storage are removed from the device\. The dreams, conversations, credits and purchases in your account stay in your account and are not deleted when you sign out\. Dreams you saved on this device before an account existed stay on it until you delete your account or clear the browser's data\./);
  assert.match(privacy, /ביציאה מהחשבון נמחקים מהמכשיר טיוטת החלום, חלום שממתין לשמירה, מסע חלום שלא הסתיים והאחסון הזמני של הלשונית\. החלומות, השיחות, הקרדיטים והרכישות שבחשבון נשארים בחשבון ואינם נמחקים ביציאה\. חלומות ששמרתם במכשיר לפני שהיה חשבון נשארים בו עד מחיקת החשבון או מחיקת נתוני הדפדפן\./);
  assert.match(privacy, /An unfinished dream journey \(IndexedDB\): [^\\]*for up to 7 days\./);
  assert.match(privacy, /מסע חלום שלא הסתיים \(IndexedDB\): [^\\]*עד 7 ימים\./);
  // the old promise is gone: saved dreams are not removed at sign-out
  assert.doesNotMatch(privacy, /the saved dreams, the draft and the account's temporary storage|נמחקים מהמכשיר החלומות השמורים/);
  // and it matches the code: the 7 days, and the legacy dreams that stay
  assert.match(read('src/hero/openJourneyStore.ts'), /OPEN_JOURNEY_TTL_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.ok(!(SIGN_OUT_LOCAL_STORAGE_KEYS as readonly string[]).includes('dare.savedDreams.v1'));
});

test('signing in again and another account: the archive shows only the signed-in account\'s own dreams, read from the server', () => {
  const archive = read('src/archive/DreamArchive.tsx');
  assert.match(archive, /if \(!user\) \{\s*setDreams\(\[\]\);/, 'signed out: the loaded dreams are dropped at once');
  assert.match(archive, /getDreamsRemote\(user\.id\)/, 'signed in: the account\'s own dreams, from the server');
  // the offer to import the dreams kept here from before accounts is per account, so a second account is asked on its own
  assert.match(read('src/hero/dreamStorage.ts'), /export function getMigrationStatus\(userId: string\)/);
});
