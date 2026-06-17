import { supabase } from '../../../../lib/supabaseClient';
import { verifyAdminToken } from '../../../../lib/adminAuth';

const KEY = 'courses';
const MAX_STRING = 2000;
const MAX_REVIEWS_PER_COURSE = 200;

// Basic in-memory rate limit per server instance to slow down spam/abuse.
const submissions = new Map(); // ip -> { count, windowStart }
const WINDOW_MS = 60_000;
const MAX_SUBMISSIONS_PER_MINUTE = 5;

function getClientIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function clampString(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max);
}

function isRateLimited(ip) {
  const now = Date.now();
  const record = submissions.get(ip) || { count: 0, windowStart: now };
  if (now - record.windowStart > WINDOW_MS) {
    record.count = 0;
    record.windowStart = now;
  }
  record.count += 1;
  submissions.set(ip, record);
  return record.count > MAX_SUBMISSIONS_PER_MINUTE;
}

export async function POST(request, { params }) {
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many reviews submitted. Please wait a minute and try again.' },
      { status: 429 }
    );
  }

  const courseId = params.id;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rating = Number(body?.rating);
  const name = clampString(body?.name, 120).trim();
  const comment = clampString(body?.comment, MAX_STRING).trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Rating must be a whole number from 1 to 5.' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Name/department is required.' }, { status: 400 });
  }

  const { data, error: fetchError } = await supabase
    .from('app_data')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();

  if (fetchError || !data) {
    return NextResponse.json({ error: 'Could not load courses.' }, { status: 500 });
  }

  const courses = data.value;
  const courseIndex = courses.findIndex((c) => c.id === courseId);
  if (courseIndex === -1) {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  }

  const course = courses[courseIndex];
  const existingReviews = Array.isArray(course.reviews) ? course.reviews : [];

  if (existingReviews.length >= MAX_REVIEWS_PER_COURSE) {
    return NextResponse.json({ error: 'This course has reached the maximum number of reviews.' }, { status: 400 });
  }

  const newReview = {
    id: 'r' + Date.now() + Math.random().toString(36).slice(2, 8),
    name,
    rating,
    comment,
    date: new Date().toISOString().slice(0, 10),
  };

  const updatedCourse = { ...course, reviews: [...existingReviews, newReview] };
  const updatedCourses = [...courses];
  updatedCourses[courseIndex] = updatedCourse;

  const { error: saveError } = await supabase
    .from('app_data')
    .upsert({ key: KEY, value: updatedCourses }, { onConflict: 'key' });

  if (saveError) {
    return NextResponse.json({ error: 'Could not save review.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, review: newReview });
}

export async function DELETE(request, { params }) {
  // Deleting a review is admin-only (e.g. removing inappropriate content).
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!verifyAdminToken(token)) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 401 });
  }

  const courseId = params.id;
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const reviewId = clampString(body?.reviewId, 60);
  if (!reviewId) {
    return NextResponse.json({ error: 'reviewId is required.' }, { status: 400 });
  }

  const { data, error: fetchError } = await supabase
    .from('app_data')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();

  if (fetchError || !data) {
    return NextResponse.json({ error: 'Could not load courses.' }, { status: 500 });
  }

  const courses = data.value;
  const courseIndex = courses.findIndex((c) => c.id === courseId);
  if (courseIndex === -1) {
    return NextResponse.json({ error: 'Course not found.' }, { status: 404 });
  }

  const course = courses[courseIndex];
  const updatedCourse = {
    ...course,
    reviews: (course.reviews || []).filter((r) => r.id !== reviewId),
  };
  const updatedCourses = [...courses];
  updatedCourses[courseIndex] = updatedCourse;

  const { error: saveError } = await supabase
    .from('app_data')
    .upsert({ key: KEY, value: updatedCourses }, { onConflict: 'key' });

  if (saveError) {
    return NextResponse.json({ error: 'Could not delete review.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
