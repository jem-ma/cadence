import { useMemo, useState } from 'react';
import { useStore } from '../lib/store.jsx';
import { useSheets } from '../App.jsx';
import { Empty, Seg } from '../components/ui.jsx';
import { formatDate, formatDuration } from '../shared/dates.js';
import { fmtDist, paceLabel } from '../shared/units.js';
import { ACTIVITY_ORDER, isDistanceType, typeNoun, typePlural } from '../shared/activities.js';

/** This challenge's activities as blocks. Click one to edit, exclude or delete it. */
export function ActivityHistory() {
  const { data, challenge } = useStore();
  const { open } = useSheets();
  const [filter, setFilter] = useState('all');
  const [limit, setLimit] = useState(12);
  const counted = ACTIVITY_ORDER.filter((t) => (challenge.activityTypes || ['run', 'walk']).includes(t));
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
        {counted.length > 1 && (
          <Seg
            value={filter}
            onChange={setFilter}
            ariaLabel="Filter activities"
            options={[{ value: 'all', label: 'All' }, ...counted.map((t) => ({ value: t, label: typePlural(t) }))]}
          />
        )}
      </div>
      {list.length === 0 ? (
        <Empty icon="run" title="No activities yet" />
      ) : (
        <ul className="history-list">
          {list.slice(0, limit).map((a) => (
            <li key={a.id}>
              <button className={`history-block ${a.excluded ? 'excluded' : ''}`} onClick={() => open('activity', { initial: a })} aria-label={`Edit ${typeNoun(a.type)} on ${formatDate(a.date)}`}>
                <i className={`dot ${a.type}`} />
                <span className="grow">
                  <span className="h-main">
                    {typeNoun(a.type)}
                    {isDistanceType(a.type) ? ` · ${fmtDist(a.distanceMi)}` : a.durationMin ? ` · ${formatDuration(a.durationMin)}` : ''}
                    {a.isBaseline && ' · opening balance'}
                    {a.excluded && (a.possibleDuplicateOf ? ' · possible duplicate, excluded' : ' · excluded')}
                  </span>
                  <span className="h-sub">
                    {[
                      formatDate(a.date, { short: true }),
                      a.startTime,
                      isDistanceType(a.type) && a.durationMin ? formatDuration(a.durationMin) : null,
                      isDistanceType(a.type) && a.durationMin && a.distanceMi && ['run', 'walk'].includes(a.type) ? paceLabel(a.durationMin / a.distanceMi) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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
