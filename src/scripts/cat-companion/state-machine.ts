import type { PetState, StateLease } from './types';

const STATE_PRIORITY: Record<PetState, number> = {
  idle: 0,
  attentive: 10,
  speaking: 40,
  reacting: 60,
  playing: 70,
  sleepy: 20,
  hidden: 100,
};

export class PetStateMachine {
  #state: PetState = 'idle';
  #priority = STATE_PRIORITY.idle;
  #leaseId = 0;
  #onChange: (state: PetState) => void;

  constructor(onChange: (state: PetState) => void) {
    this.#onChange = onChange;
  }

  get state(): PetState {
    return this.#state;
  }

  acquire(state: PetState, priority = STATE_PRIORITY[state]): StateLease | null {
    if (this.#state === 'hidden' && state !== 'hidden') return null;
    if (priority < this.#priority && state !== this.#state) return null;

    const lease = { id: ++this.#leaseId, state, priority };
    this.#state = state;
    this.#priority = priority;
    this.#onChange(state);
    return lease;
  }

  release(lease: StateLease | null, fallback: PetState = 'idle'): void {
    if (!lease || lease.id !== this.#leaseId || this.#state === 'hidden') return;
    this.#state = fallback;
    this.#priority = STATE_PRIORITY[fallback];
    this.#onChange(fallback);
  }

  force(state: PetState): StateLease {
    const lease = { id: ++this.#leaseId, state, priority: STATE_PRIORITY[state] };
    this.#state = state;
    this.#priority = STATE_PRIORITY[state];
    this.#onChange(state);
    return lease;
  }
}
