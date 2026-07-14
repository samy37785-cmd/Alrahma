import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import {
  Flame, TrendingUp, CalendarDays, Clock, Play, BookOpen, BarChart2,
  MessageSquare, Book, CreditCard, MessageCircle, Landmark, Zap,
  GraduationCap, Trophy, Star, Target, Moon, ListChecks, PenLine, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { useDashboardData } from '../hooks/useDashboard';
import useCountUp from '../hooks/useCountUp';
import { getCourseProgress, getMyCertificates } from '../api/courseApi';
import { getClasses } from '../api/classApi';
import { site } from '../data/site';
import { TOOLS_TEXT } from '../i18n/content';
import { PRAYERS_ORDER, PRAYER_META } from '../utils/islamicToolsUtils';
import DashboardLayout from '../components/layout/DashboardLayout';
import ProgressRing from '../components/ui/ProgressRing';
import { Skeleton, SkeletonDashboard } from '../components/ui/Skeleton';
import { DsBarChart, DsChartEmpty } from '../components/ui/DsChart';
import MilestoneCelebration from '../components/ui/MilestoneCelebration';
import ShareAchievement from '../components/ui/ShareAchievement';
import CertificateCard from '../components/ui/CertificateCard';
import ReferralCard from '../components/ui/ReferralCard';
import WishlistButton from '../components/ui/WishlistButton';
import '../styles/trust-engage.css';
import { formatTime as fmtTime } from '../utils/date';
import WeeklyChart, { buildWeekBars } from '../components/features/dashboard/WeeklyChart';
import CourseCard from '../components/features/dashboard/CourseCard';
import UpcomingClassCard from '../components/features/dashboard/UpcomingClassCard';
import SpiritualPulseCard from '../components/features/dashboard/SpiritualPulseCard';
import DailyWisdomCard from '../components/features/dashboard/DailyWisdomCard';
import SmartPlannerCard from '../components/features/dashboard/SmartPlannerCard';
import HifzProgressCard from '../components/features/dashboard/HifzProgressCard';
import { TutorReviewWidget } from '../components/features/dashboard/TutorReviewWidget';

/* ── helpers ──────────────────────────────────────────────────── */
const SESSIONS_BY_PLAN = {
  // New Islamic plan names
  noorani: 2, 'نوراني': 2,
  huffaz: 3, 'حفاظ': 3, 'حُفَّاظ': 3,
  ijazah: 4, 'إجازة': 4,
  // Legacy names kept for existing subscriptions
  starter: 2, base: 2, debutant: 2, einstieg: 2, inicial: 2, 'البداية': 2,
  standard: 3, القياسية: 3,
  premium: 4, المميزة: 4,
};

function sessionsFromPlan(plan) {
  if (!plan) return '—';
  const key = plan.toLowerCase().trim();
  for (const [k, v] of Object.entries(SESSIONS_BY_PLAN)) {
    if (key.includes(k)) return v;
  }
  return '—';
}

function daysLeft(validUntil) {
  if (!validUntil) return null;
  return Math.ceil((new Date(validUntil) - Date.now()) / 86400000);
}

function greeting(d) {
  const h = new Date().getHours();
  if (h < 5)  return d.greetingNight;
  if (h < 12) return d.greetingMorning;
  if (h < 17) return d.greetingAfternoon;
  return d.greetingEvening;
}

/* ══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const { user } = useAuth();
  const { t, lang } = useLang();

  const { me, enrollment, courses, loading, error, refetch } = useDashboardData(!!user);

  const sub     = me?.subscription ?? user?.subscription ?? null;
  const isActive = sub?.status === 'active';
  const days     = daysLeft(sub?.validUntil);
  const sessions = sessionsFromPlan(sub?.plan);

  /* Fetch progress for ALL enrolled courses */
  const progressQueries = useQueries({
    queries: courses.map((c) => ({
      queryKey: ['course-progress', c._id],
      queryFn:  () => getCourseProgress(c._id),
      enabled:  !!c._id,
      staleTime: 60000,
    })),
  });
  const allProgress   = progressQueries.map((q) => q.data).filter(Boolean);
  const firstProgress = allProgress[0] ?? null;
  const firstCourse   = courses[0];

  /* Fetch upcoming classes */
  const { data: classes = [], isLoading: classesLoading } = useQuery({
    queryKey: ['classes', 'upcoming'],
    queryFn:  () => getClasses({ upcoming: 1 }),
    enabled:  !!user,
    staleTime: 60000,
    refetchInterval: 5 * 60000,
  });

  /* Fetch student certificates */
  const { data: certificates = [], isLoading: certificatesLoading } = useQuery({
    queryKey: ['certificates', 'mine'],
    queryFn:  getMyCertificates,
    enabled:  !!user,
    staleTime: 5 * 60000,
  });

  const weekBars = useMemo(() => buildWeekBars(allProgress), [allProgress]);

  /* Streak: consecutive days studied (today may be absent) */
  const streak = useMemo(() => {
    if (!firstProgress?.completedAt?.length) return 0;
    let count = 0;
    const daysSet = new Set(firstProgress.completedAt.map((ts) => new Date(ts).toDateString()));
    for (let i = 0; i < 365; i++) {
      const d = new Date(Date.now() - i * 86400000).toDateString();
      if (daysSet.has(d)) count++;
      else if (i > 0) break;
    }
    return count;
  }, [firstProgress]);

  /* Spaced repetition: hifz verses due for review today */
  const hifzDueCount = useMemo(() => {
    if (!allProgress) return 0;
    // Simple approximation: count completedAt entries older than 1 day not reviewed in last 24h
    const intervals = [1, 3, 7, 14, 30]; // SM-2-style review gaps in days
    const now = Date.now();
    let due = 0;
    for (const pd of allProgress) {
      (pd?.completedAt || []).forEach((ts) => {
        const age = (now - new Date(ts).getTime()) / 86400000;
        if (intervals.some((gap) => Math.abs(age - gap) < 0.5)) due++;
      });
    }
    return Math.min(due, 30); // cap at 30 for display
  }, [allProgress]);

  const overallPct = useMemo(() => {
    if (!firstProgress || !firstProgress.total) return 0;
    return Math.round((firstProgress.done / firstProgress.total) * 100);
  }, [firstProgress]);

  const [showShare, setShowShare] = useState(false);
  const SHARE_MILESTONES = [25, 50, 75, 100];
  const shareLabel = overallPct === 100
    ? `Completed ${firstCourse?.title || 'my course'} — 100% done!`
    : `Reached ${overallPct}% in ${firstCourse?.title || 'my Quran course'}`;

  /* KPI stat count-up — plain numbers only; sessionsNum falls back to 0 when
     sessionsFromPlan() returns the '—' placeholder (no active plan), and the
     JSX below renders that raw placeholder instead of the animated count. */
  const sessionsNum   = typeof sessions === 'number' ? sessions : 0;
  const streakCount   = useCountUp(streak, 1000, !loading);
  const progressCount = useCountUp(overallPct, 1000, !loading);
  const sessionsCount = useCountUp(sessionsNum, 1000, !loading);
  const xpCount        = useCountUp(me?.xp ?? 0, 1000, !loading);

  if (loading) {
    return (
      <DashboardLayout>
        <SkeletonDashboard />
      </DashboardLayout>
    );
  }

  const daysWarn = days !== null && days <= 7 && days > 0;
  return (
    <DashboardLayout>
      {/* ── Milestone celebration toast ──────────────────── */}
      <MilestoneCelebration
        courseId={firstCourse?._id}
        courseTitle={firstCourse?.title}
        pct={overallPct}
      />

      {/* ── Achievement share modal ──────────────────────── */}
      {showShare && (
        <ShareAchievement
          type="percent"
          value={overallPct}
          label={shareLabel}
          onDismiss={() => setShowShare(false)}
        />
      )}

      {/* ── Page header ─────────────────────────────────────── */}
      <div className="ds-page-hd">
        <div className="ds-page-hd__left">
          <div className="ds-page-hd__eyebrow">
            <Star size={12} aria-hidden="true" /> Student Dashboard
          </div>
          <h1 className="ds-page-hd__title">
            {greeting(t.dashboard)}, {user?.name?.split(' ')[0]}
            {streak > 0 && <span className="ds-streak-badge">{streak} Day Streak</span>}
          </h1>
          <p className="ds-page-hd__sub">
            {isActive
              ? `${sub?.plan} plan · expires ${new Date(sub?.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
              : 'Your subscription is inactive — renew to continue learning.'}
          </p>
        </div>
        <div className="ds-page-hd__actions">
          {!isActive && (
            <Link to="/#pricing" className="btn btn--green btn--sm">Renew Plan</Link>
          )}
          {!enrollment && isActive && (
            <Link to="/enroll" className="btn btn--green btn--sm">Enroll Now</Link>
          )}
          <Link to="/courses" className="btn btn--ghost btn--sm">
            <BookOpen size={14} aria-hidden="true" /> Browse Courses
          </Link>
          <Link to="/ai-tutor" className="btn btn--green btn--sm">
            <Sparkles size={14} aria-hidden="true" /> Ask AI Tutor
          </Link>
        </div>
      </div>

      {/* ── Dashboard data error banner ─────────────────────── */}
      {!!error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: 'var(--color-warning-surface)', border: '1px solid var(--color-warning-border)',
          borderRadius: 10, marginBottom: 18, fontSize: '0.875rem', color: 'var(--color-warning-text)',
        }}>
          <span>⚠</span>
          <span style={{ flex: 1 }}>Some dashboard data couldn&apos;t be loaded.</span>
          <button
            type="button"
            className="btn btn--sm"
            style={{ background: 'var(--color-warning)', color: '#fff', borderRadius: 6, padding: '5px 12px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}
            onClick={() => refetch()}
          >
            Try again
          </button>
        </div>
      )}

      {/* ── Expired banner ──────────────────────────────────── */}
      {!isActive && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
          background: 'var(--color-danger-surface)', border: '1px solid var(--color-danger-border)',
          borderRadius: 10, marginBottom: 18, fontSize: '0.875rem', color: 'var(--color-danger-text)',
        }}>
          <span>⚠</span>
          <span style={{ flex: 1 }}>Your subscription has expired. Your learning progress is saved.</span>
          <Link to="/#pricing" className="btn btn--sm" style={{ background: 'var(--color-danger)', color: '#fff', borderRadius: 6, padding: '5px 12px', fontSize: '0.78rem', fontWeight: 700 }}>
            Renew
          </Link>
        </div>
      )}

      {/* ── Days warning ────────────────────────────────────── */}
      {isActive && daysWarn && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
          background: 'var(--color-warning-surface)', border: '1px solid var(--color-warning-border)',
          borderRadius: 10, marginBottom: 18, fontSize: '0.82rem', color: 'var(--color-warning-text)',
        }}>
          ⏰ Your plan expires in <strong>{days} day{days !== 1 ? 's' : ''}</strong> — renew to keep learning uninterrupted.
          <Link to="/#pricing" style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--color-warning-text)', textDecoration: 'underline' }}>Renew</Link>
        </div>
      )}

      {/* ── Spiritual Pulse + Smart Planner (main) / Daily Wisdom + Hifz + Upcoming (side) ── */}
      <div className="ds-grid ds-grid-main-side" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <SpiritualPulseCard t={t} lang={lang} />
          <SmartPlannerCard t={t} classes={classes} classesLoading={classesLoading} userId={user?._id} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <DailyWisdomCard t={t} />
          {firstCourse && (
            <HifzProgressCard t={t} firstCourse={firstCourse} firstProgress={firstProgress} overallPct={overallPct} />
          )}
          <div className="ds-card">
            <div className="ds-card__hd">
              <h2 className="ds-card__title">Upcoming</h2>
              <Link to="/calendar" className="ds-card__link">See all →</Link>
            </div>
            <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {classesLoading ? (
                <Skeleton height={40} radius="var(--radius-md)" />
              ) : classes.length === 0 ? (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No upcoming events</div>
              ) : (
                classes.slice(0, 2).map((cls) => (
                  <Link key={cls._id} to="/calendar" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
                    <div className="ds-date-badge" style={{ background: 'var(--color-primary-surface)', color: 'var(--color-primary)' }}>
                      <span className="ds-date-badge__month">{new Date(cls.startsAt).toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}</span>
                      <span className="ds-date-badge__day">{new Date(cls.startsAt).getDate()}</span>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cls.title}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{fmtTime(cls.startsAt)}</div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Ongoing Study banner ─────────────────────────────── */}
      {firstCourse && (
        <div className="ds-ongoing-banner" style={{ marginBottom: 20 }}>
          <div className="ds-ongoing-banner__tag">Ongoing Study</div>
          <h3 className="ds-ongoing-banner__title">{firstCourse.title}</h3>
          <div className="ds-ongoing-banner__bar">
            <div className="ds-bar"><div className="ds-bar__fill" style={{ width: `${overallPct}%` }} /></div>
            <span>{overallPct}% complete</span>
          </div>
          <Link to={`/courses/${firstCourse._id}`} className="btn btn--green ds-ongoing-banner__cta">
            <Play size={14} aria-hidden="true" /> Resume Learning
          </Link>
        </div>
      )}

      {/* ── KPI Stats ───────────────────────────────────────── */}
      <div className="ds-stats">
        <div className="ds-stat">
          <div className="ds-stat__top">
            <div className="ds-stat__icon ds-stat__icon--gold">
              <Flame size={18} aria-hidden="true" />
            </div>
            <span className={`ds-stat__trend ${streak > 0 ? 'ds-stat__trend--up' : 'ds-stat__trend--neutral'}`}>
              {streak > 0 ? '↑' : '—'}
            </span>
          </div>
          <div className="ds-stat__value">{streakCount}</div>
          <div className="ds-stat__label">Day Streak</div>
          <div className="ds-stat__sub">Keep studying daily</div>
        </div>

        <div className="ds-stat" style={{ cursor: SHARE_MILESTONES.includes(overallPct) ? 'pointer' : 'default' }}
          onClick={() => overallPct > 0 && setShowShare(true)}
          title={overallPct > 0 ? 'Share your progress' : undefined}
          role={overallPct > 0 ? 'button' : undefined}
          tabIndex={overallPct > 0 ? 0 : undefined}
          onKeyDown={(e) => e.key === 'Enter' && overallPct > 0 && setShowShare(true)}
          aria-label={overallPct > 0 ? 'Share your course progress' : undefined}
        >
          <div className="ds-stat__top">
            <div className="ds-stat__icon ds-stat__icon--green">
              <TrendingUp size={18} aria-hidden="true" />
            </div>
            <span className="ds-stat__trend ds-stat__trend--up">{overallPct}%</span>
          </div>
          <div className="ds-stat__value">
            {progressCount}
            <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-secondary)' }}>%</span>
          </div>
          <div className="ds-stat__label">Progress</div>
          <div className="ds-stat__sub" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Course completion
            {overallPct > 0 && <span style={{ color: 'var(--color-primary)', fontSize: '0.7rem' }}>· Share 🔗</span>}
          </div>
        </div>

        <div className="ds-stat">
          <div className="ds-stat__top">
            <div className="ds-stat__icon ds-stat__icon--blue">
              <CalendarDays size={18} aria-hidden="true" />
            </div>
          </div>
          <div className="ds-stat__value">{typeof sessions === 'number' ? sessionsCount : sessions}</div>
          <div className="ds-stat__label">Weekly Sessions</div>
          <div className="ds-stat__sub">{sub?.plan || 'No active plan'}</div>
        </div>

        {/* XP / level stat */}
        <div className="ds-stat">
          <div className="ds-stat__top">
            <div className="ds-stat__icon ds-stat__icon--gold">
              <Zap size={18} aria-hidden="true" />
            </div>
            {(me?.level ?? 1) > 1 && (
              <span className="ds-stat__trend ds-stat__trend--up">Lv {me?.level}</span>
            )}
          </div>
          <div className="ds-stat__value">{xpCount}</div>
          <div className="ds-stat__label">XP Earned</div>
          <div className="ds-stat__sub">Level {me?.level ?? 1} · {20 - ((me?.xp ?? 0) % 20)} XP to next</div>
        </div>

        <div className="ds-stat">
          <div className="ds-stat__top">
            <div className={`ds-stat__icon${days !== null && days <= 7 ? ' ds-stat__icon--red' : ' ds-stat__icon--green'}`}>
              <Clock size={18} aria-hidden="true" />
            </div>
            {days !== null && days <= 7 && days > 0 && (
              <span className="ds-stat__trend ds-stat__trend--down">Renew soon</span>
            )}
          </div>
          {isActive ? (
            <>
              <div className="ds-stat__value" style={{ fontSize: days !== null && days > 30 ? '1.1rem' : undefined }}>
                {days !== null ? (days > 30 ? 'Active' : Math.max(days, 0)) : '—'}
              </div>
              <div className="ds-stat__label">{days !== null && days > 30 ? 'Plan Status' : 'Days Left'}</div>
              <div className="ds-stat__sub">
                {days !== null ? `${sub?.plan} · renews ${new Date(sub?.validUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : sub?.plan}
              </div>
            </>
          ) : (
            <>
              <div className="ds-stat__value" style={{ fontSize: '1rem', color: 'var(--color-danger)' }}>Inactive</div>
              <div className="ds-stat__label">Plan Status</div>
              <div className="ds-stat__sub">Renew to continue learning</div>
            </>
          )}
        </div>
      </div>

      {/* ── Badges ──────────────────────────────────────────── */}
      {(me?.badges?.length > 0) && (
        <div className="ds-card" style={{ marginBottom: 20 }}>
          <div className="ds-card__hd">
            <Trophy size={16} aria-hidden="true" /> Achievements
          </div>
          <div className="ds-card__body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {(me.badges || []).map((badge) => {
              const BADGE_META = {
                first_lesson: { emoji: '🌱', label: 'First Step' },
                level_5:      { emoji: '📚', label: 'Rising Scholar' },
                streak_7:     { emoji: '🔥', label: '7-Day Streak' },
                streak_30:    { emoji: '⭐', label: '30-Day Streak' },
              };
              const meta = BADGE_META[badge] || { emoji: '🏅', label: badge };
              return (
                <div key={badge} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  background: 'var(--color-primary-surface)', borderRadius: 12, padding: '10px 14px',
                  minWidth: 70, textAlign: 'center',
                }}>
                  <span style={{ fontSize: '1.6rem' }}>{meta.emoji}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{meta.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Getting Started onboarding (new users with no enrollment) ── */}
      {isActive && !enrollment && courses.length === 0 && (
        <div className="ds-card" style={{ marginBottom: 20, overflow: 'hidden' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--color-primary) 0%, #1a9e72 100%)',
            padding: '20px 24px 16px',
          }}>
            <div style={{ color: 'rgba(255,255,255,.7)', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              🚀 Getting Started
            </div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: '1.05rem' }}>Complete these steps to begin learning</div>
          </div>
          <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: '0 0 4px' }}>
            {[
              {
                done: true,
                icon: '✅',
                title: 'Create your account',
                sub: 'You\'re in! Your profile is set up.',
              },
              {
                done: false,
                icon: '📋',
                title: 'Complete enrollment',
                sub: 'Tell us your goals and choose a tutor.',
                action: { label: 'Enroll Now →', to: '/enroll' },
              },
              {
                done: false,
                icon: '📅',
                title: 'Book your free trial',
                sub: '2 free lessons with your assigned tutor — no commitment.',
                action: null,
              },
              {
                done: false,
                icon: '🎓',
                title: 'Start your first lesson',
                sub: 'Your journey to the Quran begins.',
                action: null,
              },
            ].map((step, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 24px',
                borderBottom: i < 3 ? '1px solid var(--border-subtle)' : 'none',
                opacity: step.done ? 0.6 : 1,
              }}>
                <div style={{
                  width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                  background: step.done ? 'var(--color-success-surface)' : 'var(--color-primary-surface)',
                  border: `2px solid ${step.done ? 'var(--color-success-border)' : 'var(--border-brand, rgba(11,110,79,.3))'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem',
                }}>
                  {step.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: step.done ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: step.done ? 'line-through' : 'none' }}>
                    {step.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>{step.sub}</div>
                </div>
                {step.action && (
                  <Link to={step.action.to} className="btn btn--green btn--sm" style={{ flexShrink: 0, borderRadius: 8, fontSize: '0.78rem' }}>
                    {step.action.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main grid: content + sidebar ────────────────────── */}
      <div className="ds-grid ds-grid-main-side" style={{ marginBottom: 20 }}>

        {/* LEFT — Continue learning + Courses + Weekly chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Continue learning */}
          {firstCourse && (
            <div className="ds-card">
              <div className="ds-card__hd">
                <h2 className="ds-card__title">
                  <span className="ds-card__title-icon"><Play size={14} aria-hidden="true" /></span> Continue Learning
                </h2>
                <Link to={`/courses/${firstCourse._id}`} className="ds-card__link">View all →</Link>
              </div>
              <div className="ds-card__body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 14, flexShrink: 0,
                    background: 'var(--color-primary-surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.6rem',
                  }}>
                    {firstCourse.icon || '📘'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 8 }}>
                      {firstCourse.title}
                    </div>
                    <div className="ds-bar" style={{ marginBottom: 6 }}>
                      <div className="ds-bar__fill" style={{ width: `${overallPct}%` }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      <span>{firstProgress?.done ?? 0} lessons done</span>
                      <span>{overallPct}% complete</span>
                    </div>
                  </div>
                  <ProgressRing value={overallPct} size={64} stroke={6} />
                </div>
                <Link
                  to={`/courses/${firstCourse._id}`}
                  className="btn btn--green"
                  style={{ width: '100%', marginTop: 14, justifyContent: 'center', borderRadius: 9 }}
                >
                  Continue →
                </Link>
              </div>
            </div>
          )}

          {/* My Courses */}
          {isActive && courses.length > 0 && (
            <div className="ds-card">
              <div className="ds-card__hd">
                <h2 className="ds-card__title">
                  <span className="ds-card__title-icon"><BookOpen size={14} aria-hidden="true" /></span> My Courses
                </h2>
              </div>
              <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {courses.map((c) => (
                  <CourseCard key={c._id} course={c} progress={c._id === firstCourse?._id ? firstProgress : null} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state: no courses */}
          {isActive && courses.length === 0 && (
            <div className="ds-card">
              <div className="ds-empty">
                <div className="ds-empty__icon">📚</div>
                <div className="ds-empty__title">Your courses are on their way</div>
                <div className="ds-empty__desc">Your tutor will assign your first lesson plan shortly after your trial session. In the meantime, explore our Quran reader and Islamic tools.</div>
                <Link to="/tools/quran-reader" className="btn btn--green btn--sm" style={{ marginTop: 12, borderRadius: 8 }}>
                  Open Quran Reader →
                </Link>
              </div>
            </div>
          )}

          {/* Weekly Activity */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <h2 className="ds-card__title">
                <span className="ds-card__title-icon"><BarChart2 size={14} aria-hidden="true" /></span> Weekly Activity
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Last 7 days</span>
            </div>
            <div className="ds-card__body">
              <WeeklyChart bars={weekBars} />
            </div>
          </div>

          {/* My Certificates */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <h2 className="ds-card__title">
                <span className="ds-card__title-icon"><GraduationCap size={14} aria-hidden="true" /></span> My Certificates
              </h2>
              {certificates.length > 0 && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{certificates.length} issued</span>
              )}
            </div>
            <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {certificatesLoading ? (
                <>
                  <Skeleton height={64} radius="var(--radius-md)" />
                  <Skeleton height={64} radius="var(--radius-md)" />
                </>
              ) : certificates.length === 0 ? (
                <div className="ds-empty" style={{ padding: '20px 0' }}>
                  <div className="ds-empty__icon" style={{ width: 40, height: 40, fontSize: '1.1rem' }}>🎓</div>
                  <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>No certificates yet</div>
                  <div className="ds-empty__desc" style={{ fontSize: '0.72rem' }}>Complete a course to earn your first certificate.</div>
                </div>
              ) : (
                certificates.map((cert) => (
                  <CertificateCard key={cert._id} cert={cert} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — Sidebar widgets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Streak widget — Duolingo-style */}
          {streak > 0 && (
            <div className="ds-streak">
              <div className="ds-streak__header">
                <span className="ds-streak__flame">🔥</span>
                <div className="ds-streak__body">
                  <div className="ds-streak__count">{streak} day streak!</div>
                  <div className="ds-streak__label">
                    {streak >= 100 ? 'Legendary consistency 🏆' : streak >= 30 ? 'Amazing dedication! 🥈' : streak >= 7 ? 'One week strong! 🥉' : 'Keep studying every day'}
                  </div>
                </div>
                {/* Milestone badge */}
                {streak >= 7 && (
                  <div className="ds-streak__badge" title={streak >= 100 ? '100-day streak' : streak >= 30 ? '30-day streak' : '7-day streak'}>
                    {streak >= 100 ? '🏆' : streak >= 30 ? '🥈' : '🥉'}
                  </div>
                )}
              </div>

              {/* Daily dots */}
              <div className="ds-streak__days">
                {weekBars.map((day) => (
                  <div key={day.date} className="ds-streak__day">
                    <div className={`ds-streak__dot${day.count > 0 ? ' ds-streak__dot--on' : ''}${day.isToday ? ' ds-streak__dot--today' : ''}`} />
                    <span className={`ds-streak__day-label${day.isToday ? ' ds-streak__day-label--today' : ''}`}>{day.label}</span>
                  </div>
                ))}
              </div>

              {/* Next milestone progress */}
              {streak < 100 && (() => {
                const next = streak < 7 ? 7 : streak < 30 ? 30 : 100;
                const prev = streak < 7 ? 0 : streak < 30 ? 7 : 30;
                const pct  = Math.round(((streak - prev) / (next - prev)) * 100);
                return (
                  <div className="ds-streak__milestone">
                    <div className="ds-streak__milestone-bar">
                      <div className="ds-streak__milestone-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="ds-streak__milestone-label">
                      {next - streak} day{next - streak !== 1 ? 's' : ''} to {next}-day badge {next >= 100 ? '🏆' : next >= 30 ? '🥈' : '🥉'}
                    </div>
                  </div>
                );
              })()}

              {/* Share streak */}
              {streak >= 7 && (
                <button
                  className="ds-streak__share-btn"
                  onClick={() => {
                    const txt = `🔥 I'm on a ${streak}-day Quran learning streak at Al-Rahma Academy! Alhamdulillah. Join me: al-rahma.academy`;
                    if (navigator.share) navigator.share({ title: `${streak}-day streak!`, text: txt }).catch(() => {});
                    else navigator.clipboard?.writeText(txt);
                  }}
                >
                  Share streak <span aria-hidden="true" dir="ltr">→</span>
                </button>
              )}
            </div>
          )}

          {/* Spaced repetition reminder */}
          {hifzDueCount > 0 && (
            <div className="ds-card" style={{ border: '1px solid var(--color-primary-border)', background: 'var(--color-primary-surface)' }}>
              <div className="ds-card__body" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>🧠</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      {hifzDueCount} verse{hifzDueCount !== 1 ? 's' : ''} due for review
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      Spaced repetition keeps your memorization sharp
                    </div>
                  </div>
                  <Link
                    to="/tools/quran-reader"
                    className="btn btn--green btn--sm"
                    style={{ flexShrink: 0, borderRadius: 8, fontSize: '0.75rem' }}
                  >
                    Review →
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Next class */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <h2 className="ds-card__title">
                <span className="ds-card__title-icon"><CalendarDays size={14} aria-hidden="true" /></span> Upcoming Classes
              </h2>
            </div>
            <div className="ds-card__body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {classesLoading ? (
                <>
                  <Skeleton height={48} radius="var(--radius-md)" />
                  <Skeleton height={48} radius="var(--radius-md)" />
                </>
              ) : classes.length === 0 ? (
                <div className="ds-empty" style={{ padding: '20px 0' }}>
                  <div className="ds-empty__icon" style={{ width: 40, height: 40, fontSize: '1.1rem' }}>📅</div>
                  <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>No upcoming classes</div>
                  <div className="ds-empty__desc" style={{ fontSize: '0.72rem' }}>Your teacher will schedule sessions soon.</div>
                </div>
              ) : (
                classes.slice(0, 3).map((cls) => (
                  <UpcomingClassCard key={cls._id} cls={cls} />
                ))
              )}
            </div>
          </div>

          {/* My Tutor */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <h2 className="ds-card__title">
                <span className="ds-card__title-icon"><GraduationCap size={14} aria-hidden="true" /></span> My Tutor
              </h2>
            </div>
            <div className="ds-card__body">
              {enrollment?.teacherName ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      background: 'var(--grad-green)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontWeight: 700, fontSize: '1.1rem', flexShrink: 0,
                    }}>
                      {enrollment.teacherName[0]}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        {enrollment.teacherName}
                      </div>
                      {enrollment.subjects?.length > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {enrollment.subjects.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Link
                      to="/messages"
                      className="btn btn--green btn--sm"
                      style={{ flex: 1, justifyContent: 'center', borderRadius: 8, fontSize: '0.82rem' }}
                    >
                      💬 Message
                    </Link>
                    <a
                      href={`mailto:${site.email}?subject=Tutor%20Change%20Request`}
                      className="btn btn--sm"
                      style={{ borderRadius: 8, fontSize: '0.78rem', background: 'var(--bg-page)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
                      title="Not the right fit? Change is free."
                    >
                      🔄 Change
                    </a>
                  </div>
                  <p style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 6, marginBottom: 0 }}>
                    Not the right fit? Request a free tutor change — we rematch within 48 h.
                  </p>
                  {user?.teacher && <TutorReviewWidget teacherId={user.teacher} />}
                </div>
              ) : (
                <div className="ds-empty" style={{ padding: '16px 0' }}>
                  <div className="ds-empty__icon" style={{ width: 40, height: 40, fontSize: '1.1rem' }}>👨‍🏫</div>
                  <div className="ds-empty__title" style={{ fontSize: '0.82rem' }}>Your tutor is being matched</div>
                  <div className="ds-empty__desc" style={{ fontSize: '0.72rem' }}>
                    Al-Azhar certified, identity-verified, background-checked. Safe for children. Assigned within 24 h.
                  </div>
                  {!enrollment && (
                    <Link to="/enroll" className="btn btn--green btn--sm" style={{ marginTop: 10, borderRadius: 8, fontSize: '0.78rem' }}>
                      Complete Enrollment →
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="ds-card">
            <div className="ds-card__hd">
              <h2 className="ds-card__title">
                <span className="ds-card__title-icon"><Zap size={14} aria-hidden="true" /></span> Quick Actions
              </h2>
            </div>
            <div className="ds-card__body">
              <div className="ds-quick-actions">
                <Link to="/messages" className="ds-quick-action">
                  <span className="ds-quick-action__icon"><MessageSquare size={16} aria-hidden="true" /></span>
                  <span className="ds-quick-action__label">Messages</span>
                </Link>
                <Link to="/tools/quran-reader" className="ds-quick-action">
                  <span className="ds-quick-action__icon"><Book size={16} aria-hidden="true" /></span>
                  <span className="ds-quick-action__label">Quran</span>
                </Link>
                <Link to="/billing" className="ds-quick-action">
                  <span className="ds-quick-action__icon"><CreditCard size={16} aria-hidden="true" /></span>
                  <span className="ds-quick-action__label">Billing</span>
                </Link>
                <Link to="/calendar" className="ds-quick-action">
                  <span className="ds-quick-action__icon"><CalendarDays size={16} aria-hidden="true" /></span>
                  <span className="ds-quick-action__label">Schedule</span>
                </Link>
                <a href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer" className="ds-quick-action">
                  <span className="ds-quick-action__icon"><MessageCircle size={16} aria-hidden="true" /></span>
                  <span className="ds-quick-action__label">WhatsApp</span>
                </a>
                <Link to="/tools/prayer-times" className="ds-quick-action">
                  <span className="ds-quick-action__icon"><Landmark size={16} aria-hidden="true" /></span>
                  <span className="ds-quick-action__label">Prayer Times</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Referral card */}
          <ReferralCard />

          {/* Schedule tip */}
          <div style={{
            padding: '12px 14px',
            background: 'var(--color-primary-surface)',
            border: '1px solid var(--color-primary-border)',
            borderRadius: 10,
            fontSize: '0.78rem',
            color: 'var(--text-secondary)',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <span style={{ flexShrink: 0 }}>🕒</span>
            <span>Session times are shown in your local timezone. To reschedule, message your tutor directly in <Link to="/messages" style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'underline' }}>Messages</Link>.</span>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
