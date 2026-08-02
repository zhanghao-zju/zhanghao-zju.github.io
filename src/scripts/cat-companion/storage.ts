// Versioned separately so this release starts visible even when v1 stored "hidden".
const HIDDEN_KEY = 'cat-companion:v2:hidden';
const INTRODUCTION_SEEN_KEY = 'cat-companion:v1:introduction-seen';
const DIALOGUE_HISTORY_KEY = 'cat-companion:v1:dialogue-history';
const RETURN_GREETING_KEY = 'cat-companion:v1:last-return-greeting';
const POSITION_KEY = 'cat-companion:v1:position';
const GIANT_POSITION_KEY = 'cat-companion:v1:giant-position';
const SIZE_MODE_KEY = 'cat-companion:v1:size-mode';

export type PetSizeMode = 'normal' | 'giant';

export interface StoredPetPosition {
  x: number;
  y: number;
}

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

export const markIntroductionSeen = (): boolean => {
  const storage = getStorage('local');
  if (!storage) return false;

  const wasSeen = readStorageValue('local', INTRODUCTION_SEEN_KEY) === 'true';
  try {
    storage.setItem(INTRODUCTION_SEEN_KEY, 'true');
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

const positionKey = (mode: PetSizeMode): string =>
  mode === 'giant' ? GIANT_POSITION_KEY : POSITION_KEY;

export const readPetPosition = (mode: PetSizeMode = 'normal'): StoredPetPosition | null => {
  const rawValue = readStorageValue('session', positionKey(mode));
  if (!rawValue) return null;
  try {
    const value = JSON.parse(rawValue) as Partial<StoredPetPosition>;
    if (
      typeof value.x !== 'number' ||
      typeof value.y !== 'number' ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y)
    ) return null;
    return { x: value.x, y: value.y };
  } catch {
    return null;
  }
};

export const writePetPosition = (
  position: StoredPetPosition,
  mode: PetSizeMode = 'normal',
): void => {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
  try {
    getStorage('session')?.setItem(positionKey(mode), JSON.stringify(position));
  } catch {
    // Position falls back to the current document when session storage is unavailable.
  }
};

export const readPetSizeMode = (): PetSizeMode =>
  readStorageValue('session', SIZE_MODE_KEY) === 'giant' ? 'giant' : 'normal';

export const writePetSizeMode = (mode: PetSizeMode): void => {
  try {
    getStorage('session')?.setItem(SIZE_MODE_KEY, mode);
  } catch {
    // Size mode falls back to the current document when session storage is unavailable.
  }
};
