import { useEffect, useRef, useState } from 'react';
import { formatDate, parseDate, startOfWeek } from '../shared/dates.js';
import { dist, unitShort } from '../shared/units.js';

const W = 640;

export function WeeklyBars({ weeks, weeklyTarget, current }) {
  const max = Math.max(weeklyTarget || 0, ...weeks.map((w) => w.total + (w.planned || 0)), 1) * 1.1;
  const order = ['run', 'walk', 'cycle', 'swim'];
  return (
    <div>
      <div className="bars" style={{ position: 'relative' }}>
        {weeklyTarget > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(weeklyTarget / max) * 100}%`, borderTop: '1.5px dashed var(--target)' }} title={`Even pace ≈ ${dist(weeklyTarget)} ${unitShort()}/week`} />
        )}
        {weeks.map((w) => (
          <div key={w.weekStart} className="b" style={{ height: '100%' }} title={`${dist(w.total)} ${unitShort()}`}>
            {w.planned > 0 && <div style={{ height: `${(w.planned / max) * 100}%`, border: '1.5px dashed var(--run)', borderBottom: 'none', borderRadius: '6px 6px 0 0', opacity: 0.6 }} />}
            {[...order].reverse().map((t) => ((w.byType?.[t] ?? w[t] ?? 0) > 0 ? <div key={t} style={{ height: `${((w.byType?.[t] ?? w[t]) / max) * 100}%`, background: TYPE_COLOUR[t] }} /> : null))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {weeks.map((w) => (
          <div key={w.weekStart} style={{ flex: 1, textAlign: 'center', minWidth: 0 }} className="tiny faint">
            <div style={{ color: w.weekStart === current ? 'var(--ink)' : undefined, fontWeight: w.weekStart === current ? 600 : 400 }}>{formatDate(w.weekStart, { weekday: false, short: true })}</div>
            <div className="num">{dist(w.total + (w.planned || 0))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const OFF_LABEL = { unavailable: 'unavailable', rest: 'rest day', busy: 'busy' };
const TYPE_COLOUR = { run: 'var(--run)', walk: 'var(--walk)', cycle: 'var(--cycle)', swim: 'var(--swim)', box: 'var(--box)' };

/** Column geometry — keep in step with .dc-col (width) and .dc-track (gap) in styles.css. */
const COL = 46;
const GAP = 4;

/**
 * Daily distance for the whole challenge, scrolling horizontally and opening centred on today.
 * Completed bars are solid, stacked by activity; planned distance is dashed (on top of today's logged distance).
 * Below the days, a row of Mon–Sun weekly totals: logged so far plus what's still planned.
 */
export function DailyChart({ days, types, guide, guideLabel, onPick }) {
  const ref = useRef(null);
  const sum = (d) => types.reduce((t, k) => t + (d.parts[k] || 0), 0);
  const max = Math.max(guide || 0, ...days.map((d) => sum(d) + (d.planned || 0)), 1) * 1.12;
  useEffect(() => {
    const centre = () => {
      const el = ref.current;
      const t = el?.querySelector('.dc-col.today');
      if (el && t) el.scrollLeft = Math.max(0, t.offsetLeft + t.offsetWidth / 2 - el.clientWidth / 2);
    };
    centre();
    const raf = requestAnimationFrame(centre); // again once layout and fonts have settled
    window.addEventListener('resize', centre);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', centre);
    };
  }, []);

  const weeks = [];
  for (const d of days) {
    const ws = startOfWeek(d.date);
    let w = weeks.at(-1);
    if (!w || w.start !== ws) weeks.push((w = { start: ws, n: 0, done: 0, planned: 0, current: false }));
    w.n++;
    w.done += sum(d);
    w.planned += d.planned || 0;
    if (d.isToday) w.current = true;
  }

  return (
    <div className="dc-scroll" ref={ref}>
      <div className="dc-track">
        {guide > 0 && (
          <div className="dc-guide" style={{ bottom: `${48 + (guide / max) * 140}px` }} title={guideLabel}>
            <span>{guideLabel}</span>
          </div>
        )}
        {days.map((d) => {
          const total = sum(d);
          const mon = parseDate(d.date).getDay() === 1;
          return (
            <button
              type="button"
              key={d.date}
              className={`dc-col ${d.isToday ? 'today' : ''} ${d.isPast ? 'past' : ''} ${mon ? 'mon' : ''} ${d.off && d.off !== 'normal' ? 'off' : ''}`}
              onClick={() => onPick?.(d.date)}
              title={`${formatDate(d.date)}: ${total ? `${dist(total)} ${unitShort()} done` : ''}${d.planned ? ` ${dist(d.planned)} ${unitShort()} planned` : ''}${OFF_LABEL[d.off] ? ` (${OFF_LABEL[d.off]})` : ''}${d.period ? ' · period' : ''}`}
            >
              <div className="dc-val num">{total || d.planned ? dist(total + (d.planned || 0)) : ''}</div>
              <div className="dc-bars">
                {d.planned > 0 && <span className="planned" style={{ height: `${(d.planned / max) * 100}%` }} />}
                {[...types].reverse().map((k) => (d.parts[k] > 0 ? <span key={k} className="done" style={{ height: `${(d.parts[k] / max) * 100}%`, background: TYPE_COLOUR[k] }} /> : null))}
              </div>
              <div className="dc-day">
                <strong>{Number(d.date.slice(8))}</strong>
                <span>{'SMTWTFS'[parseDate(d.date).getDay()]}</span>
                {d.label && <em title={d.fullLabel}>{d.label}</em>}
                {d.period && <i className="pdot" title="Period" />}
              </div>
            </button>
          );
        })}
      </div>
      <div className="dc-weeks" aria-label="Weekly totals">
        {weeks.map((w) => (
          <div key={w.start} className={`dc-week ${w.current ? 'current' : ''}`} style={{ flexBasis: w.n * COL + (w.n - 1) * GAP }} title={`Week of ${formatDate(w.start, { year: false })}: ${dist(w.done)} ${unitShort()} logged, ${dist(w.planned)} ${unitShort()} still planned`}>
            <strong className="num">
              {dist(w.done + w.planned)} <small>{unitShort()}</small>
            </strong>
            <span className="num">
              {w.planned > 0 && w.done > 0 ? `${dist(w.done)} done · ${dist(w.planned)} to go` : w.planned > 0 ? 'planned' : 'done'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
