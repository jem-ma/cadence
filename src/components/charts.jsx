import { useEffect, useRef, useState } from 'react';
import { formatDate, parseDate } from '../shared/dates.js';
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

const TYPE_COLOUR = { run: 'var(--run)', walk: 'var(--walk)', cycle: 'var(--cycle)', swim: 'var(--swim)', box: 'var(--box)' };

/** Daily distance for the whole challenge, scrolling horizontally. Completed bars are solid, stacked by activity; planned are dashed. */
export function DailyChart({ days, types, guide, guideLabel }) {
  const ref = useRef(null);
  const sum = (d) => types.reduce((t, k) => t + (d.parts[k] || 0), 0);
  const max = Math.max(guide || 0, ...days.map((d) => Math.max(sum(d), d.planned || 0)), 1) * 1.12;
  useEffect(() => {
    const el = ref.current;
    const t = el?.querySelector('.dc-col.today');
    if (el && t) el.scrollLeft = Math.max(0, t.offsetLeft - el.clientWidth / 2);
  }, []);
  return (
    <div className="dc-scroll" ref={ref}>
      <div className="dc-track">
        {guide > 0 && (
          <div className="dc-guide" style={{ bottom: `${34 + (guide / max) * 140}px` }} title={guideLabel}>
            <span>{guideLabel}</span>
          </div>
        )}
        {days.map((d) => {
          const total = sum(d);
          return (
            <div key={d.date} className={`dc-col ${d.isToday ? 'today' : ''} ${d.isPast ? 'past' : ''}`} title={`${formatDate(d.date)}: ${total ? `${dist(total)} ${unitShort()} done` : ''}${d.planned ? ` ${dist(d.planned)} ${unitShort()} planned` : ''}`}>
              <div className="dc-val num">{total ? dist(total) : d.planned ? dist(d.planned) : ''}</div>
              <div className="dc-bars">
                {total > 0 ? (
                  [...types].reverse().map((k) => (d.parts[k] > 0 ? <span key={k} style={{ height: `${(d.parts[k] / max) * 100}%`, background: TYPE_COLOUR[k] }} /> : null))
                ) : d.planned ? (
                  <span className="planned" style={{ height: `${(d.planned / max) * 100}%` }} />
                ) : null}
              </div>
              <div className="dc-day">
                <strong>{Number(d.date.slice(8))}</strong>
                <span>{'SMTWTFS'[parseDate(d.date).getDay()]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
