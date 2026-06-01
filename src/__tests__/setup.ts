// Test setup: provide a deterministic in-memory localStorage mock on both
// `window` and the global scope. happy-dom ships a localStorage, but we install
// our own simple mock so storage behavior is explicit and isolated per file.
import { vi } from 'vitest';

function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  } as Storage;
}

const localStorageMock = createLocalStorageMock();

vi.stubGlobal('localStorage', localStorageMock);
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  });
}
