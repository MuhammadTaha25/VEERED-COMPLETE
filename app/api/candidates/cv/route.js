/**
 * POST /api/candidates/cv
 * Accepts multipart/form-data or JSON containing CV file and text.
 * Stores CV file in /uploads locally.
 * Performs ATS keyword matching score per architecture-spec.md & upload-cv.html.
 * Gate: score >= 80 to pass.
 */
import { NextResponse } from 'next/server.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { getSession } from '../../../../lib/auth/index.js';
import { dbRun, dbGet } from '../../../../lib/db/index.js';
// pdf-parse and mammoth are loaded dynamically at runtime to avoid Next.js bundling issues

const __filename = fileURLToPath(import.meta.url);
const __dir = path.dirname(__filename);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dir, '..', '..', '..', '..', 'uploads');

// Best-effort local scratch dir for the raw upload (the parsed text is what we
// persist to the DB — a read-only / ephemeral filesystem is fine).
try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch { /* ignore */ }

// Standard technical skill keyword bank (from upload-cv.html & architecture-spec.md)
const DEFAULT_SKILLS = [
  'python', 'pytorch', 'langchain', 'prompt engineering', 'rag',
  'agentic', 'vector database', 'embeddings', 'fine-tuning', 'llm',
  'gpt-4', 'claude', 'transformers', 'hugging face', 'bert',
  'nlp', 'reinforcement learning', 'rlhf', 'langgraph', 'vector search',
  'pinecone', 'weaviate', 'chroma', 'qdrant', 'scikit-learn',
  'pandas', 'numpy', 'tensorflow'
];

/**
 * Calculate ATS Keyword Match Score
 * Formula: Math.round((matched.length / required.length) * 100)
 */
export function calculateAtsScore(cvText, customJdText, customRequiredSkills) {
  const normalizedCv = (cvText || '').toLowerCase();
  
  let required = [];
  if (Array.isArray(customRequiredSkills) && customRequiredSkills.length > 0) {
    required = customRequiredSkills.map(s => s.toLowerCase());
  } else if (customJdText && customJdText.trim().length > 0) {
    const normalizedJd = customJdText.toLowerCase();
    required = DEFAULT_SKILLS.filter(s => normalizedJd.includes(s));
    if (required.length === 0) {
      // Default to first 20 skills if JD mentions none from default list
      required = DEFAULT_SKILLS.slice(0, 20);
    }
  } else {
    // Default 20 required skills for Senior AI/ML Engineer spec
    required = DEFAULT_SKILLS.slice(0, 20);
  }

  const matched = required.filter(skill => normalizedCv.includes(skill.toLowerCase()));
  const missing = required.filter(skill => !normalizedCv.includes(skill.toLowerCase()));
  
  const score = required.length > 0 ? Math.round((matched.length / required.length) * 100) : 0;
  const passed = score >= 80;

  return {
    score,
    passed,
    totalRequired: required.length,
    matchedCount: matched.length,
    matchedSkills: matched,
    missingSkills: missing,
    requiredSkills: required,
  };
}

export async function POST(req) {
  try {
    const session = await getSession();
    let candidateId = session?.userId;

    let cvText = '';
    let jdText = '';
    let fileName = '';
    let filePath = '';
    let fileBuffer = null;

    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      let formData;
      try {
        formData = await req.formData();
      } catch (e) {
        return NextResponse.json(
          { ok: false, error: 'Corrupted or empty file uploaded.' },
          { status: 400 }
        );
      }
      const file = formData.get('file');
      cvText = (formData.get('cvText') || '').toString();
      jdText = (formData.get('jdText') || '').toString();
      const formCandidateId = formData.get('candidateId');
      if (formCandidateId) candidateId = formCandidateId.toString();

      if (file && typeof file === 'object' && file.name) {
        fileName = file.name;
        const bytes = await file.arrayBuffer();
        fileBuffer = Buffer.from(bytes);

        // Validation 1: Empty file check
        if (fileBuffer.length === 0) {
          return NextResponse.json(
            { ok: false, error: 'Corrupted or empty file uploaded. File size is 0 bytes.' },
            { status: 400 }
          );
        }

        // Validation 2: File size limit check (10 MB)
        if (fileBuffer.length > 10 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, error: 'File size exceeds maximum limit of 10MB.' },
            { status: 400 }
          );
        }

        // Save file to /uploads
        const safeName = `${uuidv4()}-${fileName.replace(/[^\w.\-]/g, '_')}`;
        filePath = path.join(UPLOAD_DIR, safeName);
        try { fs.writeFileSync(filePath, fileBuffer); } catch { filePath = null; }

        // ALWAYS parse the uploaded file — never use stale cvText from a previous upload
        const lowerName = fileName.toLowerCase();
          if (lowerName.endsWith('.pdf')) {
            try {
              const { PDFParse } = await import('pdf-parse');
              const parser = new PDFParse({ data: fileBuffer });
              const textResult = await parser.getText();
              cvText = textResult.text;
              await parser.destroy();
            } catch (err) {
              console.error('PDF parsing error:', err);
              cvText = '';
            }
        } else if (lowerName.endsWith('.docx')) {
          try {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            cvText = result.value;
          } catch (err) {
            console.error('DOCX parsing error:', err);
            cvText = '';
          }
        } else if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
          cvText = fileBuffer.toString('utf-8');
        } else {
          cvText = fileBuffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
        }
      }
    } else {
      // JSON payload
      const body = await req.json();
      cvText = body.cvText || '';
      jdText = body.jdText || '';
      if (body.candidateId) candidateId = body.candidateId;
    }

    // Validation 3: Check if empty CV text provided
    if (!cvText || cvText.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'CV content is empty or unreadable. Please upload a valid text/CV file or paste text.' },
        { status: 400 }
      );
    }

    // Compute ATS Score using exact formula
    const matchResult = calculateAtsScore(cvText, jdText);

    // Save application to database if candidateId is known
    let applicationId = uuidv4();
    if (candidateId) {
      const existingCand = await dbGet('SELECT id FROM candidates WHERE id = ?', [candidateId]);
      if (existingCand) {
        await dbRun(
          `INSERT INTO applications (id, candidate_id, cv_file_path, cv_parsed_text, ats_score, ats_passed, status)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            applicationId,
            candidateId,
            filePath || null,
            cvText.slice(0, 5000), // snippet/summary
            matchResult.score,
            matchResult.passed ? 1 : 0,
            matchResult.passed ? 'ats_passed' : 'ats_failed'
          ]
        );
      }
    }

    return NextResponse.json({
      ok: true,
      candidateId: candidateId || null,
      applicationId,
      fileName,
      filePath: filePath ? `/uploads/${path.basename(filePath)}` : null,
      ats: matchResult,
      cvText: cvText,
    });

  } catch (err) {
    console.error('[CANDIDATE CV API ERROR]', err);
    return NextResponse.json(
      { ok: false, error: `Internal server error: ${err.message}` },
      { status: 500 }
    );
  }
}
