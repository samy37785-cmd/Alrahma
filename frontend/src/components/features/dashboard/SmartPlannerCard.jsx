import { useState, useEffect } from 'react';
import { ListChecks, PenLine } from 'lucide-react';
import { Skeleton } from '../../ui/Skeleton';
import UpcomingClassCard from './UpcomingClassCard';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function SmartPlannerCard({ t, classes, classesLoading, userId }) {
  const habitsKey = `ds-habits:${userId}:${todayKey()}`;
  const reflectionKey = `ds-reflection:${userId}:${todayKey()}`;
  const tracksKey = `ds-custom-tracks:${userId}`;

  const [habits, setHabits] = useState(() => {
    try { return JSON.parse(localStorage.getItem(habitsKey) || '{}'); } catch { return {}; }
  });
  const [reflection, setReflection] = useState(() => {
    try { return localStorage.getItem(reflectionKey) || ''; } catch { return ''; }
  });
  const [customTracks, setCustomTracks] = useState(() => {
    try { return JSON.parse(localStorage.getItem(tracksKey) || '[]'); } catch { return []; }
  });
  const [addingTrack, setAddingTrack] = useState(false);
  const [newTrackLabel, setNewTrackLabel] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(habitsKey, JSON.stringify(habits)); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habits]);

  useEffect(() => {
    try { localStorage.setItem(tracksKey, JSON.stringify(customTracks)); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customTracks]);

  const toggleHabit = (key) => setHabits((h) => ({ ...h, [key]: !h[key] }));

  const addTrack = () => {
    const label = newTrackLabel.trim();
    if (!label) { setAddingTrack(false); return; }
    setCustomTracks((tr) => [...tr, { key: `custom-${Date.now()}`, label }]);
    setNewTrackLabel('');
    setAddingTrack(false);
  };

  const removeTrack = (key) => setCustomTracks((tr) => tr.filter((tk) => tk.key !== key));

  const saveReflection = () => {
    try { localStorage.setItem(reflectionKey, reflection); } catch { /* noop */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const todaysClasses = (classes || []).filter(
    (c) => new Date(c.startsAt).toDateString() === new Date().toDateString()
  );

  const HABITS = [
    { key: 'lesson', label: t.dashboard.plannerHabitLesson },
    { key: 'quran',  label: t.dashboard.plannerHabitQuran },
    { key: 'dua',    label: t.dashboard.plannerHabitDua },
    ...customTracks,
  ];
  const doneCount = HABITS.filter((h) => habits[h.key]).length;

  return (
    <div className="ds-card">
      <div className="ds-card__hd">
        <h2 className="ds-card__title">
          <span className="ds-card__title-icon"><ListChecks size={14} aria-hidden="true" /></span> {t.dashboard.plannerTitle}
        </h2>
      </div>
      <div className="ds-card__body">

        {/* Today's schedule */}
        <div className="ds-planner__section">
          <div className="ds-planner__section-title">{t.dashboard.plannerScheduleTitle}</div>
          {classesLoading ? (
            <Skeleton height={48} radius="var(--radius-md)" />
          ) : todaysClasses.length === 0 ? (
            <div className="ds-empty" style={{ padding: '12px 0' }}>
              <div className="ds-empty__desc" style={{ fontSize: '0.75rem' }}>{t.dashboard.plannerScheduleEmpty}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {todaysClasses.map((cls) => (
                <UpcomingClassCard key={cls._id} cls={cls} />
              ))}
            </div>
          )}
        </div>

        {/* Daily habits */}
        <div className="ds-planner__section">
          <div className="ds-planner__section-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t.dashboard.plannerHabitsTitle}</span>
            <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>{doneCount}/{HABITS.length} done</span>
          </div>
          {HABITS.map((h) => (
            <div key={h.key} className="ds-planner__habit-row">
              <label className={`ds-planner__habit${habits[h.key] ? ' ds-planner__habit--done' : ''}`}>
                <input
                  type="checkbox"
                  checked={!!habits[h.key]}
                  onChange={() => toggleHabit(h.key)}
                />
                {h.label}
              </label>
              {h.key.startsWith('custom-') && (
                <button type="button" className="ds-planner__habit-remove" onClick={() => removeTrack(h.key)} aria-label="Remove track">×</button>
              )}
            </div>
          ))}
          {addingTrack ? (
            <div className="ds-planner__add-track">
              <input
                type="text"
                autoFocus
                value={newTrackLabel}
                onChange={(e) => setNewTrackLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addTrack(); if (e.key === 'Escape') setAddingTrack(false); }}
                placeholder="New habit name…"
                maxLength={60}
              />
              <button type="button" className="btn btn--green btn--sm" style={{ borderRadius: 6, fontSize: '0.72rem' }} onClick={addTrack}>Add</button>
            </div>
          ) : (
            <button type="button" className="ds-planner__add-track-btn" onClick={() => setAddingTrack(true)}>
              + Add New Track
            </button>
          )}
        </div>

        {/* Daily reflection */}
        <div className="ds-planner__section">
          <div className="ds-planner__section-title">
            <PenLine size={12} aria-hidden="true" style={{ verticalAlign: -2, marginInlineEnd: 4 }} />
            {t.dashboard.plannerReflectionTitle}
          </div>
          <textarea
            className="ds-planner__textarea"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder={t.dashboard.plannerReflectionPlaceholder}
            rows={3}
          />
          <button
            type="button"
            className="btn btn--green btn--sm"
            style={{ marginTop: 8, borderRadius: 8, fontSize: '0.78rem' }}
            onClick={saveReflection}
          >
            {t.dashboard.plannerSave}
          </button>
          {saved && <div className="ds-planner__saved-note">{t.dashboard.plannerSaved}</div>}
        </div>

      </div>
    </div>
  );
}
