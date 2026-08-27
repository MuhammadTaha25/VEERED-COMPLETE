/**
 * lib/email/templates.js
 * HTML email templates for all Veer candidate notifications.
 */

const BRAND_COLOR = '#F2680B';
const DARK = '#2b3a4d';

function baseLayout(content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style>
  body { margin: 0; padding: 0; background: #f4f1ee; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
  .wrap { max-width: 600px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(43,58,77,.12); }
  .header { background: ${DARK}; padding: 28px 36px; text-align: center; }
  .header img { height: 40px; }
  .header .brand-name { color: #fff; font-size: 22px; font-weight: 800; letter-spacing: -.3px; margin-top: 8px; }
  .header .brand-name span { color: ${BRAND_COLOR}; }
  .body { padding: 36px; color: #1f2a36; }
  .body h1 { font-size: 24px; margin: 0 0 8px; color: ${DARK}; letter-spacing: -.4px; }
  .body p { font-size: 15px; line-height: 1.6; margin: 0 0 16px; color: #3c4f62; }
  .highlight-box { background: #fff8f3; border: 1.5px solid #f3dcc4; border-left: 4px solid ${BRAND_COLOR}; border-radius: 10px; padding: 16px 18px; margin: 20px 0; }
  .highlight-box p { margin: 0; font-size: 14px; }
  .highlight-box strong { color: ${DARK}; }
  .cta { display: block; margin: 28px auto; text-align: center; }
  .cta a { display: inline-block; background: ${BRAND_COLOR}; color: #fff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 10px; }
  .detail-row { display: flex; gap: 12px; margin-bottom: 10px; font-size: 14px; }
  .detail-label { font-weight: 700; color: ${DARK}; min-width: 130px; }
  .detail-value { color: #4a5568; }
  .divider { border: none; border-top: 1px solid #ece7e1; margin: 24px 0; }
  .footer { background: #f9f7f4; padding: 20px 36px; text-align: center; font-size: 12.5px; color: #8a96a3; border-top: 1px solid #ece7e1; }
  .footer a { color: #8a96a3; }
  .badge { display: inline-block; background: rgba(242,104,11,.12); color: ${BRAND_COLOR}; font-weight: 800; font-size: 13px; padding: 5px 12px; border-radius: 999px; margin: 4px 0; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="brand-name">veer<span>.</span>ie</div>
    <div style="color:#aeb9d4;font-size:13px;margin-top:4px;">Explainable AI Recruitment</div>
  </div>
  <div class="body">
    ${content}
  </div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} Veer — Recruitment Intelligence Platform &middot; <a href="https://veer.ie/privacy.html">Privacy</a> &middot; <a href="https://veer.ie/terms.html">Terms</a></p>
    <p style="margin-top:6px;">You're receiving this because you applied through Veer. <a href="https://veer.ie">veer.ie</a></p>
  </div>
</div>
</body>
</html>`;
}

/**
 * Stage 1 PASS email — sent after candidate passes the MCQ quiz.
 */
export function stage1PassEmail({ firstName, score, percentage, completedAt, stage2OpensAt, stage2ClosesAt, stage2Link }) {
  const opens = new Date(stage2OpensAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Dublin' });
  const closes = new Date(stage2ClosesAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Dublin' });
  const link = stage2Link || 'http://localhost:3000/stage2.html';

  const content = `
    <h1>🎉 Congratulations, ${firstName}!</h1>
    <p>You've passed the <strong>Stage 1 Skills Quiz</strong> on Veer. Here's your result:</p>

    <div class="highlight-box">
      <p><strong>Quiz Score:</strong> ${score} / 35 correct &nbsp;&nbsp;<span class="badge">PASS ✓</span></p>
      <p style="margin-top:8px"><strong>Percentage:</strong> ${percentage}% (threshold: 80%)</p>
      <p style="margin-top:8px"><strong>Completed:</strong> ${new Date(completedAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Dublin' })}</p>
    </div>

    <h2 style="font-size:18px;margin:24px 0 8px;color:${DARK}">🔓 Stage 2 — Coding Challenge IS OPEN NOW!</h2>
    <p>Great news! You do not need to wait — your Stage 2 Coding Challenge is <strong>unlocked and accessible right now</strong>.</p>

    <div class="highlight-box">
      <div class="detail-row"><span class="detail-label">Status:</span><span class="detail-value" style="color:#15803d;font-weight:700;">OPEN NOW ✓</span></div>
      <div class="detail-row"><span class="detail-label">Window closes:</span><span class="detail-value">${closes}</span></div>
      <div class="detail-row"><span class="detail-label">Access Link:</span><span class="detail-value"><a href="${link}" style="color:#F2680B;font-weight:700;">${link}</a></span></div>
    </div>

    <h2 style="font-size:18px;margin:24px 0 8px;color:${DARK}">📋 What to expect in Stage 2</h2>
    <p>The coding challenge consists of <strong>2 practical coding problems</strong> testing your real-world engineering skills:</p>
    <ul style="font-size:14.5px;line-height:2;color:#3c4f62;padding-left:20px">
      <li>Problem-solving in Python (or language of your choice)</li>
      <li>Data structures and algorithm thinking</li>
      <li>Clean, readable code — comments encouraged</li>
    </ul>

    <div class="cta">
      <a href="${link}">Start Stage 2 Coding Challenge Now →</a>
    </div>

    <hr class="divider" />
    <p style="font-size:13.5px;color:#8a96a3">After Stage 2, qualifying candidates move to <strong>Stage 3</strong> — a short on-camera interview. Results at every stage are explained transparently with your Veer Scorecard.</p>
  `;

  return {
    subject: `✅ You passed Stage 1! Start Stage 2 Coding Challenge Now`,
    html: baseLayout(content),
  };
}

/**
 * Stage 1 FAIL email — sent after candidate fails the MCQ quiz.
 */
export function stage1FailEmail({ firstName, score, percentage }) {
  const content = `
    <h1>Hi ${firstName}, here are your Stage 1 results</h1>
    <p>Thank you for completing the Stage 1 Skills Quiz on Veer. Here's your score:</p>

    <div class="highlight-box">
      <p><strong>Quiz Score:</strong> ${score} / 35 correct &nbsp;&nbsp;<span style="display:inline-block;background:rgba(220,38,38,.10);color:#b91c1c;font-weight:800;font-size:13px;padding:5px 12px;border-radius:999px;">BELOW THRESHOLD</span></p>
      <p style="margin-top:8px"><strong>Percentage:</strong> ${percentage}% (required: 80%)</p>
    </div>

    <p>Unfortunately you didn't reach the 80% pass threshold this time. This result is based purely on technical skill alignment — not a judgment on your potential.</p>

    <h2 style="font-size:18px;margin:24px 0 8px;color:${DARK}">📚 How to improve</h2>
    <ul style="font-size:14.5px;line-height:2;color:#3c4f62;padding-left:20px">
      <li>Strengthen: Prompt Engineering, RAG pipelines, LangChain, vector databases</li>
      <li>Practice: PyTorch, MLOps, Hugging Face Transformers</li>
      <li>Resources: fast.ai, Hugging Face course, DeepLearning.AI</li>
    </ul>

    <p>You're welcome to apply again in future when you feel ready. Veer scores are always transparent and explainable.</p>

    <div class="cta">
      <a href="https://veer.ie/">Browse open roles →</a>
    </div>
  `;

  return {
    subject: `Your Stage 1 Veer quiz result — ${percentage}%`,
    html: baseLayout(content),
  };
}

/**
 * Registration welcome email — sent after candidate registers.
 */
export function welcomeEmail({ firstName }) {
  const content = `
    <h1>Welcome to Veer, ${firstName}! 👋</h1>
    <p>Your candidate account has been created. Here's how the Veer process works — transparent at every step:</p>

    <div style="margin:24px 0">
      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">
        <div style="width:32px;height:32px;border-radius:50%;background:${BRAND_COLOR};color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none;font-size:15px">1</div>
        <div><strong style="color:${DARK}">Upload your CV</strong><br><span style="font-size:13.5px;color:#5e6b78">Our ATS matcher scores your CV against the role's keyword requirements. You need 80+ to proceed.</span></div>
      </div>
      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">
        <div style="width:32px;height:32px;border-radius:50%;background:${BRAND_COLOR};color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none;font-size:15px">2</div>
        <div><strong style="color:${DARK}">Stage 1 — Skills Quiz</strong><br><span style="font-size:13.5px;color:#5e6b78">35 MCQs from our AI/ML question bank. Pass threshold: 80%.</span></div>
      </div>
      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">
        <div style="width:32px;height:32px;border-radius:50%;background:${DARK};color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none;font-size:15px">3</div>
        <div><strong style="color:${DARK}">Stage 2 — Coding Challenge</strong><br><span style="font-size:13.5px;color:#5e6b78">Opens 24h after quiz pass. 2 coding problems, 24h window.</span></div>
      </div>
      <div style="display:flex;gap:14px;align-items:flex-start">
        <div style="width:32px;height:32px;border-radius:50%;background:${DARK};color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;flex:none;font-size:15px">4</div>
        <div><strong style="color:${DARK}">Stage 3 — Short Interview</strong><br><span style="font-size:13.5px;color:#5e6b78">A brief on-camera interview. Your final Scorecard is fully transparent.</span></div>
      </div>
    </div>

    <div class="cta">
      <a href="https://veer.ie/upload-cv.html">Upload your CV now →</a>
    </div>
  `;

  return {
    subject: 'Welcome to Veer — your application has started',
    html: baseLayout(content),
  };
}
