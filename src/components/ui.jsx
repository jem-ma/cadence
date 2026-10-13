import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { ACTIVITY_ORDER, ACTIVITY_TYPES } from '../shared/activities.js';

const P = {
  today: 'M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M19.1 19.1l-1.4-1.4M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  challenge: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  nutrition: 'M12 7c-1.5-3-5-3-6.5-1S4 12 6 16s4 5 6 4c2 1 4 0 6-4s2-8 .5-10S13.5 4 12 7Zm0 0c0-2 1-3.5 3-4',
  insights: 'M3 17l5-5 4 4 8-9M15 7h5v5',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7.4 3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 2h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  run: 'M13 4a2 2 0 1 0 4 0 2 2 0 0 0-4 0M7 21l3-6 3 2v5M5 11l3-3 4 1 3 4h4M10 15l-2-3',
  walk: 'M12 4a2 2 0 1 0 4 0 2 2 0 0 0-4 0M9 21l2-6 3 2 1 4M8 12l2-4 4 1 2 4M11 15l-1-3',
  food: 'M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-2 1-3 4-3 7h3v11',
  cycle: 'M2 17a3 3 0 1 0 6 0 3 3 0 1 0-6 0M16 17a3 3 0 1 0 6 0 3 3 0 1 0-6 0M5 17l4-8h6l4 8M9 9l3 8 3-8M7 6h3',
  swim: 'M14 6a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M4 12l5-3 4 3 3-2M2 16c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0M2 20c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0',
  box: 'M7 4h7a4 4 0 0 1 4 4v3a3 3 0 0 1-3 3H9v4a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM9 14v-3',
  energy: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4',
  refresh: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  info: 'M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  bag: 'M6 7h12l1 13H5L6 7Zm3 0a3 3 0 0 1 6 0',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z',
  chevronL: 'M15 6l-6 6 6 6',
  chevronR: 'M9 6l6 6-6 6',
  skip: 'M5 5l8 7-8 7V5ZM17 5v14',
  swap: 'M7 7h13l-3-3M17 17H4l3 3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10Z',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4V8Zm8 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
};

export function Icon({ name, ...rest }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name] || P.info} />
    </svg>
  );
}

export function Sheet({ title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector('input:not([type=hidden]),textarea,select');
    if (first && window.matchMedia('(min-width: 700px)').matches) first.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={wide ? { maxWidth: 720 } : undefined}>
        <div className="grab" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = 'Delete', danger = true, onConfirm, onClose }) {
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? 'primary' : 'primary'}`}
            style={danger ? { background: 'var(--warn)', borderColor: 'var(--warn)', color: '#fff' } : undefined}
            onClick={async () => {
              await onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Sheet>
  );
}

export function Field({ label, hint, error, children, className = '' }) {
  const id = useId();
  const isControl = isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type);
  const control = isControl ? cloneElement(children, { id: children.props.id || id, 'aria-invalid': error ? true : undefined }) : children;
  return (
    <div className={`field ${className}`}>
      {label && (isControl ? <label htmlFor={children.props.id || id}>{label}</label> : <span className="label">{label}</span>)}
      {control}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Seg({ value, onChange, options, full, ariaLabel }) {
  return (
    <div className={`seg ${full ? 'full' : ''}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button type="button" key={String(o.value)} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Scale({ value, onChange, low = 'Low', high = 'High', ariaLabel }) {
  return (
    <div>
      <div className="scale" role="radiogroup" aria-label={ariaLabel}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button type="button" key={n} role="radio" aria-checked={value === n} className={value === n ? 'on' : ''} onClick={() => onChange(value === n ? null : n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="scale-labels">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

export function Empty({ icon = 'info', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Banner({ kind = 'info', icon, children }) {
  return (
    <div className={`banner ${kind}`}>
      <Icon name={icon || (kind === 'warn' ? 'alert' : 'info')} />
      <div className="grow">{children}</div>
    </div>
  );
}

export const fmtMi = (n, d = 1) => (n == null || isNaN(n) ? '–' : Number(n).toFixed(d).replace(/\.0+$/, d ? '.0' : ''));
export const mi = (n) => `${Number(n || 0).toFixed(1)} mi`;

/** Multi-select filter pills for the activities a challenge counts. */
export function ActivityPills({ value, onChange }) {
  const toggle = (t) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t]);
  return (
    <div className="pills" role="group" aria-label="What counts">
      {ACTIVITY_ORDER.map((t) => (
        <button key={t} type="button" className={`pill ${value.includes(t) ? 'on' : ''}`} aria-pressed={value.includes(t)} onClick={() => toggle(t)}>
          <Icon name={t} width="15" height="15" />
          {ACTIVITY_TYPES[t].label}
        </button>
      ))}
    </div>
  );
}

/** mi / km switch used next to distance inputs. */
export function UnitSeg({ value, onChange }) {
  return <Seg value={value} onChange={onChange} ariaLabel="Distance unit" options={[{ value: 'mi', label: 'miles' }, { value: 'km', label: 'km' }]} />;
}
