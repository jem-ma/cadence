import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { useSheets } from '../App.jsx';
import { Empty, Seg } from '../components/ui.jsx';
import { formatDate, formatDuration } from '../shared/dates.js';

/** Compact list of this challenge's activities. Tap one to edit, exclude or delete it. */
export function ActivityHistory() {
  const { data, challenge } = useStore();
  const { open } = useSheets();
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(12);
  const list = useMemo(
    () =>
      data.activities
        .filter((a) => !a.deleted && a.date >= challenge.startDate && a.date <= challenge.endDate)
        .filter((a) => filter === 'all' || a.type === filter)
        .sort((a, b) => (b.date + (b.startTime || '')).localeCompare(a.date + (a.startTime || ''))),
    [data.activities, filter, challenge]
  );

  return (
    <section className="card history">
      <div className="card-head wrap-head">
        <h3>Activity history</h3>
        <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'run', label: 'Runs' }, { value: 'walk', label: 'Walks' }]} />
      </div>
      {list.length === 0 ? (
        <Empty icon="run" title="No activities yet" />
      ) : (
        <ul className="history-list">
          {list.slice(0, limit).map((a) => (
            <li key={a.id}>
              <button className={a.excluded ? 'excluded' : ''} onClick={() => open('activity', { initial: a })}>
                <i className={`dot ${a.type}`} />
                <span className="grow">
                  <span className="h-main">
                    {a.type === 'run' ? 'Run' : 'Walk'} · {a.distanceMi} mi
                    {a.isBaseline && ' · opening balance'}
                    {a.excluded && (a.possibleDuplicateOf ? ' · possible duplicate, excluded' : ' · excluded')}
                  </span>
                  <span className="h-sub">
                    {[formatDate(a.date, { short: true }), a.startTime, a.durationMin ? formatDuration(a.durationMin) : null, a.durationMin && a.distanceMi ? `${paceStr(a.durationMin / a.distanceMi)}/mi` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > limit && (
        <button className="btn small ghost" style={{ marginTop: 6 }} onClick={() => setLimit(limit + 20)}>
          Show more ({list.length - limit})
        </button>
      )}
    </section>
  );
}

function paceStr(minPerMi) {
  const m = Math.floor(minPerMi);
  const s = Math.round((minPerMi - m) * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
