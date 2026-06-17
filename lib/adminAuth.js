import crypto from 'crypto';

// Secret used to sign admin session tokens. Falls back to ADMIN_PIN only if
// ADMIN_TOKEN_SECRET isn't set, but you should set ADMIN_TOKEN_SECRET separately
// in production so the PIN and the signing key are not the same value.
function getSecret() {
  return process.env.ADMIN_TOKEN_SECRET || process.env.ADMIN_PIN || 'dev-secret-change-me';
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 4; // 4 hours

export function createAdminToken() {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `admin:${expires}`;
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

export function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return false;
    const [label, expiresStr, sig] = parts;
    if (label !== 'admin') return false;

    const expires = Number(expiresStr);
    if (!Number.isFinite(expires) || Date.now() > expires) return false;

    const expectedSig = crypto
      .createHmac('sha256', getSecret())
      .update(`${label}:${expiresStr}`)
      .digest('hex');

    // Constant-time comparison to avoid timing attacks.
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
