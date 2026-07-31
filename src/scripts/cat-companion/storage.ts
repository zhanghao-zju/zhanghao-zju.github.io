// Versioned separately so this release starts visible even when v1 stored "hidden".
const HIDDEN_KEY = 'cat-companion:v2:hidden';
const SESSION_SEEN_KEY = 'cat-companion:v1:session-seen';
const DIALOGUE_HISTORY_KEY = 'cat-companion:v1:dialogue-history';
const RETURN_GREETING_KEY = 'cat-companion:v1:last-return-greeting';

export interface StoredDialogueHistory {
  recentIds: string[];
  lastShownById: Record<string, number>;
  lastShownByTrigger: Record<string, number>;
}

const getStorage = (kind: 'local' | 'session'): Storage | null => {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

const readStorageValue = (kind: 'local' | 'session', key: string): string | null => {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

export const readHiddenPreference = (): boolean | null => {
  const value = readStorageValue('local', HIDDEN_KEY);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
};

export const writeHiddenPreference = (hidden: boolean): void => {
  try {
    getStorage('local')?.setItem(HIDDEN_KEY, String(hidden));
  } catch {
    // The companion remains usable when storage is unavailable.
  }
};

export const markSessionSeen = (): boolean => {
  const storage = getStorage('session');
  if (!storage) return false;

  const wasSeen = readStorageValue('session', SESSION_SEEN_KEY) === 'true';
  try {
    storage.setItem(SESSION_SEEN_KEY, 'true');
  } catch {
    return wasSeen;
  }
  return wasSeen;
};

export const readDialogueHistory = (): StoredDialogueHistory | null => {
  const rawValue = readStorageValue('session', DIALOGUE_HISTORY_KEY);
  if (!rawValue) return null;

  try {
    const value = JSON.parse(rawValue) as Partial<StoredDialogueHistory>;
    if (
      !Array.isArray(value.recentIds) ||
      !value.recentIds.every((id) => typeof id === 'string') ||
      !value.lastShownById ||
      typeof value.lastShownById !== 'object' ||
      !value.lastShownByTrigger ||
      typeof value.lastShownByTrigger !== 'object'
    ) {
      return null;
    }

    const validTimestamps = (entries: Record<string, number>) =>
      Object.values(entries).every((timestamp) => Number.isFinite(timestamp) && timestamp >= 0);
    if (!validTimestamps(value.lastShownById) || !validTimestamps(value.lastShownByTrigger)) {
      return null;
    }

    return {
      recentIds: value.recentIds.slice(0, 5),
      lastShownById: value.lastShownById,
      lastShownByTrigger: value.lastShownByTrigger,
    };
  } catch {
    return null;
  }
};

export const writeDialogueHistory = (history: StoredDialogueHistory): void => {
  try {
    getStorage('session')?.setItem(DIALOGUE_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Dialogue selection falls back to in-memory history when storage is unavailable.
  }
};

export const readLastReturnGreetingAt = (): number => {
  const rawValue = readStorageValue('session', RETURN_GREETING_KEY);
  if (!rawValue) return 0;
  const timestamp = Number(rawValue);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
};

export const writeLastReturnGreetingAt = (timestamp: number): void => {
  try {
    getStorage('session')?.setItem(RETURN_GREETING_KEY, String(timestamp));
  } catch {
    // The in-memory cooldown remains active for the current document.
  }
};
