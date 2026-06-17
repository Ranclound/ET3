import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { verifyAdminToken } from '@/lib/adminAuth';
import { SEED_COURSES } from '@/components/seedData';

const KEY = 'courses';

const MAX_COURSES = 500;
const MAX_REVIEWS_PER_COURSE = 200;
const MAX_STRING = 2000;
const MAX_TITLE = 200;

function clampString(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max);
}

function isHttpUrl(value) {
  if (typeof value !== 'string' || !value) return true; // empty is allowed
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeReview(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const rating = Number(raw.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const name = clampString(raw.name, 120).trim();
  if (!name) return null;

  return {
    id: clampString(raw.id, 50) || 'r' + Date.now() + Math.random().toString(36).slice(2, 8),
    name,
    rating,
    comment: clampString(raw.comment, MAX_STRING).trim(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : new Date().toISOString().slice(0, 10),
  };
}

function sanitizeCourse(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clampString(raw.title, MAX_TITLE).trim();
  const provider = clampString(raw.provider, MAX_TITLE).trim();
  const category = clampString(raw.category, 100).trim();
  if (!title || !provider || !category) return null;

  if (!isHttpUrl(raw.link) || !isHttpUrl(raw.image)) return null;

  const reviews = Array.isArray(raw.reviews)
    ? raw.reviews.map(sanitizeReview).filter(Boolean).slice(0, MAX_REVIEWS_PER_COURSE)
    : [];

  return {
    id: clampString(raw.id, 50) || 'c' + Date.now() + Math.random().toString(36).slice(2, 8),
    title,
    provider,
    category,
    contentType: clampString(raw.contentType, 100).trim(),
    format: clampString(raw.format, 50) || 'Online',
    duration: clampString(raw.duration, 50),
    level: clampString(raw.level, 50) || 'All levels',
    link: clampString(raw.link, MAX_STRING),
    image: clampString(raw.image, MAX_STRING),
    description: clampString(raw.description, MAX_STRING),
    reviews,
  };
}

function isAuthorized(request) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return verifyAdminToken(token);
}

export async function GET() {
  const { data, error } = await supabase
    .from('app_data')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: 'Could not load courses.' }, { status: 500 });
  }

  if (!data) {
    await supabase.from('app_data').insert({ key: KEY, value: SEED_COURSES });
    return NextResponse.json(SEED_COURSES);
  }

  return NextResponse.json(data.value);
}

export async function POST(request) {
  // Only requests carrying a valid admin token (issued by /api/admin-auth
  // after correct PIN entry) can replace the whole course list. This blocks
  // direct API calls from anyone who never authenticated, even if they
  // inspect the frontend code. Regular employees submit reviews through
  // POST /api/courses/[id]/reviews instead, which does not require this token.
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json({ error: 'Expected an array of courses' }, { status: 400 });
  }

  const sanitized = body.map(sanitizeCourse).filter(Boolean).slice(0, MAX_COURSES);

  if (sanitized.length !== body.length) {
    return NextResponse.json(
      { error: 'Some course entries were invalid and the request was rejected. Check required fields.' },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('app_data')
    .upsert({ key: KEY, value: sanitized }, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: 'Could not save courses.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
