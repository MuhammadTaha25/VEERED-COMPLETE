/**
 * Veer — Auth module (local dev, swap target for Supabase Auth)
 *
 * All authentication logic is isolated here so swapping to Supabase
 * later is a small diff (replace this module), not a rewrite.
 *
 * Uses:
 *  - bcryptjs for password hashing (pure JS, no native deps)
 *  - iron-session for encrypted session cookies
 */
import bcrypt from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers.js';

const BCRYPT_ROUNDS = 12;

/** iron-session configuration */
const sessionOptions = {
  password: process.env.SESSION_SECRET || 'veer-local-dev-secret-change-in-production-min-32-chars',
  cookieName: 'veer_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
};

/**
 * Get the current session from the request cookies.
 * Returns an iron-session object with .save() and .destroy() methods.
 */
export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession(cookieStore, sessionOptions);
}

/**
 * Hash a plaintext password.
 * @param {string} plain
 * @returns {Promise<string>}
 */
export async function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext password against a stored hash.
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Create a session for the given user.
 * Call after successful login/registration.
 * @param {{ id: string, email: string, role: 'candidate'|'recruiter' }} user
 */
export async function createUserSession(user) {
  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.role = user.role;
  await session.save();
  return session;
}

/**
 * Get the current authenticated user from session, or null.
 * @returns {Promise<{userId: string, email: string, role: string}|null>}
 */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  return {
    userId: session.userId,
    email: session.email,
    role: session.role,
  };
}

/**
 * Require authentication. Returns user or throws a Response.
 * @param {string} [requiredRole] - If set, also checks role matches
 * @returns {Promise<{userId: string, email: string, role: string}>}
 */
export async function requireAuth(requiredRole) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (requiredRole && user.role !== requiredRole) {
    throw new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return user;
}

/**
 * Require an authenticated admin. Returns the user, or null if not an admin.
 * (Route handlers should return 401/403 themselves when this returns null.)
 * @returns {Promise<{userId: string, email: string, role: string}|null>}
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return null;
  return user;
}

/**
 * Destroy the current session (logout).
 */
export async function destroySession() {
  const session = await getSession();
  session.destroy();
}
