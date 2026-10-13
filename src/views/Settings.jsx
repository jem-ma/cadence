import { useState } from 'react';
import { useStore, api, localNowString } from '../lib/store.jsx';
import { useSheets } from '../App.jsx';
import { Icon, Field, Banner, Seg, Sheet } from '../components/ui.jsx';
import { OtherChallenges } from './Insights.jsx';
import { DEFAULT_TRAINING } from '../shared/planner.js';
import { personalOf } from '../shared/schedule.js';
import { formatDate } from '../shared/dates.js';

export function SettingsSheet({ onClose }) {
  const { integrations } = useStore();
  return (
    <Sheet title="Settings" onClose={onClose} wide>
      <div className="stack" style={{ gap: 14 }}>
        <ChallengeSettings />
        <OtherChallenges />
        <Account />
        <Profile />
        <MyWeek />
        <Training />
        <NutritionPrefs />
        <AiCard status={integrations?.ai} />
        <DataCard />
        <Testing />
      </div>
    </Sheet>
  );
}

function ChallengeSettings() {
  const { challenge } = useStore();
  const { open } = useSheets();
  return (
    <section className="card">
      <div className="card-head">
        <h3>Current challenge</h3>
      </div>
      {challenge && (
        <p className="small">
          <strong>{challenge.name}</strong> — {challenge.targetMiles} miles, {formatDate(challenge.startDate, { short: true })} to {formatDate(challenge.endDate, { short: true })} ({(challenge.activityTypes || []).join(' + ')})
        </p>
      )}
      <div className="row">
        <button className="btn small" onClick={() => open('challenge', { initial: challenge })}>
          <Icon name="edit" /> Edit
        </button>
        <button className="btn small" onClick={() => open('challenge')}>
          <Icon name="plus" /> New challenge
        </button>
      </div>
      <p className="tiny faint" style={{ marginTop: 8 }}>
        Creating a new challenge keeps all previous challenges and logs; they are listed under Other challenges.
      </p>
    </section>
  );
}

function Profile() {
  const { profile, actions, notify } = useStore();
  const [name, setName] = useState(profile.name || '');
  return (
    <section className="card stack">
      <h3>Profile</h3>
      <Field label="Your first name (optional)">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div>
        <button
          className="btn small primary"
          onClick={async () => {
            await actions.update('profile', profile.id, { name: name.trim() });
            notify('Saved');
          }}
        >
          Save
        </button>
      </div>
    </section>
  );
}

function Account() {
  const { user, actions, notify } = useStore();
  const [cur, setCur] = useState('');
  const [nextPw, setNextPw] = useState('');
  const [delPw, setDelPw] = useState('');
  return (
    <section className="card stack">
      <div className="card-head" style={{ margin: 0 }}>
        <h3>Account</h3>
        <button className="btn small" onClick={() => actions.signOut()}>
          Sign out
        </button>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Signed in as <strong>{user?.email}</strong>
      </p>
      <details className="more">
        <summary>Change password</summary>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <Field label="Current password">
            <input className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
          </Field>
          <Field label="New password" hint="At least 10 characters.">
            <input className="input" type="password" autoComplete="new-password" value={nextPw} onChange={(e) => setNextPw(e.target.value)} />
          </Field>
        </div>
        <button
          className="btn small primary"
          style={{ marginTop: 8 }}
          onClick={async () => {
            try {
              await api('/account/password', { method: 'PUT', body: { current: cur, next: nextPw } });
              setCur('');
              setNextPw('');
              notify('Password changed');
            } catch (e) {
              notify(e.message, 'error');
            }
          }}
        >
          Change password
        </button>
      </details>
      <details className="more">
        <summary style={{ color: 'var(--warn)' }}>Delete account</summary>
        <p className="small">Permanently deletes your account and every log, challenge and calendar entry. Export your data first if you might want it. This can’t be undone.</p>
        <div className="row wrap">
          <input className="input" type="password" placeholder="Your password" autoComplete="current-password" value={delPw} onChange={(e) => setDelPw(e.target.value)} style={{ maxWidth: 220 }} />
          <button
            className="btn small danger"
            disabled={!delPw}
            onClick={async () => {
              if (!window.confirm('Delete your Cadence account and all of its data?')) return;
              try {
                await api('/account', { method: 'DELETE', body: { password: delPw } });
                window.location.reload();
              } catch (e) {
                notify(e.message, 'error');
              }
            }}
          >
            Delete my account
          </button>
        </div>
      </details>
    </section>
  );
}

function MyWeek() {
  const { profile, actions, notify } = useStore();
  const P = personalOf(profile);
  const [v, setV] = useState({ place: P.runFromPlace, commute: P.commuteWalkMi, extra: { ...P.extraWalk } });
  return (
    <section className="card stack">
      <h3>Your week details</h3>
      <p className="small muted" style={{ margin: 0 }}>
        Used by the planner on office and run-straight-after days. Times for each day are in the calendar’s weekly pattern.
      </p>
      <div className="form-grid">
        <Field label="Where you are on run-straight-after days" className="full">
          <input className="input" value={v.place} onChange={(e) => setV({ ...v, place: e.target.value })} placeholder="work" />
        </Field>
        <Field label="Commute walking on office days (mi)" hint="0 if none">
          <input className="input" inputMode="decimal" value={v.commute} onChange={(e) => setV({ ...v, commute: e.target.value })} />
        </Field>
      </div>
      <label className="row small">
        <input type="checkbox" checked={v.extra.enabled} onChange={(e) => setV({ ...v, extra: { ...v.extra, enabled: e.target.checked } })} /> Offer a longer walk on office days
      </label>
      {v.extra.enabled && (
        <div className="form-grid">
          <Field label="Describe it" className="full">
            <input className="input" value={v.extra.label} onChange={(e) => setV({ ...v, extra: { ...v.extra, label: e.target.value } })} />
          </Field>
          <Field label="Extra miles">
            <input className="input" inputMode="decimal" value={v.extra.mi} onChange={(e) => setV({ ...v, extra: { ...v.extra, mi: e.target.value } })} />
          </Field>
          <Field label="Takes (minutes)">
            <input className="input" inputMode="numeric" value={v.extra.min} onChange={(e) => setV({ ...v, extra: { ...v.extra, min: e.target.value } })} />
          </Field>
        </div>
      )}
      <div>
        <button
          className="btn small primary"
          onClick={async () => {
            const commute = Number(v.commute) || 0;
            const mi = Number(v.extra.mi) || 0;
            if (commute < 0 || mi < 0) return notify('Distances can’t be negative', 'error');
            await actions.update('profile', profile.id, {
              personal: { runFromPlace: v.place.trim() || 'work', commuteWalkMi: commute, extraWalk: { ...v.extra, mi, min: Number(v.extra.min) || Math.round(mi * 20), label: v.extra.label.trim() || 'Longer walk home' } },
            });
            notify('Saved — your plan has been updated');
          }}
        >
          Save
        </button>
      </div>
    </section>
  );
}

function Training() {
  const { profile, actions, notify } = useStore();
  const [t, setT] = useState({ ...DEFAULT_TRAINING, ...(profile.training || {}) });
  const num = (k, label, hint) => (
    <Field label={label} hint={hint}>
      <input className="input" inputMode="decimal" value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} />
    </Field>
  );
  return (
    <section className="card stack">
      <h3>Training preferences</h3>
      <p className="small muted" style={{ margin: 0 }}>
        The planner uses these as comfortable defaults and never jumps far beyond your recent runs.
      </p>
      <div className="form-grid">
        {num('easyRunMi', 'Easy run (mi)')}
        {num('lunchRunMi', 'Lunchtime run (mi)')}
        {num('nansRunMi', `Run from ${personalOf(profile).runFromPlace} (mi)`)}
        {num('easyRunMaxMi', 'Max weekday run (mi)')}
        {num('longRunMinMi', 'Long run from (mi)')}
        {num('longRunMaxMi', 'Long run up to (mi)')}
        {num('maxRunDaysPerWeek', 'Max run days / week')}
        {num('maxConsecutiveRunDays', 'Max days in a row')}
        {num('runPaceMin', 'Default run pace (min/mi)', 'Replaced by your logged pace')}
        {num('walkPaceMin', 'Default walk pace (min/mi)')}
      </div>
      <label className="row small">
        <input type="checkbox" checked={t.allowExtendedWalks} onChange={(e) => setT({ ...t, allowExtendedWalks: e.target.checked })} />
        Suggest “{personalOf(profile).extraWalk.label.toLowerCase()}” on office days
      </label>
      <div>
        <button
          className="btn small primary"
          onClick={async () => {
            const clean = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, typeof v === 'boolean' ? v : Number(v)]));
            if (Object.values(clean).some((v) => typeof v === 'number' && !(v > 0))) return notify('All values must be positive numbers', 'error');
            if (clean.longRunMaxMi < clean.longRunMinMi) return notify('Long-run range is the wrong way round', 'error');
            await actions.update('profile', profile.id, { training: clean });
            notify('Training preferences saved — plan updated');
          }}
        >
          Save
        </button>
      </div>
    </section>
  );
}

function NutritionPrefs() {
  const { profile, actions, notify } = useStore();
  const n = profile.nutrition || {};
  const [v, setV] = useState({
    diet: n.diet || '',
    allergies: (n.allergies || []).join(', '),
    dislikes: (n.dislikes || []).join(', '),
    budget: n.budget || 'moderate',
    maxCookMin: n.maxCookMin || 30,
    kcal: n.targets?.kcal || '',
    protein: n.targets?.protein || '',
    carbs: n.targets?.carbs || '',
    fat: n.targets?.fat || '',
    showNumbers: n.showNumbers !== false,
    pantry: (profile.pantry || []).join(', '),
  });
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const opt = (x) => (x === '' ? null : Number(x));
  return (
    <section className="card stack">
      <h3>Food preferences</h3>
      <div className="form-grid">
        <Field label="Diet">
          <select className="input" value={v.diet} onChange={set('diet')}>
            <option value="">No restrictions</option>
            <option value="vegetarian">Vegetarian</option>
            <option value="vegan">Vegan</option>
            <option value="pescatarian">Pescatarian</option>
          </select>
        </Field>
        <Field label="Max cooking time (min)">
          <input className="input" inputMode="numeric" value={v.maxCookMin} onChange={set('maxCookMin')} />
        </Field>
        <Field label="Allergies" className="full" hint="Comma-separated; excluded from suggestions">
          <input className="input" value={v.allergies} onChange={set('allergies')} />
        </Field>
        <Field label="Dislikes" className="full">
          <input className="input" value={v.dislikes} onChange={set('dislikes')} />
        </Field>
        <Field label="Budget">
          <Seg value={v.budget} onChange={(budget) => setV({ ...v, budget })} options={[{ value: 'tight', label: 'Tight' }, { value: 'moderate', label: 'Moderate' }, { value: 'flexible', label: 'Flexible' }]} />
        </Field>
      </div>
      <details className="more">
        <summary>Optional daily targets</summary>
        <div className="form-grid" style={{ marginTop: 10 }}>
          <Field label="Energy (kcal)">
            <input className="input" inputMode="numeric" value={v.kcal} onChange={set('kcal')} />
          </Field>
          <Field label="Protein (g)">
            <input className="input" inputMode="numeric" value={v.protein} onChange={set('protein')} />
          </Field>
          <Field label="Carbohydrate (g)">
            <input className="input" inputMode="numeric" value={v.carbs} onChange={set('carbs')} />
          </Field>
          <Field label="Fat (g)">
            <input className="input" inputMode="numeric" value={v.fat} onChange={set('fat')} />
          </Field>
        </div>
        <p className="tiny faint">Targets are for adequate fuelling, not restriction. Leave blank to skip.</p>
      </details>
      <Field label="Usually in your kitchen" hint="Comma-separated. Food suggestions favour these.">
        <textarea className="input" rows={2} value={v.pantry} onChange={set('pantry')} />
      </Field>
      <label className="row small">
        <input type="checkbox" checked={v.showNumbers} onChange={(e) => setV({ ...v, showNumbers: e.target.checked })} /> Show calorie and macro estimates
      </label>
      <div>
        <button
          className="btn small primary"
          onClick={async () => {
            await actions.update('profile', profile.id, {
              nutrition: {
                diet: v.diet,
                allergies: list(v.allergies),
                dislikes: list(v.dislikes),
                budget: v.budget,
                maxCookMin: Number(v.maxCookMin) || null,
                targets: { kcal: opt(v.kcal), protein: opt(v.protein), carbs: opt(v.carbs), fat: opt(v.fat) },
                showNumbers: v.showNumbers,
              },
              pantry: list(v.pantry),
            });
            notify('Food preferences saved');
          }}
        >
          Save
        </button>
      </div>
    </section>
  );
}

function AiCard({ status }) {
  if (!status) return null;
  return (
    <section className="card stack">
      <div className="card-head" style={{ margin: 0 }}>
        <h3>AI coach</h3>
        <span className={`chip ${status.enabled ? 'ok' : ''}`}>{status.enabled ? 'Enabled' : 'Not configured'}</span>
      </div>
      {status.enabled ? (
        <p className="small" style={{ margin: 0 }}>
          Using {status.model}. Each day it writes a short coach’s note from a summary of your challenge, plan, energy and food, and it estimates nutrition from what you log. All mileage maths stays in Cadence’s own planner. Each person gets a few notes and a few dozen food estimates per day.
          {status.lastError && <span style={{ color: 'var(--warn)' }}> Last error: {status.lastError.message}</span>}
        </p>
      ) : (
        <>
          <p className="small" style={{ margin: 0 }}>
            Your plan comes from Cadence’s built-in planner, which uses your real data. With AI switched on you also get a daily coach’s note and smarter food estimates.
          </p>
          <details className="more">
            <summary>How the app owner switches it on</summary>
            <ol className="small" style={{ paddingLeft: 18 }}>
              <li>
                Get an API key from <a href="https://platform.claude.com" target="_blank" rel="noreferrer">platform.claude.com</a>.
              </li>
              <li>
                Add it as an environment variable (Vercel project settings, or <span className="kbd">.env</span> locally): <pre className="code">ANTHROPIC_API_KEY=sk-ant-...</pre>
              </li>
              <li>Set a monthly spending limit in the same account, then redeploy. The key owner pays for everyone’s usage.</li>
            </ol>
          </details>
        </>
      )}
    </section>
  );
}

function DataCard() {
  const { actions, notify } = useStore();
  const [confirm, setConfirm] = useState('');
  return (
    <section className="card stack">
      <h3>Your data</h3>
      <p className="small muted" style={{ margin: 0 }}>
        Your data is private to your account. Nothing is shared with other services, except that when the AI coach is switched on, a summary of your day is sent to it to write your note.
      </p>
      <div className="row wrap">
        <a className="btn small" href="/api/export.json">
          <Icon name="download" /> Everything (JSON)
        </a>
        <a className="btn small" href="/api/export/activities.csv">
          Activities CSV
        </a>
        <a className="btn small" href="/api/export/foods.csv">
          Food CSV
        </a>
        <a className="btn small" href="/api/export/energy.csv">
          Wellbeing CSV
        </a>
      </div>
      <details className="more">
        <summary>Import from a Cadence export</summary>
        <p className="small">Replaces everything in this account with the contents of an export file — for example, moving from a copy running on your computer.</p>
        <label className="btn small" style={{ cursor: 'pointer' }}>
          Choose export file…
          <input
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files[0];
              e.target.value = '';
              if (!file) return;
              try {
                const parsed = JSON.parse(await file.text());
                if (!window.confirm('Replace all of this account’s data with that file?')) return;
                const r = await api('/import', { method: 'POST', body: { confirm: 'REPLACE', export: parsed } });
                await actions.reload();
                notify(`Imported ${r.counts.activities} activities and ${r.counts.foods} food entries`);
              } catch (err) {
                notify(err.message || 'Could not read that file', 'error');
              }
            }}
          />
        </label>
      </details>
      <details className="more">
        <summary style={{ color: 'var(--warn)' }}>Reset all data</summary>
        <p className="small">This deletes every log, challenge and calendar change and takes you back to first-run setup. Export first if you might need it. Type RESET to confirm.</p>
        <div className="row">
          <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="RESET" style={{ maxWidth: 140 }} />
          <button
            className="btn small danger"
            disabled={confirm !== 'RESET'}
            onClick={async () => {
              await api('/reset', { method: 'POST', body: { confirm } });
              await actions.reload();
              setConfirm('');
              notify('All data reset');
            }}
          >
            Reset
          </button>
        </div>
      </details>
    </section>
  );
}

function Testing() {
  const { simulated, setSimulated, now } = useStore();
  const [v, setV] = useState(simulated || localNowString(now));
  return (
    <section className="card stack">
      <h3>Preview another date</h3>
      <p className="small muted" style={{ margin: 0 }}>
        Cadence always uses your device’s real date and time. To preview how the coach behaves at another moment (e.g. a Wednesday morning), set a simulated time here. It only affects this browser.
      </p>
      <div className="row wrap">
        <input className="input" type="datetime-local" value={v} onChange={(e) => setV(e.target.value)} style={{ maxWidth: 240 }} />
        <button className="btn small" onClick={() => setSimulated(v)}>
          Simulate
        </button>
        {simulated && (
          <button className="btn small primary" onClick={() => setSimulated('')}>
            Back to real time
          </button>
        )}
      </div>
    </section>
  );
}
