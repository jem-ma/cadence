import { createContext, useCallback, useContext, useState } from 'react';
import { useStore } from './lib/store.jsx';
import { Sheet } from './components/ui.jsx';
import { ActivityForm, EnergyForm, FoodForm, DayEditor, ChallengeForm } from './components/forms.jsx';
import Dashboard from './views/Today.jsx';
import { SettingsSheet } from './views/Settings.jsx';
import { PatternEditor } from './views/Calendar.jsx';
import { PlanDaySheet } from './components/PlanDaySheet.jsx';
import { AuthScreen } from './components/Auth.jsx';
import { Onboarding } from './components/Onboarding.jsx';

const SheetCtx = createContext(null);
export const useSheets = () => useContext(SheetCtx);

export default function App() {
  const { data, error, signedOut, toast, simulated, profile } = useStore();
  const [sheet, setSheet] = useState(null);
  const open = useCallback((type, props = {}) => setSheet({ type, props }), []);
  const close = useCallback(() => setSheet(null), []);

  if (signedOut) return (
    <>
      <AuthScreen />
      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`} role="status">{toast.message}</div>}
    </>
  );
  if (error && !data)
    return (
      <div className="lock">
        <div className="card" style={{ maxWidth: 420 }}>
          <h2>Can’t reach Cadence</h2>
          <p className="muted">{error}</p>
          <button className="btn primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );

  return (
    <SheetCtx.Provider value={{ open, close }}>
      <main className="main">
        {simulated && (
          <div className="chip warn" style={{ marginBottom: 12 }}>
            Simulated date/time: {simulated.replace('T', ' ')} — change in Settings
          </div>
        )}
        {!data ? <Loading /> : profile?.onboarded === false ? <Onboarding /> : <Dashboard />}
      </main>
      {sheet?.type === 'activity' && <ActivityForm {...sheet.props} onClose={close} />}
      {sheet?.type === 'energy' && <EnergyForm {...sheet.props} onClose={close} />}
      {sheet?.type === 'food' && <FoodForm {...sheet.props} onClose={close} />}
      {sheet?.type === 'day' && <DayEditor {...sheet.props} onClose={close} />}
      {sheet?.type === 'challenge' && <ChallengeForm {...sheet.props} onClose={close} />}
      {sheet?.type === 'settings' && <SettingsSheet onClose={close} />}
      {sheet?.type === 'planDay' && <PlanDaySheet {...sheet.props} onClose={close} />}
      {sheet?.type === 'pattern' && (
        <Sheet title="Weekly pattern" onClose={close} wide>
          <PatternEditor onClose={close} />
        </Sheet>
      )}
      {toast && (
        <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`} role="status" key={toast.id}>
          {toast.message}
        </div>
      )}
    </SheetCtx.Provider>
  );
}

function Loading() {
  return (
    <div className="stack" aria-busy="true">
      <div className="skeleton" style={{ height: 40, width: 220 }} />
      <div className="skeleton" style={{ height: 180 }} />
      <div className="skeleton" style={{ height: 260 }} />
    </div>
  );
}
