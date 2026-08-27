/**
 * POST /api/stage3/upload-video  (multipart/form-data)
 * Stores the candidate's Stage 3 interview recording (camera + mic) in
 * Supabase Storage and registers it in the interview_recordings table.
 *
 * Fields:
 *  - video: Blob (webm)
 *  - candidateId: string
 *  - durationSeconds: number
 *  - reason: 'completed' | 'timeup' | 'cheating' | 'partial'
 */
import { NextResponse } from 'next/server.js';
import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../../../../lib/auth/index.js';
import { dbGet, dbRun } from '../../../../lib/db/index.js';
import { uploadVideo } from '../../../../lib/storage/index.js';

export async function POST(req) {
  try {
    const session = await getSession();
    const form = await req.formData();
    const file = form.get('video');
    const candidateId = form.get('candidateId') || session?.userId;
    const durationSeconds = parseInt(form.get('durationSeconds') || '0', 10) || 0;
    const reason = String(form.get('reason') || 'completed');

    if (!candidateId) {
      return NextResponse.json({ ok: false, error: 'candidateId is required' }, { status: 400 });
    }
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ ok: false, error: 'video file is required' }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf.length) {
      return NextResponse.json({ ok: false, error: 'empty video file' }, { status: 400 });
    }
    const baseType = String(file.type || 'video/webm').split(';')[0].trim() || 'video/webm';
    const recordingId = uuidv4();
    const safeCand = String(candidateId).replace(/[^a-zA-Z0-9_-]/g, '');
    const ext = baseType === 'video/mp4' ? 'mp4' : 'webm';
    const objectPath = `${safeCand}/${Date.now()}-${recordingId.slice(0, 8)}.${ext}`;

    await uploadVideo(objectPath, buf, baseType);

    await dbRun(
      `INSERT INTO interview_recordings (id, candidate_id, stage, file_path, mime_type, size_bytes, duration_seconds, reason, created_at)
       VALUES (?, ?, 'stage3', ?, ?, ?, ?, ?, now())`,
      [recordingId, candidateId, objectPath, baseType, buf.length, durationSeconds, reason]
    );

    // Link the latest recording to the scorecard
    const sc = await dbGet('SELECT id FROM scorecards WHERE candidate_id = ?', [candidateId]);
    if (sc) {
      await dbRun('UPDATE scorecards SET video_recording_id = ? WHERE candidate_id = ?', [recordingId, candidateId]);
    } else {
      await dbRun(
        `INSERT INTO scorecards (id, candidate_id, video_recording_id, created_at)
         VALUES (?, ?, ?, now())`,
        [uuidv4(), candidateId, recordingId]
      );
    }

    return NextResponse.json({ ok: true, recordingId, sizeBytes: buf.length, durationSeconds, reason });
  } catch (err) {
    console.error('[STAGE 3 UPLOAD VIDEO ERROR]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export const config = { api: { bodyParser: false } };
