import { getSupabaseServiceClient } from './supabaseServiceClient.js';
import type { AccountDeletionDeps } from './accountDeletion.js';

export const DREAM_IMAGES_BUCKET = 'dream-images';
const PAGE = 100;
const MAX_PAGES = 200;

/** The slice of the Supabase Storage client this needs: injectable so the purge is testable. */
export interface StorageLike {
  storage: {
    from(bucket: string): {
      list(
        folder: string,
        options: { limit: number; offset: number },
      ): PromiseLike<{ data: { id?: string | null; name: string }[] | null; error: unknown }>;
      remove(paths: string[]): PromiseLike<{ error: unknown }>;
    };
  };
}

/** Lists every object path under `<userId>/` (recursing into any sub-folder), or null on a listing error. */
async function listAll(client: StorageLike, userId: string): Promise<string[] | null> {
  const paths: string[] = [];
  const folders: string[] = [userId];
  while (folders.length) {
    const folder = folders.pop() as string;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { data, error } = await client.storage.from(DREAM_IMAGES_BUCKET).list(folder, { limit: PAGE, offset: page * PAGE });
      if (error) return null;
      if (!data || data.length === 0) break;
      for (const entry of data) {
        // A folder placeholder has no id; a real object does.
        if (entry.id === null || entry.id === undefined) folders.push(`${folder}/${entry.name}`);
        else paths.push(`${folder}/${entry.name}`);
      }
      if (data.length < PAGE) break;
    }
  }
  return paths;
}

/**
 * Removes every object in the user's own folder and VERIFIES the folder is then
 * empty. Idempotent (found by folder prefix, not by database rows), so a retry
 * after a partial failure finishes the job. false = something could not be
 * removed or verified; the caller must not treat the deletion as complete.
 */
export async function purgeUserFolder(client: StorageLike, userId: string): Promise<boolean> {
  const before = await listAll(client, userId);
  if (before === null) return false;
  for (let i = 0; i < before.length; i += PAGE) {
    const { error } = await client.storage.from(DREAM_IMAGES_BUCKET).remove(before.slice(i, i + PAGE));
    if (error) return false;
  }
  // Never trust the delete call alone: the folder must now list as empty.
  const after = await listAll(client, userId);
  return after !== null && after.length === 0;
}

async function purge(userId: string): Promise<boolean> {
  const client = getSupabaseServiceClient();
  return client ? purgeUserFolder(client as unknown as StorageLike, userId) : false;
}

/** The real collaborators for performAccountDeletion. Every one uses the service-role client, server-side only. */
export const accountDeletionStore: AccountDeletionDeps = {
  async deleteDatabaseData(userId) {
    const client = getSupabaseServiceClient();
    if (!client) return false;
    const { error } = await client.rpc('delete_account_data', { p_user: userId });
    return !error;
  },
  purgeStorage: purge,
  async verifyDatabaseClean(userId) {
    const client = getSupabaseServiceClient();
    if (!client) return false;
    const { data, error } = await client.rpc('account_data_remaining', { p_user: userId });
    return !error && data === 0;
  },
  async deleteAuthUser(userId) {
    const client = getSupabaseServiceClient();
    if (!client) return false;
    const { error } = await client.auth.admin.deleteUser(userId);
    return !error;
  },
  sweepStorage: purge,
};
