import { useEffect, useRef, useState } from 'react';
import { formatDate, parseDate } from '../shared/dates.js';

const W = 640;

export function CumulativeChart({ series, target, height = 220, today, width = W }) {
  const [hover, setHover] = useState(null);
  if (!series?.length) return null;
  const H = height;
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const maxY = Math.max(target, ...series.map((s) => Math.max(s.actual || 0, s.planned || 0))) * 1.05;
  const x = (i) => pad.l + (i / (series.length - 1 || 1)) * (width - pad.l - pad.r);
  const y = (v) => H - pad.b - (v / maxY) * (H - pad.t - pad.b);
  const path = (key) =>
    series
      .map((s, i) => [i, s[key]])
      .filter(([, v]) => v != null)
      .map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
      .join(' ');
  const actualPts = series.map((s, i) => [i, s.actual]).filter(([, v]) => v != null);
  const area = actualPts.length
    ? `${path('actual')} L${x(actualPts[actualPts.length - 1][0])},${y(0)} L${x(actualPts[0][0])},${y(0)} Z`
    : '';
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(target * f));
  const xLabels = series.map((s, i) => [i, s.date]).filter(([i]) => i === 0 || i === series.length - 1 || (i + 1) % 7 === 0);
  const todayIdx = series.findIndex((s) => s.date === today);
  const h = hover != null ? series[hover] : null;

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    const i = Math.round(((px - pad.l) / (width - pad.l - pad.r)) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Cumulative distance against target" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchStart={(e) => onMove(e.touches[0] ? { clientX: e.touches[0].clientX, currentTarget: e.currentTarget } : e)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {xLabels.map(([i, d]) => (
          <text key={d} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}>
            {formatDate(d, { weekday: false, short: true })}
          </text>
        ))}
        {todayIdx >= 0 && <line x1={x(todayIdx)} x2={x(todayIdx)} y1={pad.t} y2={H - pad.b} stroke="var(--ink-3)" strokeDasharray="2 3" />}
        <path d={path('target')} fill="none" stroke="var(--target)" strokeWidth="1.5" />
        {area && <path d={area} fill="var(--run)" opacity="0.12" />}
        <path d={path('planned')} fill="none" stroke="var(--run)" strokeWidth="2" strokeDasharray="5 5" opacity="0.8" />
        <path d={path('actual')} fill="none" stroke="var(--run)" strokeWidth="2.5" strokeLinejoin="round" />
        {h && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--ink-2)" strokeWidth="1" />
            {h.actual != null && <circle cx={x(hover)} cy={y(h.actual)} r="4" fill="var(--run)" />}
            {h.planned != null && h.actual == null && <circle cx={x(hover)} cy={y(h.planned)} r="4" fill="var(--surface)" stroke="var(--run)" strokeWidth="2" />}
          </g>
        )}
      </svg>
      <div className="chart-tip">
        {h ? (
          <>
            <strong>{formatDate(h.date, { short: true })}</strong> · target line {h.target} mi
            {h.actual != null && <> · done {h.actual} mi{h.dayMi ? ` (+${h.dayMi} that day)` : ''}</>}
            {h.planned != null && h.actual == null && <> · planned {h.planned} mi</>}
          </>
        ) : (
          <div className="legend">
            <span>
              <i className="dot run" />
              Completed
            </span>
            <span>
              <i className="dot plan" />
              Realistic plan
            </span>
            <span>
              <i className="dot target" />
              Even pace to target
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function WeeklyBars({ weeks, weeklyTarget, current }) {
  const max = Math.max(weeklyTarget || 0, ...weeks.map((w) => w.total + (w.planned || 0)), 1) * 1.1;
  return (
    <div>
      <div className="bars" style={{ position: 'relative' }}>
        {weeklyTarget > 0 && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${(weeklyTarget / max) * 100}%`, borderTop: '1.5px dashed var(--target)' }} title={`Even pace ≈ ${weeklyTarget.toFixed(1)} mi/week`} />
        )}
        {weeks.map((w) => (
          <div key={w.weekStart} className="b" style={{ height: '100%' }} title={`${w.total} mi`}>
            {w.planned > 0 && <div style={{ height: `${(w.planned / max) * 100}%`, border: '1.5px dashed var(--run)', borderBottom: 'none', borderRadius: '6px 6px 0 0', opacity: 0.6 }} />}
            <div style={{ height: `${(w.walk / max) * 100}%`, background: 'var(--walk)', borderRadius: w.planned ? 0 : '6px 6px 0 0' }} />
            <div style={{ height: `${(w.run / max) * 100}%`, background: 'var(--run)' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {weeks.map((w) => (
          <div key={w.weekStart} style={{ flex: 1, textAlign: 'center', minWidth: 0 }} className="tiny faint">
            <div style={{ color: w.weekStart === current ? 'var(--ink)' : undefined, fontWeight: w.weekStart === current ? 600 : 400 }}>{formatDate(w.weekStart, { weekday: false, short: true })}</div>
            <div className="num">{(w.total + (w.planned || 0)).toFixed(1)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


/** Daily mileage for the whole challenge, scrolling horizontally. Completed bars are solid; planned are dashed. */
export function DailyChart({ days, guide, guideLabel }) {
  const ref = useRef(null);
  const max = Math.max(guide || 0, ...days.map((d) => Math.max(d.run + d.walk, d.planned || 0)), 1) * 1.12;
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
          const total = Math.round((d.run + d.walk) * 10) / 10;
          return (
            <div key={d.date} className={`dc-col ${d.isToday ? 'today' : ''} ${d.isPast ? 'past' : ''}`} title={`${formatDate(d.date)}: ${total ? `${total} mi done` : ''}${d.planned ? ` ${d.planned} mi planned` : ''}`}>
              <div className="dc-val num">{total ? total : d.planned ? d.planned : ''}</div>
              <div className="dc-bars">
                {total > 0 ? (
                  <>
                    <span style={{ height: `${(d.walk / max) * 100}%`, background: 'var(--walk)' }} />
                    <span style={{ height: `${(d.run / max) * 100}%`, background: 'var(--run)' }} />
                  </>
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
