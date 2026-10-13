import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { buildCoaching } from '../shared/coach.js';
import { toISODate } from '../shared/dates.js';

const Ctx = createContext(null);

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty */
  }
  if (!res.ok) {
    const err = new Error(json?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

function readSimulated() {
  try {
    return localStorage.getItem('cadence.simulatedNow') || '';
  } catch {
    return '';
  }
}

export function localNowString(d) {
  return `${toISODate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StoreProvider({ children }) {
  const [data, setData] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [error, setError] = useState(null);
  const [signedOut, setSignedOut] = useState(false);
  const [user, setUser] = useState(null);
  const [tick, setTick] = useState(0);
  const [simulated, setSimulatedState] = useState(readSimulated());
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api('/state');
      setData(r.data);
      setIntegrations(r.integrations);
      setError(null);
      setUser(r.user);
      setSignedOut(false);
    } catch (e) {
      if (e.status === 401) {
        setSignedOut(true);
        setData(null);
      }
      else setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => setTick((x) => x + 1), 60000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const now = useMemo(() => {
    if (simulated) {
      const d = new Date(simulated);
      if (!isNaN(d)) return d;
    }
    return new Date();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, simulated]);

  const setSimulated = (v) => {
    try {
      if (v) localStorage.setItem('cadence.simulatedNow', v);
      else localStorage.removeItem('cadence.simulatedNow');
    } catch {
      /* ignore */
    }
    setSimulatedState(v);
  };

  const notify = useCallback((message, kind = 'info') => {
    setToast({ message, kind, id: Date.now() });
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 3800 ? null : t)), 4000);
  }, []);

  const upsertLocal = (collection, doc) =>
    setData((d) => {
      const list = d[collection] || [];
      const i = list.findIndex((x) => x.id === doc.id);
      return { ...d, [collection]: i >= 0 ? list.map((x) => (x.id === doc.id ? doc : x)) : [...list, doc] };
    });

  const actions = useMemo(
    () => ({
      async create(collection, doc) {
        const saved = await api(`/${collection}`, { method: 'POST', body: doc });
        upsertLocal(collection, saved);
        return saved;
      },
      async update(collection, id, patch) {
        const saved = await api(`/${collection}/${encodeURIComponent(id)}`, { method: 'PUT', body: patch });
        upsertLocal(collection, saved);
        return saved;
      },
      async remove(collection, id) {
        await api(`/${collection}/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (collection === 'activities') await load();
        else setData((d) => ({ ...d, [collection]: d[collection].filter((x) => x.id !== id) }));
      },
      reload: load,
      async signOut() {
        await api('/auth/logout', { method: 'POST' });
        setData(null);
        setUser(null);
        setSignedOut(true);
      },
      setIntegrations,
    }),
    [load]
  );

  const derived = useMemo(() => {
    if (!data) return null;
    const profile = data.profile[0] || {};
    const challenge = data.challenges.find((c) => c.id === profile.activeChallengeId) || data.challenges[data.challenges.length - 1];
    const cal = {
      weekTemplate: data.calendar.find((c) => c.id === 'weekTemplate')?.template,
      dayOverrides: data.dayOverrides,
      events: data.events,
      cycle: data.cycle,
      plannedSessions: data.plannedSessions,
      dayPlans: data.dayPlans || [],
      personal: profile.personal,
    };
    const today = toISODate(now);
    const coaching = challenge
      ? buildCoaching(
          { challenge, activities: data.activities, energyLogs: data.energyLogs, foods: data.foods, cal, profile, recommendations: data.recommendations },
          now
        )
      : null;
    return { profile, challenge, cal, today, coaching };
  }, [data, now]);

  const value = { data, integrations, error, signedOut, user, now, simulated, setSimulated, actions, notify, toast, ...(derived || {}) };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
