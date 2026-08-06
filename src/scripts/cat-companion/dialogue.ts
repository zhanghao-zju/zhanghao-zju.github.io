import type { PetLine, PetTrigger } from './types';
import { readDialogueHistory, writeDialogueHistory } from './storage';

const RECENT_LIMIT = 5;

const pathMatches = (pattern: string, pathname: string): boolean => {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return pathname.startsWith(pattern.slice(0, -1));
  return pattern === pathname;
};

export class DialoguePicker {
  #lines: PetLine[];
  #recentIds: string[] = [];
  #lastShownById = new Map<string, number>();
  #lastShownByTrigger = new Map<PetTrigger, number>();

  constructor(lines: PetLine[]) {
    this.#lines = lines;
    const history = readDialogueHistory();
    if (!history) return;

    const knownIds = new Set(lines.map((line) => line.id));
    this.#recentIds = history.recentIds.filter((id) => knownIds.has(id)).slice(0, RECENT_LIMIT);
    this.#lastShownById = new Map(
      Object.entries(history.lastShownById).filter(([id]) => knownIds.has(id)),
    );
    this.#lastShownByTrigger = new Map(
      Object.entries(history.lastShownByTrigger) as [PetTrigger, number][],
    );
  }

  pick(trigger: PetTrigger, pathname: string, now = Date.now()): PetLine | null {
    const eligible = this.#lines.filter((line) => {
      const lastShown = this.#lastShownById.get(line.id) ?? 0;
      return (
        line.trigger === trigger &&
        now - lastShown >= line.minIntervalMs &&
        line.paths.some((pattern) => pathMatches(pattern, pathname))
      );
    });

    if (!eligible.length) return null;

    const oldestShownAt = Math.min(
      ...eligible.map((line) => this.#lastShownById.get(line.id) ?? 0),
    );
    const candidates = eligible.filter(
      (line) => (this.#lastShownById.get(line.id) ?? 0) === oldestShownAt,
    );

    const totalWeight = candidates.reduce((sum, line) => sum + Math.max(1, line.weight), 0);
    let cursor = Math.random() * totalWeight;
    const selected =
      candidates.find((line) => {
        cursor -= Math.max(1, line.weight);
        return cursor <= 0;
      }) ?? candidates[0];

    this.#recentIds.unshift(selected.id);
    this.#recentIds = this.#recentIds.slice(0, RECENT_LIMIT);
    this.#lastShownById.set(selected.id, now);
    this.#lastShownByTrigger.set(trigger, now);
    writeDialogueHistory({
      recentIds: this.#recentIds,
      lastShownById: Object.fromEntries(this.#lastShownById),
      lastShownByTrigger: Object.fromEntries(this.#lastShownByTrigger),
    });
    return selected;
  }

  triggerElapsed(trigger: PetTrigger, now = Date.now()): number {
    return now - (this.#lastShownByTrigger.get(trigger) ?? 0);
  }
}

export const wait = (durationMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = window.setTimeout(resolve, durationMs);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
