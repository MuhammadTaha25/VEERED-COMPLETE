/**
 * GET /api/admin/video/[id]
 * Admin-only. Redirects to a short-lived Supabase Storage signed URL for the
 * recording. `?dl=1` forces a download (attachment) with a friendly filename;
 * otherwise the URL streams inline for the <video> player (range/seek supported
 * by Supabase Storage).
 */
import { requireAdmin } from '../../../../../lib/auth/index.js';
import { dbGet } from '../../../../../lib/db/index.js';
import { signedVideoUrl } from '../../../../../lib/storage/index.js';

export async function GET(req, { params }) {
  const admin = await requireAdmin();
  if (!admin) {
    return new Response(JSON.stringify({ ok: false, error: 'Admin authentication required.' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const wantsDownload = url.searchParams.get('dl') === '1';

  const rec = await dbGet('SELECT * FROM interview_recordings WHERE id = ?', [id]);
  if (!rec) return new Response('Not found', { status: 404 });

  const cand = await dbGet('SELECT first_name, last_name FROM candidates WHERE id = ?', [rec.candidate_id]);
  const safeName = `${(cand?.first_name || 'candidate')}_${(cand?.last_name || '')}`.replace(/[^a-zA-Z0-9_-]/g, '') || 'candidate';
  const downloadName = `${safeName}_stage3_interview_${String(rec.id).slice(0, 8)}.webm`;

  try {
    const signed = await signedVideoUrl(rec.file_path, wantsDownload ? downloadName : undefined);
    return Response.redirect(signed, 302);
  } catch (err) {
    console.error('[ADMIN VIDEO ERROR]', err);
    return new Response('Video unavailable', { status: 404 });
  }
}
