/**
 * Veer — interview video storage.
 *
 * Production: Supabase Storage (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 * Local dev without those: falls back to the local filesystem
 *   (lib/db/data/videos/, or VIDEO_DIR), served by /api/admin/video/[id].
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VIDEO_BUCKET = 'interview-videos';

const HAS_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export const usingSupabaseStorage = HAS_SUPABASE;

const __dir = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_DIR = process.env.VIDEO_DIR || path.join(__dir, '..', 'db', 'data', 'videos');

let _client = null;
async function supa() {
  if (_client) return _client;
  const { createClient } = await import('@supabase/supabase-js');
  _client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  return _client;
}
export function storage() { return { storage: { from: () => { throw new Error('Supabase storage not configured'); } } }; }

/** Upload a Buffer; returns the stored object path/key. */
export async function uploadVideo(objectPath, buffer, contentType = 'video/webm') {
  const baseType = String(contentType || 'video/webm').split(';')[0].trim() || 'video/webm';
  if (HAS_SUPABASE) {
    const client = await supa();
    const { error } = await client.storage.from(VIDEO_BUCKET).upload(objectPath, buffer, { contentType: baseType, upsert: true });
    if (error) throw error;
    return objectPath;
  }
  const full = path.join(LOCAL_DIR, objectPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, buffer);
  return objectPath;
}

/**
 * Fetch the raw bytes of a stored recording as a Buffer (used by the admin
 * video route to proxy playback / downloads).
 */
export async function readVideo(objectPath) {
  if (HAS_SUPABASE) {
    const client = await supa();
    const { data, error } = await client.storage.from(VIDEO_BUCKET).download(objectPath);
    if (error || !data) throw error || new Error('not found');
    return Buffer.from(await data.arrayBuffer());
  }
  const full = path.join(LOCAL_DIR, path.normalize(objectPath).replace(/^(\.\.[\/\\])+/, ''));
  if (!fs.existsSync(full)) throw new Error('not found');
  return fs.readFileSync(full);
}
