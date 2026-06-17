import { NextResponse } from 'next/server';
import { createAdminToken } from '@/lib/adminAuth';

// Very basic in-memory rate limiting per server instance: slows down PIN brute-forcing.
// Note: this resets on cold start / across instances, so for stronger protection
// long-term, consider Vercel's rate limiting or a service like Upstash.
const attempts = new Map(); // ip -> { count, windowStart }
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 10;

function getClientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export async function POST(request) {
  const ip = getClientIp(request);
  const now = Date.now();
  const record = attempts.get(ip) || { count: 0, windowStart: now };

  if (now - record.windowStart > WINDOW_MS) {
    record.count = 0;
    record.windowStart = now;
  }
  record.count += 1;
  attempts.set(ip, record);

  if (record.count > MAX_ATTEMPTS) {
    return NextResponse.json(
      { ok: false, error: 'Too many attempts. Please wait a minute and try again.' },
      { status: 429 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
  }

  const { pin } = body || {};
  const realPin = process.env.ADMIN_PIN;

  if (!realPin) {
    return NextResponse.json(
      { ok: false, error: 'Admin PIN is not configured on the server.' },
      { status: 500 }
    );
  }

  if (typeof pin !== 'string' || pin !== realPin) {
    return NextResponse.json({ ok: false, error: 'Incorrect PIN.' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, token: createAdminToken() });
}
