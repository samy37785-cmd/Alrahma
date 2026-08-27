/**
 * CalendarPage — class scheduling calendar.
 * Month / Week / Day views. Timezone-aware. Works for all roles.
 * Teachers see all their classes; students see enrolled sessions; parents see child's schedule.
 */

import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import DashboardLayout from '../components/layout/DashboardLayout';
import { useAuth } from '../context/AuthContext';
import { useLang } from '../context/LangContext';
import { getClasses } from '../api/classApi';
import { mapLiveClassToEvent } from '../utils/calendarHelpers';
import {
  ChevronLeft, ChevronRight, Calendar, Clock, User, BookOpen,
  Video, MapPin, Plus, Check, X, AlertCircle, RefreshCw,
} from 'lucide-react';

/* ── Helpers ───────────────────────────────────────────────────── */
const VIEWS  = ['month', 'week', 'day'];
const COPY = {
  en: {
    calendar: 'Class Calendar', scheduledSessions: 'Your scheduled sessions', newSession: 'New Session',
    refresh: 'Refresh', previous: 'Previous', next: 'Next', today: 'Today', calendarView: 'Calendar view',
    month: 'Month', week: 'Week', day: 'Day', more: 'more', close: 'Close', time: 'Time',
    teacher: 'Teacher', platform: 'Platform', status: 'Status', joinSession: 'Join Session',
    completed: 'Completed', cancelled: 'Cancelled', scheduled: 'Scheduled',
    noSessions: 'No sessions scheduled for this day.', loadError: "Couldn't load your class schedule",
    tryAgain: 'Try again', thisMonth: 'This month', upcoming: 'Upcoming',
    quran: 'Quran', arabic: 'Arabic', islamic_studies: 'Islamic studies', tajweed: 'Tajweed', hifz: 'Hifz',
    minute: 'm', hour: 'h',
  },
  ar: {
    calendar: 'تقويم الحصص', scheduledSessions: 'حصصك المجدولة', newSession: 'حصة جديدة',
    refresh: 'تحديث', previous: 'السابق', next: 'التالي', today: 'اليوم', calendarView: 'عرض التقويم',
    month: 'الشهر', week: 'الأسبوع', day: 'اليوم', more: 'المزيد', close: 'إغلاق', time: 'الوقت',
    teacher: 'المعلم', platform: 'المنصة', status: 'الحالة', joinSession: 'انضم إلى الحصة',
    completed: 'مكتملة', cancelled: 'ملغاة', scheduled: 'مجدولة',
    noSessions: 'لا توجد حصص مجدولة لهذا اليوم.', loadError: 'تعذر تحميل جدول حصصك',
    tryAgain: 'حاول مرة أخرى', thisMonth: 'هذا الشهر', upcoming: 'القادمة',
    quran: 'القرآن', arabic: 'العربية', islamic_studies: 'الدراسات الإسلامية', tajweed: 'التجويد', hifz: 'الحفظ',
    minute: 'د', hour: 'س',
  },
  it: {
    calendar: 'Calendario delle lezioni', scheduledSessions: 'Le tue lezioni programmate', newSession: 'Nuova lezione',
    refresh: 'Aggiorna', previous: 'Precedente', next: 'Successivo', today: 'Oggi', calendarView: 'Vista calendario',
    month: 'Mese', week: 'Settimana', day: 'Giorno', more: 'altri', close: 'Chiudi', time: 'Orario',
    teacher: 'Insegnante', platform: 'Piattaforma', status: 'Stato', joinSession: 'Partecipa alla lezione',
    completed: 'Completata', cancelled: 'Annullata', scheduled: 'Programmata',
    noSessions: 'Non ci sono lezioni programmate per questo giorno.', loadError: 'Impossibile caricare il programma delle lezioni',
    tryAgain: 'Riprova', thisMonth: 'Questo mese', upcoming: 'In arrivo',
    quran: 'Corano', arabic: 'Arabo', islamic_studies: 'Studi islamici', tajweed: 'Tajwid', hifz: 'Memorizzazione',
    minute: 'm', hour: 'h',
  },
  es: {
    calendar: 'Calendario de clases', scheduledSessions: 'Tus clases programadas', newSession: 'Nueva clase',
    refresh: 'Actualizar', previous: 'Anterior', next: 'Siguiente', today: 'Hoy', calendarView: 'Vista de calendario',
    month: 'Mes', week: 'Semana', day: 'Día', more: 'más', close: 'Cerrar', time: 'Hora',
    teacher: 'Profesor', platform: 'Plataforma', status: 'Estado', joinSession: 'Unirse a la clase',
    completed: 'Completada', cancelled: 'Cancelada', scheduled: 'Programada',
    noSessions: 'No hay clases programadas para este día.', loadError: 'No se pudo cargar tu horario de clases',
    tryAgain: 'Intentar de nuevo', thisMonth: 'Este mes', upcoming: 'Próximas',
    quran: 'Corán', arabic: 'Árabe', islamic_studies: 'Estudios islámicos', tajweed: 'Taywid', hifz: 'Memorización',
    minute: 'min', hour: 'h',
  },
  de: {
    calendar: 'Unterrichtskalender', scheduledSessions: 'Deine geplanten Unterrichtsstunden', newSession: 'Neue Unterrichtsstunde',
    refresh: 'Aktualisieren', previous: 'Zurück', next: 'Weiter', today: 'Heute', calendarView: 'Kalenderansicht',
    month: 'Monat', week: 'Woche', day: 'Tag', more: 'mehr', close: 'Schließen', time: 'Uhrzeit',
    teacher: 'Lehrkraft', platform: 'Plattform', status: 'Status', joinSession: 'An Unterrichtsstunde teilnehmen',
    completed: 'Abgeschlossen', cancelled: 'Abgesagt', scheduled: 'Geplant',
    noSessions: 'Für diesen Tag sind keine Unterrichtsstunden geplant.', loadError: 'Dein Stundenplan konnte nicht geladen werden',
    tryAgain: 'Erneut versuchen', thisMonth: 'Dieser Monat', upcoming: 'Bevorstehend',
    quran: 'Koran', arabic: 'Arabisch', islamic_studies: 'Islamische Studien', tajweed: 'Tadschwīd', hifz: 'Auswendiglernen',
    minute: 'Min.', hour: 'Std.',
  },
  fr: {
    calendar: 'Calendrier des cours', scheduledSessions: 'Vos cours programmés', newSession: 'Nouveau cours',
    refresh: 'Actualiser', previous: 'Précédent', next: 'Suivant', today: "Aujourd’hui", calendarView: 'Vue du calendrier',
    month: 'Mois', week: 'Semaine', day: 'Jour', more: 'autres', close: 'Fermer', time: 'Heure',
    teacher: 'Enseignant', platform: 'Plateforme', status: 'Statut', joinSession: 'Rejoindre le cours',
    completed: 'Terminé', cancelled: 'Annulé', scheduled: 'Programmé',
    noSessions: 'Aucun cours n’est programmé pour ce jour.', loadError: 'Impossible de charger votre emploi du temps',
    tryAgain: 'Réessayer', thisMonth: 'Ce mois-ci', upcoming: 'À venir',
    quran: 'Coran', arabic: 'Arabe', islamic_studies: 'Études islamiques', tajweed: 'Tajwid', hifz: 'Mémorisation',
    minute: 'min', hour: 'h',
  },
};

const LOCALES = { en: 'en-US', ar: 'ar-EG', it: 'it-IT', es: 'es-ES', de: 'de-DE', fr: 'fr-FR' };

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate()  === b.getDate();
}

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0,0,0,0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function formatTime(iso, locale) {
  if (!iso) return '';
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
}

function formatDuration(start, end, c) {
  if (!start || !end) return '';
  const mins = Math.round((new Date(end) - new Date(start)) / 60000);
  if (mins < 60) return `${mins}${c.minute}`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}${c.hour} ${m}${c.minute}` : `${h}${c.hour}`;
}

const SESSION_COLORS = {
  quran:           { bg: '#dcfce7', border: '#16a34a', text: '#15803d' },
  arabic:          { bg: '#dbeafe', border: '#2563eb', text: '#1d4ed8' },
  islamic_studies: { bg: '#fef9c3', border: '#ca8a04', text: '#a16207' },
  tajweed:         { bg: '#fae8ff', border: '#a21caf', text: '#86198f' },
  hifz:            { bg: '#ffedd5', border: '#ea580c', text: '#c2410c' },
  default:         { bg: 'var(--bg-surface)', border: 'var(--border-default)', text: 'var(--text-primary)' },
};

function sessionColor(type) {
  return SESSION_COLORS[type] || SESSION_COLORS.default;
}

/* ── Real data: the live-class scheduling backend (LiveClass model),
   the same role-aware /api/classes endpoint Dashboard.jsx's "Upcoming
   Classes" card already consumes — this used to call a nonexistent
   /api/sessions endpoint and silently fall back to randomly-regenerated
   fake sessions/teachers on every request. ─────────────────────────── */
function useSessions() {
  const query = useQuery({
    queryKey: ['classes', 'calendar'],
    queryFn:  () => getClasses(),
    staleTime: 2 * 60 * 1000,
  });
  return {
    ...query,
    data: (query.data || []).map(mapLiveClassToEvent),
  };
}

/* ── Event pill ─────────────────────────────────────────────────── */
function EventPill({ ev, onClick, locale }) {
  const { bg, border, text } = sessionColor(ev.type);
  const isCompleted = ev.status === 'completed';
  const isCancelled = ev.status === 'cancelled';
  return (
    <button
      onClick={() => onClick(ev)}
      title={ev.title}
      style={{
        width: '100%', textAlign: 'start', border: `1px solid ${border}`,
        borderRadius: 5, background: isCancelled ? '#fee2e2' : bg,
        color: isCancelled ? '#b91c1c' : text,
        fontSize: '0.7rem', fontWeight: 600, padding: '2px 6px',
        cursor: 'pointer', fontFamily: 'var(--font-sans)',
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
        opacity: isCompleted || isCancelled ? 0.7 : 1,
        textDecoration: isCompleted || isCancelled ? 'line-through' : 'none',
        marginBottom: 2,
      }}
    >
      {formatTime(ev.start, locale)} {ev.title}
    </button>
  );
}

/* ── Event detail modal ─────────────────────────────────────────── */
function EventModal({ ev, onClose, c, locale }) {
  if (!ev) return null;
  const { bg, border, text } = sessionColor(ev.type);
  const statusIcon = ev.status === 'completed' ? <Check size={14} />
    : ev.status === 'cancelled' ? <X size={14} />
    : <Clock size={14} />;
  const statusLabel = c[ev.status] || c.scheduled;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ev.title}
    >
      <div
        style={{ background: 'var(--bg-surface)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400, boxShadow: 'var(--shadow-xl)', border: `2px solid ${border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <span style={{ display: 'inline-block', background: bg, color: text, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99, border: `1px solid ${border}`, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {c[ev.type] || ev.type?.replace(/_/g, ' ')}
            </span>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{ev.title}</h2>
          </div>
          <button onClick={onClose} aria-label={c.close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 4 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { Icon: Clock,    label: c.time,     value: `${formatTime(ev.start, locale)} – ${formatTime(ev.end, locale)} (${formatDuration(ev.start, ev.end, c)})` },
            { Icon: User,     label: c.teacher,  value: ev.teacher },
            { Icon: Video,    label: c.platform, value: ev.platform },
            { Icon: MapPin,   label: c.status,   value: statusLabel, extra: statusIcon },
          ].filter(r => r.value).map(({ Icon, label, value, extra }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={14} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
              </span>
              <div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {extra}{value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {ev.status === 'scheduled' && (
          <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
            <a
              href={ev.meetingUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flex: 1, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 0', textAlign: 'center', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'none', display: 'block' }}
            >
              {c.joinSession}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Month view ─────────────────────────────────────────────────── */
function MonthView({ year, month, sessions, onEventClick, c, locale }) {
  const today = new Date();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const sessionsByDay = useMemo(() => {
    const map = {};
    sessions.forEach((ev) => {
      const d = new Date(ev.start);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    });
    return map;
  }, [sessions]);

  return (
    <div>
      {/* Day header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
        {Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i)).map((d) => (
          <div key={d.toISOString()} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', padding: '6px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)}</div>
        ))}
      </div>
      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
        {Array.from({ length: totalCells }).map((_, i) => {
          const dayNum = i - firstDay + 1;
          if (dayNum < 1 || dayNum > daysInMonth) {
            return <div key={i} style={{ minHeight: 90, borderRadius: 8, background: 'var(--bg-page)', opacity: 0.3 }} />;
          }
          const cellDate = new Date(year, month, dayNum);
          const key = `${year}-${month}-${dayNum}`;
          const evs = (sessionsByDay[key] || []).sort((a, b) => new Date(a.start) - new Date(b.start));
          const isToday = isSameDay(cellDate, today);
          const isPast  = cellDate < today && !isToday;

          return (
            <div
              key={i}
              style={{
                minHeight: 90, borderRadius: 8, padding: '6px',
                background: isToday ? 'var(--color-primary-surface, #e6f4ef)' : 'var(--bg-surface)',
                border: isToday ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                opacity: isPast ? 0.65 : 1,
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--color-primary)' : 'var(--text-primary)', marginBottom: 4 }}>
                {dayNum}
              </div>
              {evs.slice(0, 3).map((ev) => <EventPill key={ev._id} ev={ev} onClick={onEventClick} locale={locale} />)}
              {evs.length > 3 && (
                <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, paddingInlineStart: 4 }}>+{evs.length - 3} {c.more}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Week view ──────────────────────────────────────────────────── */
function WeekView({ weekStart, sessions, onEventClick, locale }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  const HOURS = Array.from({ length: 14 }, (_, i) => i + 7); // 7am–8pm

  function getEventsForDay(date) {
    return sessions.filter((ev) => isSameDay(new Date(ev.start), date))
      .sort((a, b) => new Date(a.start) - new Date(b.start));
  }

  function topPercent(iso) {
    const d = new Date(iso);
    const mins = (d.getHours() - 7) * 60 + d.getMinutes();
    return Math.max(0, (mins / (14 * 60)) * 100);
  }

  function heightPercent(start, end) {
    const mins = (new Date(end) - new Date(start)) / 60000;
    return Math.max(2, (mins / (14 * 60)) * 100);
  }

  const totalH = 560;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 680 }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', borderBottom: '1px solid var(--border-default)', marginBottom: 4 }}>
          <div />
          {days.map((d, i) => {
            const isToday = isSameDay(d, today);
            return (
              <div key={i} style={{ textAlign: 'center', padding: '8px 4px', fontSize: '0.78rem' }}>
                <div style={{ color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em' }}>{new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d)}</div>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color: isToday ? 'var(--color-primary)' : 'var(--text-primary)', width: 30, height: 30, borderRadius: '50%', background: isToday ? 'var(--color-primary-surface, #e6f4ef)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '2px auto 0' }}>{new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(d)}</div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', position: 'relative', height: totalH }}>
          {/* Hour labels */}
          <div style={{ position: 'relative' }}>
            {HOURS.map((h, i) => (
              <div key={h} style={{ position: 'absolute', top: `${(i / 14) * 100}%`, fontSize: '0.65rem', color: 'var(--text-secondary)', fontWeight: 600, lineHeight: 1, paddingInlineEnd: 6, textAlign: 'end', width: '100%', transform: 'translateY(-50%)' }}>
                {new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(new Date(2023, 0, 1, h))}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d, i) => {
            const evs = getEventsForDay(d);
            return (
              <div key={i} style={{ position: 'relative', borderInlineStart: '1px solid var(--border-subtle)', height: totalH }}>
                {/* Hour lines */}
                {HOURS.map((_, hi) => (
                  <div key={hi} style={{ position: 'absolute', top: `${(hi / 14) * 100}%`, insetInlineStart: 0, insetInlineEnd: 0, borderTop: '1px solid var(--border-subtle)', opacity: 0.5 }} />
                ))}
                {/* Events */}
                {evs.map((ev) => {
                  const { bg, border: brd, text } = sessionColor(ev.type);
                  return (
                    <button
                      key={ev._id}
                      onClick={() => onEventClick(ev)}
                      style={{
                        position: 'absolute',
                        top: `${topPercent(ev.start)}%`,
                        height: `${heightPercent(ev.start, ev.end)}%`,
                        insetInlineStart: 2, insetInlineEnd: 2,
                        background: bg, border: `1px solid ${brd}`, color: text,
                        borderRadius: 5, padding: '2px 5px', textAlign: 'start',
                        fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer',
                        overflow: 'hidden', fontFamily: 'var(--font-sans)',
                        minHeight: 18,
                      }}
                    >
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                      <div style={{ fontSize: '0.6rem', opacity: 0.8 }}>{formatTime(ev.start, locale)}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Day view ───────────────────────────────────────────────────── */
function DayView({ date, sessions, onEventClick, c, locale }) {
  const evs = sessions
    .filter((ev) => isSameDay(new Date(ev.start), date))
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  if (evs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
        <Calendar size={40} style={{ margin: '0 auto 12px', opacity: 0.3 }} aria-hidden="true" />
        <div style={{ fontWeight: 600 }}>{c.noSessions}</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {evs.map((ev) => {
        const { bg, border: brd, text } = sessionColor(ev.type);
        return (
          <button
            key={ev._id}
            onClick={() => onEventClick(ev)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14, background: bg,
              border: `1px solid ${brd}`, borderRadius: 10, padding: '14px 16px',
              cursor: 'pointer', textAlign: 'start', fontFamily: 'var(--font-sans)',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ textAlign: 'center', minWidth: 54 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: 800, color: text }}>{formatTime(ev.start, locale)}</div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{formatDuration(ev.start, ev.end, c)}</div>
            </div>
            <div style={{ width: 2, alignSelf: 'stretch', background: brd, borderRadius: 2 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: text }}>{ev.title}</div>
              {ev.teacher && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}><User size={11} style={{ display: 'inline', marginInlineEnd: 3 }} aria-hidden="true" />{ev.teacher}</div>}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-page)', padding: '3px 8px', borderRadius: 99 }}>
              {c[ev.status] || ev.status}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Main CalendarPage
   ════════════════════════════════════════════════════════════════ */
export default function CalendarPage() {
  const { isTeacher } = useAuth();
  const { lang } = useLang();
  const c = COPY[lang] || COPY.en;
  const locale = LOCALES[lang] || LOCALES.en;
  const today = new Date();
  const [view,      setView]      = useState('month');
  const [cursor,    setCursor]    = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [weekStart, setWeekStart] = useState(startOfWeek(today));
  const [dayDate,   setDayDate]   = useState(today);
  const [selected,  setSelected]  = useState(null);

  const year  = cursor.getFullYear();
  const month = cursor.getMonth();

  const { data: sessions = [], isLoading, isError, refetch } = useSessions();
  const monthSessions = useMemo(
    () => sessions.filter((ev) => {
      const d = new Date(ev.start);
      return d.getFullYear() === year && d.getMonth() === month;
    }),
    [sessions, year, month],
  );

  /* Navigation */
  const prev = useCallback(() => {
    if (view === 'month') setCursor(new Date(year, month - 1, 1));
    else if (view === 'week') setWeekStart((w) => addDays(w, -7));
    else setDayDate((d) => addDays(d, -1));
  }, [view, year, month]);

  const next = useCallback(() => {
    if (view === 'month') setCursor(new Date(year, month + 1, 1));
    else if (view === 'week') setWeekStart((w) => addDays(w, 7));
    else setDayDate((d) => addDays(d, 1));
  }, [view, year, month]);

  const goToday = useCallback(() => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setWeekStart(startOfWeek(now));
    setDayDate(now);
  }, []);

  const title = view === 'month'
    ? new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(cursor)
    : view === 'week'
    ? `${new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(weekStart)} – ${new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(addDays(weekStart, 6))}`
    : new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(dayDate);

  return (
    <DashboardLayout>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* ── Page header ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontWeight: 800, fontSize: '1.4rem', color: 'var(--text-primary)' }}>{c.calendar}</h1>
            <p style={{ margin: '2px 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{c.scheduledSessions}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isTeacher && (
              <button style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                <Plus size={14} aria-hidden="true" /> {c.newSession}
              </button>
            )}
            <button onClick={() => refetch()} aria-label={c.refresh} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <RefreshCw size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ── Toolbar ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={prev} aria-label={c.previous} style={{ width: 32, height: 32, border: '1px solid var(--border-default)', borderRadius: 7, background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', minWidth: 200, textAlign: 'center' }}>{title}</span>
            <button onClick={next} aria-label={c.next} style={{ width: 32, height: 32, border: '1px solid var(--border-default)', borderRadius: 7, background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
            <button onClick={goToday} style={{ padding: '6px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 7, fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>{c.today}</button>
          </div>

          {/* View switcher */}
          <div style={{ display: 'flex', background: 'var(--bg-page)', border: '1px solid var(--border-default)', borderRadius: 8, padding: 3, gap: 2 }} role="group" aria-label={c.calendarView}>
            {VIEWS.map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                style={{
                  padding: '5px 14px', border: 'none', borderRadius: 6, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  background: view === v ? 'var(--bg-surface)' : 'transparent',
                  color: view === v ? 'var(--color-primary)' : 'var(--text-secondary)',
                  boxShadow: view === v ? 'var(--shadow-sm)' : 'none',
                }}
              >
                {c[v]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Legend ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {Object.entries(SESSION_COLORS).filter(([k]) => k !== 'default').map(([type, col]) => (
            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: col.bg, border: `1px solid ${col.border}`, flexShrink: 0 }} />
               {c[type] || type.replace(/_/g, ' ')}
            </div>
          ))}
        </div>

        {/* ── Calendar area ────────────────────────────────────────── */}
        <div className="ds-card" style={{ padding: 16 }}>
          {isLoading ? (
            <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
              <RefreshCw size={24} style={{ animation: 'it-spin 1s linear infinite' }} aria-hidden="true" />
            </div>
          ) : isError ? (
            <div className="ds-empty" style={{ padding: '48px 0' }}>
              <div className="ds-empty__icon"><AlertCircle size={22} aria-hidden="true" /></div>
              <div className="ds-empty__title">{c.loadError}</div>
              <button type="button" className="btn btn--green btn--sm" style={{ marginTop: 12 }} onClick={() => refetch()}>
                {c.tryAgain}
              </button>
            </div>
          ) : view === 'month' ? (
            <MonthView year={year} month={month} sessions={sessions} onEventClick={setSelected} c={c} locale={locale} />
          ) : view === 'week' ? (
            <WeekView weekStart={weekStart} sessions={sessions} onEventClick={setSelected} locale={locale} />
          ) : (
            <DayView date={dayDate} sessions={sessions} onEventClick={setSelected} c={c} locale={locale} />
          )}
        </div>

        {/* ── Stats strip ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 10, marginTop: 16 }}>
          {[
            { label: c.thisMonth, value: monthSessions.length, icon: Calendar },
            { label: c.completed,  value: monthSessions.filter(e => e.status === 'completed').length, icon: Check },
            { label: c.upcoming,   value: monthSessions.filter(e => e.status === 'scheduled').length, icon: Clock },
            { label: c.cancelled,  value: monthSessions.filter(e => e.status === 'cancelled').length,  icon: X },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="ds-card" style={{ padding: '14px 16px', textAlign: 'center' }}>
              <Icon size={18} style={{ color: 'var(--color-primary)', marginBottom: 6 }} aria-hidden="true" />
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Event detail modal */}
      {selected && <EventModal ev={selected} onClose={() => setSelected(null)} c={c} locale={locale} />}
    </DashboardLayout>
  );
}
