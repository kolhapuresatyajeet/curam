import { useState } from 'react';

export function CookieConsent() {
  const [ok, setOk] = useState(() => localStorage.getItem('curam-cookie') === '1');
  if (ok) return null;
  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      <p className="text-xs text-slate-600">This patient-facing page uses essential cookies only. Analytics (PostHog EU) is off until you accept.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="button button-primary button-sm"
          onClick={() => {
            localStorage.setItem('curam-cookie', '1');
            setOk(true);
          }}
        >
          Accept
        </button>
        <button type="button" className="button button-secondary button-sm" onClick={() => setOk(true)}>
          Essential only
        </button>
      </div>
    </div>
  );
}
