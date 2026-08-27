/**
 * POST /api/candidates/parse-cv
 * Uses Gemini AI to intelligently extract structured data from a CV/resume.
 * Works with ATS CVs, standard CVs, LinkedIn exports, EU-style CVs — anything.
 * Falls back to heuristic parsing if Gemini is not configured.
 */
import { NextResponse } from 'next/server.js';

/**
 * Heuristic CV Parser — robust fallback that works without AI.
 * Much more thorough than the old client-side version.
 */
function heuristicParse(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const lower = text.toLowerCase();

  // ── EMAIL ──────────────────────────────────────────────────────────────────
  const emailMatch = text.match(/[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,7}/);
  const email = emailMatch ? emailMatch[0] : '';

  // ── PHONE ──────────────────────────────────────────────────────────────────
  const phoneMatch = text.match(
    /(?:\+\d{1,3}[\s\-]?)?(?:\(?\d{2,4}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{3,4}[\s\-]?\d{0,4}/
  );
  const phone = phoneMatch ? phoneMatch[0].trim().replace(/[\s\-]{2,}/g, ' ') : '';

  // ── NAME ───────────────────────────────────────────────────────────────────
  // Strategy: first non-email, non-phone, non-URL line that looks like a name
  let firstName = '', lastName = '';
  const nameBlockedWords = /^(address|phone|email|tel|mobile|linkedin|github|profile|summary|skills?|experience|education|contact|objective|references?|curriculum|vitae|resume|cv$)/i;
  const urlPattern = /https?:\/\/|www\.|\.com|\.ie|\.uk|linkedin\.com|github\.com/i;

  for (const line of lines.slice(0, 10)) {
    if (emailMatch && line.includes(emailMatch[0])) continue;
    if (urlPattern.test(line)) continue;
    if (nameBlockedWords.test(line)) continue;
    if (line.length > 60) continue; // Too long to be a name
    // Clean line of common title suffixes like "— AI Engineer" or "| Developer"
    const cleanLine = line
      .replace(/\s*(?:[—–\-|@]|at)\s*(?:engineer|developer|scientist|manager|director|analyst|lead|consultant|architect|specialist|student|intern|resume|cv)\b.*/i, '')
      .trim();

    if (cleanLine.length < 3 || cleanLine.length > 50) continue;

    // Try explicit "Name:" pattern first
    const namedMatch = cleanLine.match(/^(?:name|full\s*name)\s*[:\-]\s*(.+)/i);
    if (namedMatch) {
      const parts = namedMatch[1].trim().split(/\s+/);
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
      break;
    }

    // "First Last" or "First Middle Last" with optional title (case-insensitive)
    const nameMatch = cleanLine.match(
      /^(?:(?:Mr|Ms|Mrs|Dr|Prof|Engr)\.?\s+)?([A-ZÀ-Öa-z'\-]+)\s+([A-ZÀ-Öa-z'\-]+(?:\s+[A-ZÀ-Öa-z'\-]+)?)$/i
    );
    if (nameMatch) {
      firstName = nameMatch[1];
      lastName = nameMatch[2];
      break;
    }

    // "Last, First" (some CVs, case-insensitive)
    const lastFirstMatch = cleanLine.match(/^([A-ZÀ-Öa-z'\-]+),\s+([A-ZÀ-Öa-z '\-]+)$/i);
    if (lastFirstMatch) {
      lastName = lastFirstMatch[1];
      firstName = lastFirstMatch[2];
      break;
    }
  }

  // ── LOCATION ───────────────────────────────────────────────────────────────
  let city = '', country = '', postal = '';
  const ukPostcode = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2})\b/i);
  const eircode = text.match(/\b([A-Z]\d{2}\s?[A-Z0-9]{4})\b/i);
  postal = (ukPostcode && ukPostcode[1]) || (eircode && eircode[1]) || '';

  // Location patterns: "City, Country" or "Location: City"
  const locPatterns = [
    /(?:location|address|based in|residing in|city)[:\s]+([A-Za-z\s,]+?)(?:\n|$|\|)/i,
    /([A-Za-z ]+),\s*((?:United Kingdom|UK|England|Scotland|Wales|Ireland|Northern Ireland|London|Manchester|Dublin|Cork|Belfast|Birmingham|Leeds|Glasgow|Edinburgh|Liverpool|Bristol))/i,
  ];
  for (const re of locPatterns) {
    const m = text.match(re);
    if (m) {
      const parts = (m[1] + (m[2] ? ', ' + m[2] : '')).split(',').map(s => s.trim()).filter(Boolean);
      city = parts[0] || '';
      country = parts[1] || '';
      break;
    }
  }

  // ── PROFESSIONAL SUMMARY ───────────────────────────────────────────────────
  let summary = '';
  const summaryMatch = text.match(
    /(?:(?:professional\s+)?summary|profile|objective|about\s*(?:me)?)\s*[:\n]+\s*([\s\S]{40,600}?)(?:\n(?:[A-Z][A-Z\s]{2,}\n|education|experience|skills|work|qualifications|certifications))/i
  );
  if (summaryMatch) {
    summary = summaryMatch[1].replace(/\s+/g, ' ').trim().slice(0, 500);
  }

  // ── WORK EXPERIENCE ────────────────────────────────────────────────────────
  const experiences = [];
  const dateRangeRe = /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)?\.?\s*(?:19|20)\d{2})\s*(?:–|-|—|to|until)\s*((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)?\.?\s*(?:(?:19|20)\d{2}|present|current|now|date))/gi;

  const jobTitleWords = /engineer|developer|manager|director|analyst|consultant|lead|specialist|architect|scientist|researcher|officer|executive|coordinator|designer|administrator|assistant|associate|principal|senior|junior|head|vp|president|cto|ceo|coo|founder|co-founder/i;
  const companyWords = /ltd|limited|plc|inc|corp|gmbh|llc|llp|group|solutions|systems|technologies|tech|digital|labs|studio|services|consulting|co\.|bank|finance|capital|ventures|innovations|global/i;
  const sectionHeaderRe = /^(?:experience|employment|career|education|skills|certifications?|references|publications?|projects?|achievements?|awards?|summary|profile|objective|languages?|interests?)$/i;

  // Find experience section boundaries
  let expStart = 0, expEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^(?:work\s+)?experience|employment\s+history|career\s+history|professional\s+experience/i.test(lines[i]) && lines[i].length < 60) {
      expStart = i + 1;
    }
    if (expStart > 0 && i > expStart && /^(?:education|skills|certifications?|references|publications?|projects?|achievements?|awards?)/i.test(lines[i]) && lines[i].length < 60) {
      expEnd = i;
      break;
    }
  }

  // Scan exp section for date-range lines
  const seenStartDates = new Set();
  for (let i = expStart; i < expEnd && experiences.length < 4; i++) {
    const line = lines[i];
    if (sectionHeaderRe.test(line.trim())) continue;
    dateRangeRe.lastIndex = 0;
    const dm = dateRangeRe.exec(line);
    if (!dm) continue;

    const rangeParts = dm[0].split(/\s*(?:–|-|—|to|until)\s*/i);
    const startDate = (rangeParts[0] || '').trim();
    const endRaw = (rangeParts[1] || '').trim();
    const isCurrent = /present|current|now|date/i.test(endRaw);
    if (seenStartDates.has(startDate)) continue;
    seenStartDates.add(startDate);

    // Look for title/company in the lines BEFORE this date line
    let title = '', employer = '';
    for (let j = Math.max(expStart, i - 4); j < i; j++) {
      const nearby = lines[j];
      if (!nearby || nearby.length < 3 || nearby.length > 120) continue;
      if (sectionHeaderRe.test(nearby.trim())) continue;
      if (/^[-–•*\d]/.test(nearby)) continue; // bullet points / numbers

      const pipe = nearby.split(/\s*[\|@]\s*/);
      if (pipe.length >= 2 && jobTitleWords.test(pipe[0])) {
        title = pipe[0].trim().slice(0, 80);
        employer = pipe[1].trim().slice(0, 80);
        break;
      }
      if (!title && jobTitleWords.test(nearby)) title = nearby.replace(/,.*/, '').trim().slice(0, 80);
      else if (!employer && companyWords.test(nearby)) employer = nearby.replace(/,.*/, '').trim().slice(0, 80);
    }

    experiences.push({ title, employer, startDate, endDate: isCurrent ? '' : endRaw, current: isCurrent });
  }

  // Fallback: scan entire document if no exp section or nothing found
  if (experiences.length === 0) {
    for (let i = 0; i < lines.length && experiences.length < 4; i++) {
      const line = lines[i];
      if (sectionHeaderRe.test(line.trim())) continue;
      dateRangeRe.lastIndex = 0;
      const dm = dateRangeRe.exec(line);
      if (!dm) continue;
      const rangeParts = dm[0].split(/\s*(?:–|-|—|to|until)\s*/i);
      const startDate = (rangeParts[0] || '').trim();
      const endRaw = (rangeParts[1] || '').trim();
      const isCurrent = /present|current/i.test(endRaw);
      if (seenStartDates.has(startDate)) continue;
      seenStartDates.add(startDate);
      const prevLine = lines[i - 1] || '';
      const pipe = prevLine.split(/\s*[\|@]\s*/);
      experiences.push({
        title: pipe.length >= 2 && jobTitleWords.test(pipe[0]) ? pipe[0].trim() : (jobTitleWords.test(prevLine) ? prevLine.trim() : ''),
        employer: pipe.length >= 2 ? pipe[1].trim() : (companyWords.test(prevLine) ? prevLine.trim() : ''),
        startDate, endDate: isCurrent ? '' : endRaw, current: isCurrent
      });
    }
  }


  // ── EDUCATION ──────────────────────────────────────────────────────────────
  const education = [];
  const degreeMap = [
    { re: /\b(?:PhD|DPhil|Doctorate|D\.Phil)\b/i, level: 4, label: "Doctorate (PhD)" },
    { re: /\b(?:MSc|MRes|MEng|MA\b|MBA|M\.Sc|Masters?'?s?|Postgraduate\s+(?:Certificate|Diploma|MSc))\b/i, level: 2, label: "Master's Degree" },
    { re: /\bPostgraduate\s+(?:Diploma|Cert)/i, level: 3, label: "Postgraduate Diploma" },
    { re: /\b(?:BSc|BEng|BA\b|BBA|B\.Sc|Bachelors?'?s?|Undergraduate|Hons)\b/i, level: 1, label: "Bachelor's Degree" },
    { re: /\b(?:HND|HNC|Foundation\s+Degree|BTEC|Diploma)\b/i, level: 0, label: "Diploma / HND" },
    { re: /\b(?:A[- ]Levels?|Leaving\s+Certificate|A-Level|AS[- ]Level)\b/i, level: 0, label: "A-Levels / Leaving Cert" },
    { re: /\b(?:GCSE|Junior\s+Certificate|Secondary\s+School)\b/i, level: 0, label: "GCSE / Junior Cert" },
  ];

  const uniWords = /university|college|institute|school|academy|polytechnic|faculty/i;

  for (let i = 0; i < lines.length && education.length < 4; i++) {
    const line = lines[i];
    const degHit = degreeMap.find(d => d.re.test(line));
    if (degHit) {
      const surroundingText = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 4)).join(' ');
      const yearMatch = surroundingText.match(/\b((?:19|20)\d{2})\b.*?\b((?:19|20)\d{2}|present|current)?\b/i);
      let institution = '';
      for (let j = i - 2; j <= i + 3; j++) {
        if (j < 0 || j >= lines.length || j === i) continue;
        if (uniWords.test(lines[j]) && lines[j].length < 80) { institution = lines[j].replace(/\s*[|·•]\s*.*/,'').trim(); break; }
      }
      const fieldClean = line
        .replace(degHit.re, '').replace(/\bin\b|\bof\b|\bat\b|\bfrom\b/gi, '')
        .replace(/,\s*\d{4}.*/,'').replace(/\s+/g,' ').trim().slice(0, 80);

      education.push({
        level: degHit.level,
        levelLabel: degHit.label,
        field: fieldClean,
        institution,
        startDate: yearMatch ? yearMatch[1] : '',
        endDate: yearMatch && yearMatch[2] && !/present|current/i.test(yearMatch[2]) ? yearMatch[2] : '',
        current: yearMatch && /present|current/i.test(yearMatch[2] || '')
      });
    }
  }

  // ── SKILLS ────────────────────────────────────────────────────────────────
  // 1. Match known tech skill bank
  const KNOWN_SKILLS = [
    'python','pytorch','tensorflow','keras','scikit-learn','pandas','numpy','matplotlib',
    'langchain','langgraph','llm','gpt-4','claude','gemini','openai','anthropic',
    'rag','retrieval augmented generation','vector database','embeddings','fine-tuning',
    'prompt engineering','agentic','agentic workflows','agentic systems','tool use',
    'transformers','hugging face','bert','nlp','natural language processing',
    'reinforcement learning','rlhf','machine learning','deep learning','neural networks',
    'pinecone','weaviate','chroma','qdrant','faiss','milvus','redis','elasticsearch',
    'sql','postgresql','mysql','mongodb','sqlite','neo4j','dynamodb',
    'aws','azure','gcp','google cloud','docker','kubernetes','terraform','ci/cd',
    'git','github','gitlab','bitbucket','linux','bash','shell scripting',
    'react','node.js','javascript','typescript','html','css','next.js',
    'rest api','graphql','fastapi','django','flask','spring boot',
    'java','c++','c#','go','golang','rust','scala','r','matlab',
    'data analysis','data science','data engineering','etl','spark','hadoop','kafka',
    'computer vision','image recognition','object detection','yolo','opencv',
    'agile','scrum','kanban','jira','confluence','product management',
    'communication','leadership','problem solving','teamwork','project management'
  ];

  const foundSkills = KNOWN_SKILLS.filter(s => lower.includes(s));

  // 2. Extract from Skills section heuristically
  const skillsSectionMatch = text.match(/(?:skills?|technical\s+skills?|core\s+competencies?|expertise)\s*[:\n]+\s*([\s\S]{10,600}?)(?:\n(?:[A-Z][A-Z\s]{2,}\n|experience|education|work|employment|certifications?))/i);
  const extraSkills = [];
  if (skillsSectionMatch) {
    const skillText = skillsSectionMatch[1];
    skillText.split(/[,|•\n\/]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 40 && /[a-zA-Z]/.test(s)).forEach(s => {
      const cleaned = s.replace(/^[-–•*]\s*/, '').trim();
      if (cleaned && !foundSkills.includes(cleaned.toLowerCase())) extraSkills.push(cleaned);
    });
  }

  // 3. Look for any "Technologies:", "Tools:", "Languages:" etc.
  const toolsMatch = text.match(/(?:tools?|technologies|languages?|frameworks?|platforms?|software)\s*[:\-]\s*([^\n]{5,200})/gi);
  if (toolsMatch) {
    toolsMatch.forEach(m => {
      const content = m.replace(/^[^:]+:\s*/, '');
      content.split(/[,|•\/]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 40).forEach(s => {
        if (s && !foundSkills.includes(s.toLowerCase()) && !extraSkills.map(e=>e.toLowerCase()).includes(s.toLowerCase())) {
          extraSkills.push(s);
        }
      });
    });
  }

  const allSkills = [...foundSkills, ...extraSkills.slice(0, 20)];

  // ── CERTIFICATIONS ────────────────────────────────────────────────────────
  const certifications = [];
  const certRe = /(?:certif(?:ied|icate|ication)|cert\.|accreditat(?:ed|ion)|aws\s+certified|azure\s+certified|google\s+certified|microsoft\s+certified|professional\s+certificate)/i;
  lines.forEach(line => {
    if (/^certifications?$/i.test(line.trim())) return; // skip section header
    if (certRe.test(line) && line.length < 150 && line.length > 8) {
      certifications.push(line.replace(/^[-\u2013\u2014\u2022*]\s*/, '').trim());
    }
  });

  // ── LINKEDIN / GITHUB ─────────────────────────────────────────────────────
  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w\-]+/i);
  const githubMatch = text.match(/github\.com\/[\w\-]+/i);

  return {
    email, phone, firstName, lastName,
    city, country, postal,
    summary,
    experiences: experiences.slice(0, 4),
    education: education.slice(0, 4),
    skills: allSkills,
    certifications: certifications.slice(0, 10),
    linkedin: linkedinMatch ? 'https://' + linkedinMatch[0] : '',
    github: githubMatch ? 'https://' + githubMatch[0] : '',
    method: 'heuristic',
  };
}

// ── Gemini AI-powered parsing ─────────────────────────────────────────────────
async function geminiParse(cvText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are an expert CV/Resume parser. Extract ALL structured information from the following CV text and return ONLY valid JSON. Be thorough and handle any format: ATS CVs, LinkedIn exports, EU/Europass CVs, traditional CVs, functional CVs.

Return exactly this JSON structure (use empty strings/arrays if not found):
{
  "firstName": "",
  "lastName": "",
  "email": "",
  "phone": "",
  "city": "",
  "country": "",
  "postal": "",
  "linkedin": "",
  "github": "",
  "summary": "",
  "experiences": [
    { "title": "", "employer": "", "startDate": "", "endDate": "", "current": false, "description": "" }
  ],
  "education": [
    { "level": 1, "levelLabel": "", "field": "", "institution": "", "startDate": "", "endDate": "", "current": false }
  ],
  "skills": [],
  "certifications": [],
  "languages": []
}

Level values: 0=A-Level/Leaving Cert, 1=Bachelor's, 2=Master's, 3=Postgrad Diploma, 4=PhD

CV TEXT:
${cvText.slice(0, 6000)}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048, responseMimeType: 'application/json' }
        })
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textOutput) return null;

    // Clean markdown code fences if present
    const cleaned = textOutput.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    parsed.method = 'gemini-ai';
    return parsed;
  } catch (e) {
    console.error('[PARSE-CV GEMINI ERROR]', e.message);
    return null;
  }
}

export async function POST(req) {
  try {
    const { cvText } = await req.json();

    if (!cvText || cvText.trim().length < 30) {
      return NextResponse.json({ ok: false, error: 'CV text is too short to parse.' }, { status: 400 });
    }

    // Try Gemini first, fallback to heuristic
    const geminiResult = await geminiParse(cvText);
    const result = geminiResult || heuristicParse(cvText);

    return NextResponse.json({ ok: true, parsed: result, method: result.method });
  } catch (err) {
    console.error('[PARSE-CV ERROR]', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
