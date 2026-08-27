/**
 * lib/email/index.js
 * Nodemailer email module for Veer.
 * All credentials come from .env.local — nothing hardcoded.
 *
 * Usage:
 *   import { sendEmail } from '@/lib/email/index.js';
 *   await sendEmail({ to, subject, html });
 */
import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

/**
 * Send an email.
 * @param {object} opts
 * @param {string} opts.to - Recipient email address
 * @param {string} opts.subject - Email subject
 * @param {string} opts.html - HTML body
 * @param {string} [opts.text] - Plain text fallback
 * @returns {Promise<{ok: boolean, messageId?: string, error?: string}>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const fromAddress = process.env.EMAIL_FROM || 'Veer <noreply@veer.ie>';

  // If SMTP credentials are not configured, log and skip (dev fallback)
  if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your-gmail@gmail.com') {
    console.log('\n[EMAIL STUB] ─────────────────────────────────────────');
    console.log(`  To:      ${to}`);
    console.log(`  From:    ${fromAddress}`);
    console.log(`  Subject: ${subject}`);
    console.log('  (SMTP not configured — set SMTP_USER/SMTP_PASS in .env.local to send real emails)');
    console.log('─────────────────────────────────────────────────────\n');
    return { ok: true, messageId: 'stub', stub: true };
  }

  try {
    const info = await getTransporter().sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });

    console.log(`[EMAIL SENT] To: ${to} | Subject: ${subject} | ID: ${info.messageId}`);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EMAIL ERROR] Failed to send to ${to}:`, err.message);
    return { ok: false, error: err.message };
  }
}
