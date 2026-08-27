/**
 * GET /api/admin/video/[id]
 * Admin-only. Streams a Stage 3 interview recording from Supabase Storage,
 * proxied through this origin (so the browser <video> element and download
 * links work without cross-origin redirects). Supports HTTP Range requests.
 * `?dl=1` forces a download with a friendly filename.
 */
import { requireAdmin } from '../../../../../lib/auth/index.js';
import { dbGet } from '../../../../../lib/db/index.js';
import { storage, VIDEO_BUCKET } from '../../../../../lib/storage/index.js';

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
  const mime = rec.mime_type || 'video/webm';
  const disposition = wantsDownload
    ? `attachment; filename="${downloadName}"`
    : `inline; filename="${downloadName}"`;

  try {
    const { data, error } = await storage().storage.from(VIDEO_BUCKET).download(rec.file_path);
    if (error || !data) return new Response('Video unavailable', { status: 404 });

    const full = Buffer.from(await data.arrayBuffer());
    const total = full.length;
    const range = req.headers.get('range');

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : total - 1;
      const chunk = full.subarray(start, end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': mime,
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunk.length),
          'Content-Disposition': disposition,
          'Cache-Control': 'private, max-age=0, no-store',
        },
      });
    }

    return new Response(full, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
        'Content-Disposition': disposition,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (err) {
    console.error('[ADMIN VIDEO ERROR]', err);
    return new Response('Video unavailable', { status: 500 });
  }
}
