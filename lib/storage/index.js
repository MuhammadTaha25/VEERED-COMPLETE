/**
 * Veer — interview video storage (Supabase Storage).
 *
 * Requires env:
 *   SUPABASE_URL                 e.g. https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    Settings → API → service_role (secret)
 *
 * Bucket: "interview-videos" (private).
 */
import { createClient } from '@supabase/supabase-js';

export const VIDEO_BUCKET = 'interview-videos';

let _client = null;

export function storage() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — video storage is unavailable.');
  }
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

/** Upload a Buffer, return the storage path. */
export async function uploadVideo(objectPath, buffer, contentType = 'video/webm') {
  // MediaRecorder emits e.g. "video/webm;codecs=vp9,opus"; Supabase Storage matches
  // the bucket's allowed_mime_types exactly, so strip the codec parameters.
  const baseType = String(contentType || 'video/webm').split(';')[0].trim() || 'video/webm';
  const { error } = await storage()
    .storage.from(VIDEO_BUCKET)
    .upload(objectPath, buffer, { contentType: baseType, upsert: true });
  if (error) throw error;
  return objectPath;
}

/**
 * Create a short-lived signed URL for an object.
 * @param {string} objectPath
 * @param {string} [downloadName] if set, forces a browser download with this filename
 */
export async function signedVideoUrl(objectPath, downloadName) {
  const opts = downloadName ? { download: downloadName } : {};
  const { data, error } = await storage()
    .storage.from(VIDEO_BUCKET)
    .createSignedUrl(objectPath, 60 * 60, opts); // 1 hour
  if (error) throw error;
  return data.signedUrl;
}
