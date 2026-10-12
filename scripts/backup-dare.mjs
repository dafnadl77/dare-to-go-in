// DARE TO GO IN - private backup of the live database tables, the account list and ALL image files.
//
// Why this exists: Git is not a backup of the database or the pictures, Supabase's own daily backups are a paid-plan feature, and a database
// backup never contains Storage files. This script copies everything to a folder on YOUR computer, for free.
//
//   PowerShell (the key lives only in this window, never in a file and never in Git):
//     $env:SUPABASE_SERVICE_ROLE_KEY = "<the service_role key from Supabase > Project Settings > API>"
//     node --env-file=.env scripts/backup-dare.mjs "C:\Users\<you>\DARE-backups\2026-10-12"
//
// The output holds personal data and password hashes. Keep it private: never commit it, never put it in a shared or public folder.
// It only READS: it changes nothing in Supabase.
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outDir = process.argv[2] ? resolve(process.argv[2]) : '';
if (!url || !key || !outDir) {
  console.error('Missing input. Needs VITE_SUPABASE_URL (from .env), SUPABASE_SERVICE_ROLE_KEY (set in this window) and an output folder.');
  process.exit(1);
}
if (/[\\/]dare-to-go-in[\\/]|[\\/]DARE TO GO IN[\\/]/i.test(outDir + '/')) {
  console.error('Refusing to write the backup inside the project folder (it could end up in Git). Choose a folder outside it.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const TABLES = ['dreams', 'pattern_reflections', 'dream_attempts', 'dream_credits', 'credit_ledger', 'payment_orders', 'trial_identities', 'free_dream_decisions', 'app_owners', 'app_owner_audit'];
const BUCKET = 'dream-images';
const PAGE = 500;
const manifest = { taken_at: new Date().toISOString(), tables: {}, auth_users: 0, storage: { files: 0, bytes: 0, failed: [] } };
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function save(relative, buffer) {
  const target = join(outDir, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, buffer);
  return sha(buffer);
}

async function exportTable(name) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(name).select('*').order('created_at', { ascending: true, nullsFirst: true }).range(from, from + PAGE - 1);
    if (error) {
      // a few tables have no created_at: read them without an order
      const retry = await db.from(name).select('*').range(from, from + PAGE - 1);
      if (retry.error) throw new Error(`${name}: ${retry.error.message}`);
      rows.push(...retry.data);
      if (retry.data.length < PAGE) break;
      continue;
    }
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  manifest.tables[name] = { rows: rows.length, sha256: await save(`tables/${name}.json`, Buffer.from(JSON.stringify(rows))) };
  console.log(`table ${name}: ${rows.length}`);
}

async function exportUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`auth users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  manifest.auth_users = users.length;
  await save('auth/users.json', Buffer.from(JSON.stringify(users)));
  console.log(`auth users: ${users.length}`);
}

async function listObjects(prefix = '') {
  const files = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`storage list ${prefix}: ${error.message}`);
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) files.push({ path, size: entry.metadata?.size ?? null });
      else files.push(...(await listObjects(path)));
    }
    if (data.length < PAGE) break;
  }
  return files;
}

async function exportImages() {
  const files = await listObjects();
  for (const file of files) {
    const { data, error } = await db.storage.from(BUCKET).download(file.path);
    if (error || !data) {
      manifest.storage.failed.push(file.path);
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    if (file.size !== null && Number(file.size) !== buffer.length) manifest.storage.failed.push(`${file.path} (size differs)`);
    await save(`storage/${BUCKET}/${file.path}`, buffer);
    manifest.storage.files += 1;
    manifest.storage.bytes += buffer.length;
  }
  console.log(`images: ${manifest.storage.files} files, ${manifest.storage.bytes} bytes, ${manifest.storage.failed.length} problems`);
}

try {
  for (const table of TABLES) await exportTable(table);
  await exportUsers();
  await exportImages();
  await save('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
  if (manifest.storage.failed.length) {
    console.error('SOME FILES COULD NOT BE COPIED:', manifest.storage.failed);
    process.exit(2);
  }
  console.log(`Done. Backup folder: ${outDir}`);
} catch (error) {
  console.error('Backup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
