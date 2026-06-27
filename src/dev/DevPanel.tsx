import React, { useState, useEffect, useCallback } from 'react';
import { useDevAccounts } from '../hooks/dev/useDevAccounts';
import { useDevLogin } from '../hooks/dev/useDevLogin';
import { getLogger } from '../utils/logging';

const logger = getLogger('DevPanel');

// ---------------------------------------------------------------------------
// IMPORTANT (agnosticism / fail-closed gating):
//
// This component reads NO env vars. It does NOT decide whether dev mode is on.
// It renders `null` unless the consumer explicitly passes `enabled={true}`.
//
// The CONSUMER owns the dev/prod gate and is responsible for fail-closed
// gating, e.g.:
//
//   const devMode = process.env.NODE_ENV !== 'production';
//   <DevPanel enabled={devMode} />
//
// The underlying endpoints must ALSO be gated server-side by the consumer —
// `enabled` only controls rendering, not access.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'fsdk-dev-panel-open';
const STYLE_ID = 'fsdk-dev-panel-styles';

const DEV_PANEL_CSS = `
.fsdk-dev-panel {
  position: fixed;
  bottom: 16px;
  left: 16px;
  z-index: var(--fsdk-dev-z-index, 99999);
  font-family: var(--fsdk-dev-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
  font-size: 13px;
  color: #f3f4f6;
}
.fsdk-dev-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #111827;
  color: #f9fafb;
  border: 1px solid #374151;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  user-select: none;
  line-height: 1;
}
.fsdk-dev-pill:hover { background: #1f2937; }
.fsdk-dev-pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #22c55e;
  flex-shrink: 0;
}
.fsdk-dev-card {
  width: 260px;
  background: #111827;
  border: 1px solid #374151;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}
.fsdk-dev-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #1f2937;
  border-bottom: 1px solid #374151;
}
.fsdk-dev-card-title {
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}
.fsdk-dev-card-min {
  background: none;
  border: none;
  color: #9ca3af;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
}
.fsdk-dev-card-min:hover { color: #f9fafb; background: #374151; }
.fsdk-dev-card-body { padding: 12px; }
.fsdk-dev-section-label {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 10px;
  color: #9ca3af;
  margin: 0 0 6px;
}
.fsdk-dev-select {
  width: 100%;
  box-sizing: border-box;
  background: #0b1220;
  color: #f3f4f6;
  border: 1px solid #374151;
  border-radius: 6px;
  padding: 7px 8px;
  font-size: 13px;
  margin-bottom: 8px;
}
.fsdk-dev-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.fsdk-dev-role {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 7px;
  border-radius: 999px;
  line-height: 1.4;
}
.fsdk-dev-role-admin { background: #7c2d12; color: #fdba74; }
.fsdk-dev-role-user { background: #1e3a8a; color: #93c5fd; }
.fsdk-dev-btn {
  width: 100%;
  box-sizing: border-box;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.fsdk-dev-btn:hover:not(:disabled) { background: #1d4ed8; }
.fsdk-dev-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.fsdk-dev-status {
  margin: 8px 0 0;
  font-size: 12px;
}
.fsdk-dev-error { color: #fca5a5; }
.fsdk-dev-muted { color: #9ca3af; }
`;

function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = DEV_PANEL_CSS;
  document.head.appendChild(style);
}

function readOpenState(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function persistOpenState(open: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // ignore storage failures
  }
}

function isAdminRole(role: string): boolean {
  return role.toLowerCase().includes('admin');
}

export interface DevPanelProps {
  /**
   * Whether the panel renders at all. The CONSUMER owns the dev/prod gate;
   * fsdk-ts reads no env. When false (or omitted) the panel renders null.
   */
  enabled?: boolean;
  /**
   * Optional router-aware navigation passed through to the quick-login. If
   * omitted, a successful login uses a full-page `window.location.assign`.
   */
  navigate?: (to: string) => void;
}

/**
 * Floating dev-mode quick-login panel.
 *
 * Renders null unless `enabled` is true. Collapsible to a pill; open/minimized
 * state is persisted in localStorage. On a successful quick-login it refreshes
 * the shared auth store (so the whole app reacts) and navigates to the returned
 * redirect.
 */
export function DevPanel({ enabled = false, navigate }: DevPanelProps): React.ReactElement | null {
  const [open, setOpen] = useState<boolean>(false);
  const [selected, setSelected] = useState<string>('');

  const { accounts, isLoading, error: accountsError, isEmpty } = useDevAccounts(enabled);
  const { login, isLoggingIn, error: loginError } = useDevLogin({ navigate });

  // Seed open/min state from localStorage on mount (client only — avoids SSR
  // hydration mismatch by starting closed, then syncing).
  useEffect(() => {
    if (!enabled) return;
    injectStyles();
    setOpen(readOpenState());
  }, [enabled]);

  // Default the selection to the first account once loaded.
  useEffect(() => {
    if (!selected && accounts.length > 0) {
      setSelected(accounts[0].email);
    }
  }, [accounts, selected]);

  const toggleOpen = useCallback((next: boolean) => {
    setOpen(next);
    persistOpenState(next);
  }, []);

  const handleLogin = useCallback(async () => {
    if (!selected) return;
    try {
      await login(selected);
    } catch {
      // error surfaced via loginError state
      logger.error('Quick login failed from panel');
    }
  }, [login, selected]);

  if (!enabled) return null;

  const selectedAccount = accounts.find((a) => a.email === selected);

  return (
    <div className="fsdk-dev-panel">
      {!open ? (
        <div
          className="fsdk-dev-pill"
          onClick={() => toggleOpen(true)}
          role="button"
          tabIndex={0}
          aria-label="Open dev panel"
        >
          <span className="fsdk-dev-pill-dot" />
          DEV
        </div>
      ) : (
        <div className="fsdk-dev-card">
          <div className="fsdk-dev-card-header">
            <span className="fsdk-dev-card-title">
              <span className="fsdk-dev-pill-dot" />
              Dev Panel
            </span>
            <button
              className="fsdk-dev-card-min"
              onClick={() => toggleOpen(false)}
              aria-label="Minimize dev panel"
            >
              &minus;
            </button>
          </div>

          <div className="fsdk-dev-card-body">
            <p className="fsdk-dev-section-label">Quick login</p>

            {isLoading && <p className="fsdk-dev-status fsdk-dev-muted">Loading accounts…</p>}

            {accountsError && (
              <p className="fsdk-dev-status fsdk-dev-error">{accountsError}</p>
            )}

            {!isLoading && !accountsError && isEmpty && (
              <p className="fsdk-dev-status fsdk-dev-muted">No dev accounts available.</p>
            )}

            {!isLoading && !accountsError && accounts.length > 0 && (
              <>
                <select
                  className="fsdk-dev-select"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  disabled={isLoggingIn}
                >
                  {accounts.map((acc) => (
                    <option key={acc.email} value={acc.email}>
                      {acc.name} — {acc.email}
                    </option>
                  ))}
                </select>

                {selectedAccount && (
                  <div className="fsdk-dev-row">
                    <span
                      className={`fsdk-dev-role ${
                        isAdminRole(selectedAccount.role)
                          ? 'fsdk-dev-role-admin'
                          : 'fsdk-dev-role-user'
                      }`}
                    >
                      {selectedAccount.role}
                    </span>
                  </div>
                )}

                <button
                  className="fsdk-dev-btn"
                  onClick={handleLogin}
                  disabled={isLoggingIn || !selected}
                >
                  {isLoggingIn ? 'Logging in…' : 'Login'}
                </button>
              </>
            )}

            {loginError && <p className="fsdk-dev-status fsdk-dev-error">{loginError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
