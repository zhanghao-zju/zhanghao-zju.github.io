const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export class GazeController {
  #root: HTMLElement;
  #stage: HTMLElement;
  #reducedMotion: boolean;
  #active = false;
  #frame = 0;
  #targetX = 0;
  #targetY = 0;
  #currentX = 0;
  #currentY = 0;
  #lastPointerAt = 0;
  #bounds: DOMRect | null = null;

  constructor(root: HTMLElement, stage: HTMLElement, reducedMotion: boolean) {
    this.#root = root;
    this.#stage = stage;
    this.#reducedMotion = reducedMotion;
  }

  setReducedMotion(reducedMotion: boolean): void {
    this.#reducedMotion = reducedMotion;
    if (reducedMotion) this.stop();
  }

  updateBounds(): void {
    this.#bounds = this.#stage.getBoundingClientRect();
  }

  pointTo(clientX: number, clientY: number): void {
    if (this.#reducedMotion) return;
    if (!this.#bounds) this.updateBounds();
    const bounds = this.#bounds;
    if (!bounds) return;

    const centerX = bounds.left + bounds.width * 0.5;
    const centerY = bounds.top + bounds.height * 0.32;
    this.#targetX = clamp((clientX - centerX) / Math.max(bounds.width * 1.4, 1), -1, 1);
    this.#targetY = clamp((clientY - centerY) / Math.max(bounds.height * 1.3, 1), -1, 1);
    this.#lastPointerAt = performance.now();
    this.start();
  }

  lookCenter(): void {
    this.#targetX = 0;
    this.#targetY = -0.04;
    this.#lastPointerAt = performance.now();
    this.start();
  }

  start(): void {
    if (this.#active || this.#reducedMotion) return;
    this.#active = true;
    this.#frame = requestAnimationFrame(this.#tick);
  }

  stop(reset = true): void {
    this.#active = false;
    cancelAnimationFrame(this.#frame);
    if (reset) {
      this.#targetX = 0;
      this.#targetY = 0;
      this.#currentX = 0;
      this.#currentY = 0;
      this.#render();
    }
  }

  #tick = (now: number): void => {
    if (!this.#active) return;

    if (now - this.#lastPointerAt > 1600) {
      this.#targetX *= 0.96;
      this.#targetY *= 0.96;
    }

    this.#currentX += (this.#targetX - this.#currentX) * 0.12;
    this.#currentY += (this.#targetY - this.#currentY) * 0.12;
    this.#render();

    if (
      now - this.#lastPointerAt > 2_000 &&
      Math.abs(this.#currentX) < 0.002 &&
      Math.abs(this.#currentY) < 0.002 &&
      Math.abs(this.#targetX) < 0.002 &&
      Math.abs(this.#targetY) < 0.002
    ) {
      this.#active = false;
      return;
    }
    this.#frame = requestAnimationFrame(this.#tick);
  };

  #render(): void {
    this.#root.style.setProperty('--pet-gaze-x', `${(this.#currentX * 5).toFixed(2)}px`);
    this.#root.style.setProperty('--pet-gaze-y', `${(this.#currentY * 4).toFixed(2)}px`);
    this.#root.style.setProperty('--pet-asset-gaze-x', `${(this.#currentX * 1.1).toFixed(2)}px`);
    this.#root.style.setProperty('--pet-asset-gaze-y', `${(this.#currentY * 0.7).toFixed(2)}px`);
    this.#root.style.setProperty('--pet-gaze-nx', this.#currentX.toFixed(4));
    this.#root.style.setProperty('--pet-gaze-ny', this.#currentY.toFixed(4));
    this.#root.style.setProperty('--pet-head-turn', `${(this.#currentX * 2.25).toFixed(2)}deg`);
    this.#root.style.setProperty('--pet-head-lift', `${(this.#currentY * 1.25).toFixed(2)}px`);
    this.#root.style.setProperty(
      '--pet-body-follow-turn',
      `${(this.#currentX * 0.45).toFixed(2)}deg`,
    );
    this.#root.style.setProperty(
      '--pet-body-follow-lift',
      `${(this.#currentY * 0.3).toFixed(2)}px`,
    );
    this.#root.style.setProperty('--pet-book-turn', `${(this.#currentX * 1).toFixed(2)}deg`);
    this.#root.style.setProperty(
      '--pet-book-lift',
      `${(-Math.abs(this.#currentX) * 1.5).toFixed(2)}px`,
    );
  }
}
