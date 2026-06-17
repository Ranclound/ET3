'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Pencil, Trash2, X, ExternalLink, Lock, Unlock, Star, MessageSquare } from 'lucide-react';
import { SEED_COURSES } from './seedData';

const YELLOW = '#FFD200';
const BLACK = '#1A1A1A';

const EMPTY_FORM = {
  title: '', provider: '', category: '', contentType: '', format: 'Online',
  duration: '', level: 'All levels', link: '', image: '', description: '',
};

const EMPTY_REVIEW = { name: '', rating: 0, comment: '' };

function avgRating(reviews) {
  if (!reviews || reviews.length === 0) return null;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

function safeUrl(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function Stars({ value, size = 14 }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          fill={value >= i ? YELLOW : 'none'}
          color={value >= i ? BLACK : '#C9C9C9'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

function StarPicker({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => onChange(i)} className="p-0.5">
          <Star size={22} fill={value >= i ? YELLOW : 'none'} color={value >= i ? BLACK : '#C9C9C9'} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}

function Ribbon({ children }) {
  return (
    <div
      className="absolute -top-3 left-4 px-3 py-1 text-[10px] sm:text-xs uppercase tracking-wide font-medium font-mono"
      style={{
        backgroundColor: BLACK,
        color: YELLOW,
        clipPath: 'polygon(0 0, 100% 0, calc(100% - 10px) 50%, 100% 100%, 0 100%)',
        paddingRight: '18px',
      }}
    >
      {children}
    </div>
  );
}

export default function TrainingIndex() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeContentType, setActiveContentType] = useState('All');
  const [adminToken, setAdminToken] = useState(null); // null = not admin
  const [showPin, setShowPin] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinChecking, setPinChecking] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [detailId, setDetailId] = useState(null);
  const [reviewForm, setReviewForm] = useState(EMPTY_REVIEW);
  const [reviewError, setReviewError] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const isAdmin = Boolean(adminToken);

  // Restore an existing admin session (this tab only) so a refresh doesn't
  // force re-entering the PIN. Tokens expire server-side after a few hours.
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
    if (stored) setAdminToken(stored);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/courses');
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setCourses(Array.isArray(data) ? data : SEED_COURSES);
      } catch (e) {
        setCourses(SEED_COURSES);
        setSaveError('Could not reach the database. Showing sample data only.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function persist(next) {
    setCourses(next);
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
        },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error('Save failed');
      setSaveError('');
    } catch (e) {
      setSaveError('Save failed. Your change may not persist for others.');
    }
  }

  async function tryUnlock() {
    setPinChecking(true);
    setPinError('');
    try {
      const res = await fetch('/api/admin-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinValue }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPinError(data.error || 'Incorrect PIN. Try again.');
        return;
      }
      setAdminToken(data.token);
      sessionStorage.setItem('adminToken', data.token);
      setShowPin(false);
      setPinValue('');
    } catch (e) {
      setPinError('Could not reach the server. Try again.');
    } finally {
      setPinChecking(false);
    }
  }

  function logoutAdmin() {
    setAdminToken(null);
    sessionStorage.removeItem('adminToken');
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(course) {
    setForm({ ...course });
    setEditingId(course.id);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveForm() {
    if (!form.title.trim() || !form.provider.trim() || !form.category.trim()) return;
    if (editingId) {
      await persist(courses.map((c) => (c.id === editingId ? { ...c, ...form, id: editingId } : c)));
    } else {
      await persist([...courses, { ...form, id: 'c' + Date.now(), reviews: [] }]);
    }
    closeForm();
  }

  async function removeCourse(id) {
    await persist(courses.filter((c) => c.id !== id));
    if (detailId === id) setDetailId(null);
  }

  function openDetail(id) {
    setDetailId(id);
    setReviewForm(EMPTY_REVIEW);
    setReviewError('');
  }

  async function submitReview() {
    if (!reviewForm.name.trim() || reviewForm.rating === 0) {
      setReviewError('Please add your name/department and a star rating.');
      return;
    }
    setReviewSubmitting(true);
    setReviewError('');
    try {
      const res = await fetch(`/api/courses/${detailId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: reviewForm.name.trim(),
          rating: reviewForm.rating,
          comment: reviewForm.comment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setReviewError(data.error || 'Could not submit review.');
        return;
      }
      setCourses((prev) =>
        prev.map((c) => (c.id === detailId ? { ...c, reviews: [...(c.reviews || []), data.review] } : c))
      );
      setReviewForm(EMPTY_REVIEW);
    } catch (e) {
      setReviewError('Could not reach the server. Try again.');
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function deleteReview(courseId, reviewId) {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/courses/${courseId}/reviews`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ reviewId }),
      });
      if (!res.ok) throw new Error('Delete failed');
      setCourses((prev) =>
        prev.map((c) => (c.id === courseId ? { ...c, reviews: c.reviews.filter((r) => r.id !== reviewId) } : c))
      );
    } catch (e) {
      setSaveError('Could not delete the review. Try again.');
    }
  }

  const categories = ['All', ...Array.from(new Set(courses.map((c) => c.category))).sort()];
  const contentTypes = ['All', ...Array.from(new Set(courses.map((c) => c.contentType).filter(Boolean))).sort()];

  const filtered = courses.filter((c) => {
    const matchesCategory = activeCategory === 'All' || c.category === activeCategory;
    const matchesContentType = activeContentType === 'All' || c.contentType === activeContentType;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.provider.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      (c.contentType || '').toLowerCase().includes(q);
    return matchesCategory && matchesContentType && matchesQuery;
  });

  const detailCourse = courses.find((c) => c.id === detailId);

  return (
    <div className="min-h-screen font-body" style={{ backgroundColor: '#FAFAF7', color: BLACK }}>
      <style>{`
        .font-display { font-family: Arial, Helvetica, sans-serif; font-weight: 700; }
        .font-body { font-family: Arial, Helvetica, sans-serif; }
        .font-mono { font-family: Arial, Helvetica, sans-serif; }
      `}</style>

      {/* Header */}
      <header className="bg-white border-b" style={{ borderColor: '#EFEAE0' }}>
        <div className="max-w-5xl mx-auto px-5 py-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <img
              src="https://s1.kaercher-media.com/versions/2026.3.0/static/img/kaercher_logo.svg"
              alt="Kärcher logo"
              className="h-9 sm:h-11 object-contain flex-shrink-0"
            />
            <div className="border-l pl-4" style={{ borderColor: '#E0DCC8' }}>
              <h1 className="font-display text-xl sm:text-3xl uppercase tracking-tight leading-tight">Training Index</h1>
              <p className="font-body text-sm mt-1" style={{ color: '#6B6B6B' }}>
                External courses for NESEA staff — rate and review what you've taken
              </p>
            </div>
          </div>
          <button
            onClick={() => (isAdmin ? logoutAdmin() : setShowPin(true))}
            className="font-body text-xs sm:text-sm flex items-center gap-1.5 px-3 py-2 rounded-md border whitespace-nowrap"
            style={{
              borderColor: BLACK,
              backgroundColor: isAdmin ? BLACK : YELLOW,
              color: isAdmin ? YELLOW : BLACK,
            }}
          >
            {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
            {isAdmin ? 'Admin mode on' : 'Admin'}
          </button>
        </div>
      </header>

      {/* Controls */}
      <div className="max-w-5xl mx-auto px-5 pt-6 pb-2">
        <div className="flex items-center gap-2 border-b-2 pb-3" style={{ borderColor: BLACK }}>
          <Search size={16} color={BLACK} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses, providers, topics..."
            className="font-body w-full bg-transparent outline-none text-sm"
            style={{ color: BLACK }}
          />
        </div>
        <div className="mt-4">
          <p className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: '#9AA5AE' }}>Category</p>
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="font-body text-xs px-3 py-1.5 rounded-full border-2 transition-colors"
                style={
                  activeCategory === cat
                    ? { backgroundColor: BLACK, color: YELLOW, borderColor: BLACK }
                    : { backgroundColor: 'transparent', color: BLACK, borderColor: '#E0DCC8' }
                }
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {contentTypes.length > 1 && (
          <div className="mt-3">
            <p className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: '#9AA5AE' }}>Content type</p>
            <div className="flex gap-2 flex-wrap">
              {contentTypes.map((ct) => (
                <button
                  key={ct}
                  onClick={() => setActiveContentType(ct)}
                  className="font-body text-xs px-3 py-1.5 rounded-full border-2 transition-colors"
                  style={
                    activeContentType === ct
                      ? { backgroundColor: YELLOW, color: BLACK, borderColor: BLACK }
                      : { backgroundColor: 'transparent', color: BLACK, borderColor: '#E0DCC8' }
                  }
                >
                  {ct}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {saveError && (
        <div className="max-w-5xl mx-auto px-5 mt-3">
          <div className="font-body text-xs px-3 py-2 rounded-md" style={{ backgroundColor: '#FBEAEA', color: '#9B3D3D' }}>
            {saveError}
          </div>
        </div>
      )}

      {/* Grid */}
      <main className="max-w-5xl mx-auto px-5 py-8">
        {loading ? (
          <p className="font-body text-sm" style={{ color: '#6B6B6B' }}>Loading the index...</p>
        ) : filtered.length === 0 && !isAdmin ? (
          <div className="text-center py-16">
            <p className="font-display text-lg uppercase" style={{ color: '#6B6B6B' }}>No courses match yet.</p>
            <p className="font-body text-sm mt-1" style={{ color: '#9AA5AE' }}>Try a different search or category.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-6">
            {filtered.map((course) => {
              const avg = avgRating(course.reviews);
              return (
                <div key={course.id} className="relative pt-3">
                  <Ribbon>{course.category}</Ribbon>
                  <div
                    onClick={() => openDetail(course.id)}
                    className="bg-white rounded-lg border-2 p-5 h-full flex flex-col gap-3 cursor-pointer transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-[4px_6px_0px_0px_rgba(26,26,26,1)] active:translate-y-0 active:shadow-[2px_3px_0px_0px_rgba(26,26,26,1)]"
                    style={{ borderColor: BLACK }}
                  >
                    {safeUrl(course.image) && (
                      <img
                        src={course.image}
                        alt={course.title}
                        className="w-full h-36 object-cover rounded-md -mt-1 mb-1"
                        style={{ border: `1px solid #EFEAE0` }}
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-base sm:text-lg uppercase leading-snug">{course.title}</h3>
                      </div>
                      <p className="font-body text-sm mt-1" style={{ color: '#6B6B6B' }}>{course.provider}</p>
                    </div>
                    <p className="font-body text-sm flex-1" style={{ color: '#3A3A3A' }}>{course.description}</p>
                    <div className="font-mono text-xs flex gap-3 flex-wrap" style={{ color: '#9AA5AE' }}>
                      {course.contentType && (
                        <span className="px-2 py-0.5 rounded" style={{ backgroundColor: '#F3F0E6', color: BLACK }}>
                          {course.contentType}
                        </span>
                      )}
                      <span>{course.format}</span>
                      <span>·</span>
                      <span>{course.duration}</span>
                      <span>·</span>
                      <span>{course.level}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {avg ? (
                        <>
                          <Stars value={Math.round(avg)} />
                          <span className="font-mono text-xs" style={{ color: '#6B6B6B' }}>
                            {avg.toFixed(1)} ({course.reviews.length})
                          </span>
                        </>
                      ) : (
                        <span className="font-mono text-xs" style={{ color: '#C9C2B4' }}>No reviews yet</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: '#EFEAE0' }}>
                      <div className="flex items-center gap-4">
                        {safeUrl(course.link) ? (
                          <a href={course.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="font-body text-sm flex items-center gap-1.5 font-medium">
                            Open course <ExternalLink size={13} />
                          </a>
                        ) : (
                          <span className="font-body text-sm" style={{ color: '#C9C2B4' }}>No link</span>
                        )}
                        <span className="font-body text-sm flex items-center gap-1.5 font-medium" style={{ color: '#6B6B6B' }}>
                          <MessageSquare size={13} /> Reviews
                        </span>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); openEdit(course); }} className="p-1.5 rounded-md border" style={{ borderColor: '#E0DCC8', color: '#6B6B6B' }}>
                            <Pencil size={14} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); removeCourse(course.id); }} className="p-1.5 rounded-md border" style={{ borderColor: '#E0DCC8', color: '#9B3D3D' }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {isAdmin && (
              <button
                onClick={openAdd}
                className="rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 py-10 font-body text-sm"
                style={{ borderColor: '#E0DCC8', color: '#9AA5AE' }}
              >
                <Plus size={20} />
                Add a new course
              </button>
            )}
          </div>
        )}
      </main>

      {/* PIN modal */}
      {showPin && (
        <div className="fixed inset-0 flex items-center justify-center p-5 z-50" style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}>
          <div className="bg-white rounded-lg p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base uppercase">Admin access</h2>
              <button onClick={() => { setShowPin(false); setPinValue(''); setPinError(''); }}>
                <X size={18} color="#6B6B6B" />
              </button>
            </div>
            <p className="font-body text-sm mb-3" style={{ color: '#6B6B6B' }}>Enter the admin PIN to add or edit courses.</p>
            <input
              type="password"
              value={pinValue}
              onChange={(e) => { setPinValue(e.target.value); setPinError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
              className="font-body w-full border-2 rounded-md px-3 py-2 text-sm outline-none"
              style={{ borderColor: '#E0DCC8' }}
              placeholder="PIN"
              autoFocus
            />
            {pinError && <p className="font-body text-xs mt-2" style={{ color: '#9B3D3D' }}>{pinError}</p>}
            <button
              onClick={tryUnlock}
              disabled={pinChecking || !pinValue}
              className="font-body w-full mt-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: BLACK, color: YELLOW }}
            >
              {pinChecking ? 'Checking...' : 'Unlock'}
            </button>
          </div>
        </div>
      )}

      {/* Add/edit form modal */}
      {showForm && (
        <div className="fixed inset-0 flex items-center justify-center p-5 z-50" style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}>
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base uppercase">{editingId ? 'Edit course' : 'Add course'}</h2>
              <button onClick={closeForm}><X size={18} color="#6B6B6B" /></button>
            </div>
            <div className="space-y-3 font-body text-sm">
              <Field label="Title *">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border-2 rounded-md px-3 py-2 outline-none" style={{ borderColor: '#E0DCC8' }} />
              </Field>
              <Field label="Provider *">
                <input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className="w-full border-2 rounded-md px-3 py-2 outline-none" style={{ borderColor: '#E0DCC8' }} placeholder="e.g. LinkedIn Learning, Coursera, SHRM" />
              </Field>
              <Field label="Category *">
                <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border-2 rounded-md px-3 py-2 outline-none" style={{ borderColor: '#E0DCC8' }} placeholder="e.g. Leadership, Compliance, Communication" list="category-options" />
                <datalist id="category-options">
                  {categories.filter((c) => c !== 'All').map((c) => <option key={c} value={c} />)}
                </datalist>
              </Field>
              <Field label="Content type">
                <input value={form.contentType} onChange={(e) => setForm({ ...form, contentType: e.target.value })} className="w-full border-2 rounded-md px-3 py-2 outline-none" style={{ borderColor: '#E0DCC8' }} placeholder="e.g. Video, Course, Game, Article" list="content-type-options" />
                <datalist id="content-type-options">
                  {contentTypes.filter((c) => c !== 'All').map((c) => <option key={c} value={c} />)}
                </datalist>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Format">
                  <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} className="w-full border-2 rounded-md px-3 py-2 outline-none" style={{ borderColor: '#E0DCC8' }}>
                    <option>Online</option>
                    <option>In-person</option>
                    <option>Hybrid</option>
                    <option>Self-paced</option>
                  </select>
                </Field>
                <Field label="Level">
                  <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="w-full border-2 rounded-md px-3 py-2 outline-none" style={{ borderColor: '#E0DCC8' }}>
                    <option>All levels</option>
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Advanced</option>
                  </select>
                </Field>
              </div>
              <Field label="Duration">
                <input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className="w-full border-2 rounded-md px-3 py-2 outline-none" style={{ borderColor: '#E0DCC8' }} placeholder="e.g. 3 hours, 4 weeks" />
              </Field>
              <Field label="Link">
                <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className="w-full border-2 rounded-md px-3 py-2 outline-none" style={{ borderColor: '#E0DCC8' }} placeholder="https://..." />
              </Field>
              <Field label="Image URL">
                <input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} className="w-full border-2 rounded-md px-3 py-2 outline-none" style={{ borderColor: '#E0DCC8' }} placeholder="https://... (course cover image)" />
                {form.image && (
                  <img src={form.image} alt="Preview" className="mt-2 h-24 w-full object-cover rounded-md" style={{ border: '1px solid #E0DCC8' }} />
                )}
              </Field>
              <Field label="Description">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full border-2 rounded-md px-3 py-2 outline-none resize-none" style={{ borderColor: '#E0DCC8' }} />
              </Field>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={closeForm} className="flex-1 py-2 rounded-md border-2 text-sm font-medium" style={{ borderColor: '#E0DCC8', color: '#6B6B6B' }}>Cancel</button>
              <button
                onClick={saveForm}
                disabled={!form.title.trim() || !form.provider.trim() || !form.category.trim()}
                className="flex-1 py-2 rounded-md text-sm font-medium disabled:opacity-40"
                style={{ backgroundColor: BLACK, color: YELLOW }}
              >
                {editingId ? 'Save changes' : 'Add course'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / reviews modal */}
      {detailCourse && (
        <div className="fixed inset-0 flex items-center justify-center p-5 z-50" style={{ backgroundColor: 'rgba(26,26,26,0.5)' }}>
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 pt-6 pb-4 border-b-2" style={{ borderColor: BLACK }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs uppercase px-2 py-1" style={{ backgroundColor: BLACK, color: YELLOW }}>{detailCourse.category}</span>
                  {detailCourse.contentType && (
                    <span className="font-mono text-xs uppercase px-2 py-1 border" style={{ borderColor: BLACK, color: BLACK }}>{detailCourse.contentType}</span>
                  )}
                </div>
                <button onClick={() => setDetailId(null)}><X size={18} color="#6B6B6B" /></button>
              </div>
              {safeUrl(detailCourse.image) && (
                <img
                  src={detailCourse.image}
                  alt={detailCourse.title}
                  className="w-full h-44 object-cover rounded-md mt-3"
                  style={{ border: '1px solid #EFEAE0' }}
                />
              )}
              <h2 className="font-display text-lg uppercase mt-3">{detailCourse.title}</h2>
              <p className="font-body text-sm mt-1" style={{ color: '#6B6B6B' }}>{detailCourse.provider}</p>
              <p className="font-body text-sm mt-2" style={{ color: '#3A3A3A' }}>{detailCourse.description}</p>
              {safeUrl(detailCourse.link) && (
                <a href={detailCourse.link} target="_blank" rel="noopener noreferrer" className="font-body text-sm flex items-center gap-1.5 font-medium mt-2">
                  Open course <ExternalLink size={13} />
                </a>
              )}
            </div>

            <div className="px-6 py-4">
              <h3 className="font-display text-sm uppercase mb-3">Reviews ({detailCourse.reviews.length})</h3>
              {detailCourse.reviews.length === 0 ? (
                <p className="font-body text-sm" style={{ color: '#9AA5AE' }}>No reviews yet. Be the first to share your experience.</p>
              ) : (
                <div className="space-y-4 mb-4">
                  {detailCourse.reviews.map((r) => (
                    <div key={r.id} className="border-b pb-3" style={{ borderColor: '#EFEAE0' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Stars value={r.rating} />
                          <span className="font-body text-sm font-medium">{r.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs" style={{ color: '#C9C2B4' }}>{r.date}</span>
                          {isAdmin && (
                            <button onClick={() => deleteReview(detailCourse.id, r.id)}>
                              <Trash2 size={13} color="#9B3D3D" />
                            </button>
                          )}
                        </div>
                      </div>
                      {r.comment && <p className="font-body text-sm mt-1" style={{ color: '#3A3A3A' }}>{r.comment}</p>}
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <h3 className="font-display text-sm uppercase mb-3">Write a review</h3>
                <div className="space-y-3 font-body text-sm">
                  <Field label="Your name & department *">
                    <input
                      value={reviewForm.name}
                      onChange={(e) => setReviewForm({ ...reviewForm, name: e.target.value })}
                      className="w-full border-2 rounded-md px-3 py-2 outline-none"
                      style={{ borderColor: '#E0DCC8' }}
                      placeholder="e.g. Aom, HR"
                    />
                  </Field>
                  <Field label="Rating *">
                    <StarPicker value={reviewForm.rating} onChange={(v) => setReviewForm({ ...reviewForm, rating: v })} />
                  </Field>
                  <Field label="Comment">
                    <textarea
                      value={reviewForm.comment}
                      onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                      rows={2}
                      className="w-full border-2 rounded-md px-3 py-2 outline-none resize-none"
                      style={{ borderColor: '#E0DCC8' }}
                      placeholder="Was it useful? Who would you recommend it to?"
                    />
                  </Field>
                  {reviewError && <p className="text-xs" style={{ color: '#9B3D3D' }}>{reviewError}</p>}
                  <button
                    onClick={submitReview}
                    disabled={reviewSubmitting}
                    className="w-full py-2 rounded-md text-sm font-medium disabled:opacity-50"
                    style={{ backgroundColor: BLACK, color: YELLOW }}
                  >
                    {reviewSubmitting ? 'Submitting...' : 'Submit review'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="max-w-5xl mx-auto px-5 py-8 font-body text-xs" style={{ color: '#C9C2B4' }}>
        {courses.length} course{courses.length !== 1 ? 's' : ''} in the index
      </footer>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block mb-1 font-medium" style={{ color: '#3A3A3A' }}>{label}</label>
      {children}
    </div>
  );
}
