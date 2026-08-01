import rawLines from '../../data/pet-lines.zh-CN.json';
import { DialoguePicker, wait } from './dialogue';
import { GazeController } from './gaze';
import { PetStateMachine } from './state-machine';
import {
  readHiddenPreference,
  readLastReturnGreetingAt,
  readPetPosition,
  writeHiddenPreference,
  writeLastReturnGreetingAt,
  writePetPosition,
} from './storage';
import type { PetLine, PetMood, PetState, PetTrigger, SpeechRequest, StateLease } from './types';

const RETURN_MIN_AWAY_MS = 8_000;
const RETURN_LONG_AWAY_MS = 10 * 60_000;
const RETURN_COOLDOWN_MS = 60_000;
const TOY_DURATION_MS = 18_000;
const RAPID_CLICK_WINDOW_MS = 1_500;
const RAPID_CLICK_LIMIT = 4;
const RAPID_CLICK_COOLDOWN_MS = 4_000;
const IDLE_MIN_MS = 55_000;
const IDLE_JITTER_MS = 35_000;
const ARTICLE_TOC_OVERLAY_QUERY = '(max-width: 1050px)';

const lines = rawLines as PetLine[];

const required = <T extends Element>(root: ParentNode, selector: string): T => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Cat companion is missing ${selector}`);
  return element;
};

interface AssetManifest {
  schemaVersion: number;
  ready: boolean;
  canvas: { width: number; height: number; coordinateSpace: 'top-left' };
  displaySizes: Record<'desktop' | 'tablet' | 'mobile', { width: number; height: number }>;
  layers: {
    body: string;
    book: string;
    head: string;
    earLeft: string;
    earRight: string;
    eyeBases: { left: string; right: string };
    pupils: { left: string; right: string };
    eyelids: {
      half: { left: string; right: string };
      closed: { left: string; right: string };
    };
    mouths: { closed: string; small: string; open: string; smile: string };
    paw: string;
    tail: string;
    shadow: string;
  };
  bookMotion: {
    transformOrigin: { x: number; y: number };
    maxRotationDeg: number;
    maxLiftPx: number;
  };
  walk: {
    canvas: { width: number; height: number; coordinateSpace: 'top-left' };
    frames: string[];
    frameDurationMs: number;
  };
  arrival: {
    canvas: { width: number; height: number; coordinateSpace: 'top-left' };
    walkOffset: { x: number; y: number };
    frames: string[];
    durationsMs: number[];
    reducedMotionFadeMs: number;
  };
  anchors: {
    head: { x: number; y: number };
    earLeft: { x: number; y: number };
    earRight: { x: number; y: number };
    eyeLeft: { x: number; y: number };
    eyeRight: { x: number; y: number };
    paw: { x: number; y: number };
    tail: { x: number; y: number };
  };
  hitAreas: {
    nose: { shape: 'circle'; cx: number; cy: number; r: number };
  };
}

class CatCompanionController {
  #root: HTMLElement;
  #stage: HTMLElement;
  #character: HTMLElement;
  #bubble: HTMLElement;
  #bubbleText: HTMLElement;
  #liveRegion: HTMLElement;
  #toyButton: HTMLButtonElement;
  #hideButton: HTMLButtonElement;
  #recallButton: HTMLButtonElement;
  #toy: HTMLElement;
  #particles: HTMLElement;
  #assetRoot: HTMLElement | null;
  #walkRoot: HTMLElement;
  #assetLoadStarted = false;
  #walkFrames: HTMLImageElement[] = [];
  #arrivalFrames: HTMLImageElement[] = [];
  #walkFrameDurationMs = 135;
  #arrivalDurationsMs: number[] = [];
  #arrivalReducedMotionFadeMs = 190;
  #arrivalRunVersion = 0;
  #pendingArrival = false;
  #pendingRecallSpeech = false;
  #noseHitArea = { cx: 0.5, cy: 0.35, r: 0.085 };
  #pathname: string;
  #articleReadingMode = false;
  #mobileToc: HTMLDetailsElement | null = null;
  #hiddenForToc = false;
  #abort = new AbortController();
  #speechAbort: AbortController | null = null;
  #speechQueue: SpeechRequest[] = [];
  #speechRunning = false;
  #speechRunVersion = 0;
  #activeLine: PetLine | null = null;
  #dialogue = new DialoguePicker(lines);
  #machine: PetStateMachine;
  #gaze: GazeController;
  #reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  #coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  #hidden = false;
  #toyActive = false;
  #toyTimer = 0;
  #idleTimer = 0;
  #blinkTimer = 0;
  #earTimer = 0;
  #reactionTimer = 0;
  #scrollTimer = 0;
  #attentionTimer = 0;
  #touchToolbarTimer = 0;
  #hiddenAt = 0;
  #lastReturnGreetingAt = 0;
  #clickTimes: number[] = [];
  #interactionBlockedUntil = 0;
  #pointerInside = false;
  #focusInside = false;
  #scrolling = false;
  #touchPrimed = false;
  #lastToyPawAt = 0;
  #dragPointerId: number | null = null;
  #dragStartX = 0;
  #dragStartY = 0;
  #dragRootLeft = 0;
  #dragRootTop = 0;
  #dragThreshold = 6;
  #dragging = false;
  #suppressStageClickUntil = 0;
  #positionRestored = false;
  #safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

  constructor(root: HTMLElement) {
    this.#root = root;
    this.#stage = required(root, '[data-pet-stage]');
    this.#character = required(root, '[data-pet-character]');
    this.#bubble = required(root, '[data-pet-bubble]');
    this.#bubbleText = required(root, '[data-pet-bubble-text]');
    this.#liveRegion = required(root, '[data-pet-live]');
    required(root, '[data-pet-toolbar]');
    this.#toyButton = required(root, '[data-pet-action="toy"]');
    this.#hideButton = required(root, '[data-pet-action="hide"]');
    this.#recallButton = required(root, '[data-pet-recall]');
    this.#toy = required(root, '[data-pet-toy]');
    this.#particles = required(root, '[data-pet-particles]');
    this.#assetRoot = root.querySelector('[data-pet-asset-root]');
    this.#walkRoot = required(root, '[data-pet-walk-root]');
    this.#pathname = root.dataset.pagePath || window.location.pathname;
    this.#articleReadingMode = /^\/blog\/[^/]+\/?$/.test(this.#pathname);
    if (this.#articleReadingMode) {
      this.#root.dataset.pageContext = 'article';
      this.#mobileToc = document.querySelector<HTMLDetailsElement>('.article-toc-mobile');
    }
    this.#lastReturnGreetingAt = readLastReturnGreetingAt();
    this.#machine = new PetStateMachine((state) => this.#renderState(state));
    this.#gaze = new GazeController(root, this.#character, this.#reducedMotionQuery.matches);

    this.#bindEvents();
    this.#setInitialVisibility();
    this.#root.dataset.visible = 'true';
    this.#root.dataset.renderer = 'loading';
    this.#root.dataset.reducedMotion = String(this.#reducedMotionQuery.matches);
    this.#root.dataset.mouth = 'closed';
    this.#bubble.hidden = true;
    this.#measureSafeArea();
    requestAnimationFrame(() => this.#restorePosition());
    void this.#loadAssetRenderer();
  }

  destroy(): void {
    this.#abort.abort();
    this.#cancelSpeech();
    this.#gaze.stop();
    window.clearTimeout(this.#toyTimer);
    window.clearTimeout(this.#idleTimer);
    window.clearTimeout(this.#blinkTimer);
    window.clearTimeout(this.#earTimer);
    window.clearTimeout(this.#reactionTimer);
    window.clearTimeout(this.#scrollTimer);
    window.clearTimeout(this.#attentionTimer);
    window.clearTimeout(this.#touchToolbarTimer);
    this.#stopArrival();
  }

  #bindEvents(): void {
    const signal = this.#abort.signal;

    window.addEventListener('pointermove', this.#onPointerMove, { passive: true, signal });
    window.addEventListener('pointermove', this.#onDragPointerMove, { signal });
    window.addEventListener('pointerup', this.#onDragPointerUp, { signal });
    window.addEventListener('pointercancel', this.#onDragPointerCancel, { signal });
    window.addEventListener('resize', this.#onViewportChange, { passive: true, signal });
    window.visualViewport?.addEventListener('resize', this.#onViewportChange, { passive: true, signal });
    window.visualViewport?.addEventListener('scroll', this.#onViewportChange, { passive: true, signal });
    window.addEventListener('scroll', this.#onScroll, { passive: true, signal });
    window.addEventListener('pagehide', this.#onPageHide, { signal });
    window.addEventListener('pageshow', this.#onPageShow, { signal });
    document.addEventListener('visibilitychange', this.#onVisibilityChange, { signal });

    this.#root.addEventListener('pointerenter', this.#onPointerEnter, { signal });
    this.#root.addEventListener('pointerleave', this.#onPointerLeave, { signal });
    this.#root.addEventListener('focusin', this.#onFocusIn, { signal });
    this.#root.addEventListener('focusout', this.#onFocusOut, { signal });

    this.#stage.addEventListener('click', this.#onStageClick, { signal });
    this.#stage.addEventListener('pointerdown', this.#onDragPointerDown, { signal });
    this.#stage.addEventListener('lostpointercapture', this.#onDragPointerCancel, { signal });
    this.#stage.addEventListener('keydown', this.#onStageKeyDown, { signal });
    this.#toyButton.addEventListener('click', () => this.#toggleToy(), { signal });
    this.#toyButton.addEventListener('keydown', this.#onToyButtonKeyDown, { signal });
    this.#hideButton.addEventListener('click', this.#onHide, { signal });
    this.#hideButton.addEventListener('keydown', this.#onHideButtonKeyDown, { signal });
    this.#recallButton.addEventListener('click', this.#onRecall, { signal });
    this.#recallButton.addEventListener('keydown', this.#onRecallButtonKeyDown, { signal });

    this.#reducedMotionQuery.addEventListener('change', this.#onMotionPreferenceChange, { signal });
    this.#mobileToc?.addEventListener('toggle', this.#onMobileTocToggle, { signal });
  }

  #setInitialVisibility(): void {
    const storedPreference = readHiddenPreference();
    const shouldStartHidden = storedPreference ?? false;
    this.#setHidden(shouldStartHidden, false);
  }

  #renderState(state: PetState): void {
    this.#root.dataset.state = state === 'hidden' ? 'idle' : state;
  }

  #setHidden(hidden: boolean, persist: boolean): void {
    if (hidden) this.#cancelDrag();
    this.#hidden = hidden;
    this.#root.dataset.hidden = String(hidden);
    this.#stage.setAttribute('aria-hidden', String(hidden));
    this.#stage.tabIndex = hidden ? -1 : 0;
    this.#recallButton.tabIndex = hidden ? 0 : -1;

    if (persist) writeHiddenPreference(hidden);

    if (hidden) {
      this.#stopArrival();
      window.clearTimeout(this.#attentionTimer);
      this.#closeTouchToolbar();
      window.clearTimeout(this.#idleTimer);
      window.clearTimeout(this.#blinkTimer);
      window.clearTimeout(this.#earTimer);
      delete this.#root.dataset.blinking;
      delete this.#root.dataset.earTwitch;
      this.#stopToy(false);
      this.#cancelSpeech();
      this.#particles.replaceChildren();
      this.#gaze.stop();
      this.#machine.force('hidden');
      this.#root.dataset.mood = 'neutral';
      this.#root.dataset.speaking = 'false';
      this.#root.dataset.mouth = 'closed';
      return;
    }

    this.#machine.force('idle');
    if (!document.hidden) this.#gaze.start();
    this.#gaze.updateBounds();
    this.#scheduleIdleLine();
    this.#scheduleBlink();
    this.#scheduleEarTwitch();
    void this.#loadAssetRenderer();
  }

  #onPointerMove = (event: PointerEvent): void => {
    if (this.#hidden || this.#dragPointerId !== null || document.hidden || event.pointerType === 'touch') return;
    this.#gaze.pointTo(event.clientX, event.clientY);

    if (this.#toyActive && !this.#reducedMotionQuery.matches) {
      this.#toy.style.setProperty('--pet-toy-x', `${event.clientX}px`);
      this.#toy.style.setProperty('--pet-toy-y', `${event.clientY}px`);
    }
  };

  #onPointerEnter = (): void => {
    if (this.#hidden) return;
    window.clearTimeout(this.#attentionTimer);
    this.#pointerInside = true;
    if (!this.#toyActive && !this.#speechRunning) this.#machine.acquire('attentive');
  };

  #onPointerLeave = (): void => {
    this.#pointerInside = false;
    window.clearTimeout(this.#attentionTimer);
    this.#attentionTimer = window.setTimeout(() => {
      if (
        !this.#pointerInside &&
        !this.#focusInside &&
        !this.#toyActive &&
        !this.#speechRunning &&
        this.#machine.state === 'attentive'
      ) {
        this.#machine.force('idle');
      }
    }, 240);
  };

  #onFocusIn = (): void => {
    if (this.#hidden) return;
    window.clearTimeout(this.#attentionTimer);
    this.#focusInside = true;
    if (!this.#toyActive && !this.#speechRunning) this.#machine.acquire('attentive');
  };

  #onFocusOut = (event: FocusEvent): void => {
    if (event.relatedTarget instanceof Node && this.#root.contains(event.relatedTarget)) return;
    this.#focusInside = false;
    if (
      !this.#pointerInside &&
      !this.#toyActive &&
      !this.#speechRunning &&
      this.#machine.state === 'attentive'
    ) {
      this.#machine.force('idle');
    }
  };

  #onStageClick = (event: MouseEvent): void => {
    if (this.#hidden) return;
    if (Date.now() < this.#suppressStageClickUntil) {
      this.#suppressStageClickUntil = 0;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (this.#coarsePointer) {
      this.#gaze.pointTo(event.clientX, event.clientY);
      this.#openTouchToolbar();
    }

    if (this.#coarsePointer && !this.#touchPrimed) {
      this.#touchPrimed = true;
      this.#openTouchToolbar();
      this.#machine.acquire('attentive');
      return;
    }

    if (this.#toyActive) {
      const now = Date.now();
      if (now - this.#lastToyPawAt < 700 || Math.random() > 0.72) return;
      this.#lastToyPawAt = now;
      this.#react('paw', 'happy');
      this.#createParticles('spark');
      return;
    }

    const bounds = this.#character.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
    const y = (event.clientY - bounds.top) / Math.max(bounds.height, 1);
    const clickedNose =
      event.target instanceof Element && Boolean(event.target.closest('[data-pet-part="nose"]'));
    const noseDistance = Math.hypot(
      (x - this.#noseHitArea.cx) / this.#noseHitArea.r,
      (y - this.#noseHitArea.cy) / this.#noseHitArea.r,
    );
    this.#handlePetInteraction(clickedNose || noseDistance < 1 ? 'pet-nose' : 'pet-head');
  };

  #onDragPointerDown = (event: PointerEvent): void => {
    if (
      this.#hidden ||
      this.#root.dataset.arrivalPhase ||
      this.#root.dataset.tocOpen === 'true' ||
      !event.isPrimary ||
      (event.pointerType === 'mouse' && event.button !== 0) ||
      !(event.target instanceof Element) ||
      !event.target.closest('[data-pet-character]')
    ) return;
    const rootBounds = this.#root.getBoundingClientRect();
    this.#dragPointerId = event.pointerId;
    this.#dragStartX = event.clientX;
    this.#dragStartY = event.clientY;
    this.#dragRootLeft = rootBounds.left;
    this.#dragRootTop = rootBounds.top;
    this.#dragThreshold = event.pointerType === 'touch' ? 9 : 6;
    this.#root.dataset.dragState = 'candidate';
    try {
      this.#stage.setPointerCapture(event.pointerId);
    } catch {
      // Window-level pointer listeners keep drag tracking reliable if capture is unavailable.
    }
  };

  #onDragPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.#dragPointerId) return;
    const dx = event.clientX - this.#dragStartX;
    const dy = event.clientY - this.#dragStartY;
    if (!this.#dragging && Math.hypot(dx, dy) < this.#dragThreshold) return;
    if (!this.#dragging) {
      this.#dragging = true;
      this.#suppressStageClickUntil = Date.now() + 1_000;
      this.#root.dataset.dragState = 'dragging';
      this.#stopToy(false);
      this.#gaze.stop();
    }
    event.preventDefault();
    this.#setRootPosition(this.#dragRootLeft + dx, this.#dragRootTop + dy, false);
  };

  #onDragPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#dragPointerId) return;
    this.#finishDrag(this.#dragging);
  };

  #onDragPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.#dragPointerId) return;
    this.#finishDrag(this.#dragging);
  };

  #finishDrag(persist: boolean): void {
    const pointerId = this.#dragPointerId;
    this.#dragPointerId = null;
    if (pointerId !== null && this.#stage.hasPointerCapture(pointerId)) {
      this.#stage.releasePointerCapture(pointerId);
    }
    if (persist) {
      const bounds = this.#root.getBoundingClientRect();
      writePetPosition({ x: bounds.left, y: bounds.top });
      this.#positionBubble();
    }
    this.#dragging = false;
    delete this.#root.dataset.dragState;
    if (!this.#hidden && !document.hidden) {
      this.#gaze.updateBounds();
      this.#gaze.start();
    }
  }

  #cancelDrag(): void {
    this.#finishDrag(false);
  }

  #viewportBounds(): { left: number; top: number; right: number; bottom: number } {
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    return {
      left: left + Math.max(8, this.#safeInsets.left),
      top: top + Math.max(8, this.#safeInsets.top),
      right: left + (viewport?.width ?? window.innerWidth) - Math.max(8, this.#safeInsets.right),
      bottom: top + (viewport?.height ?? window.innerHeight) - Math.max(8, this.#safeInsets.bottom),
    };
  }

  #measureSafeArea(): void {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    this.#safeInsets = {
      top: Number.parseFloat(style.paddingTop) || 0,
      right: Number.parseFloat(style.paddingRight) || 0,
      bottom: Number.parseFloat(style.paddingBottom) || 0,
      left: Number.parseFloat(style.paddingLeft) || 0,
    };
    probe.remove();
  }

  #setRootPosition(left: number, top: number, persist: boolean): void {
    this.#root.style.left = `${left}px`;
    this.#root.style.top = `${top}px`;
    this.#root.style.right = 'auto';
    this.#root.style.bottom = 'auto';
    const character = this.#character.getBoundingClientRect();
    const root = this.#root.getBoundingClientRect();
    const viewport = this.#viewportBounds();
    const dx = Math.min(viewport.right - character.right, Math.max(viewport.left - character.left, 0));
    const clampedDx = character.right > viewport.right ? viewport.right - character.right : dx;
    const dy = Math.min(viewport.bottom - character.bottom, Math.max(viewport.top - character.top, 0));
    const clampedDy = character.bottom > viewport.bottom ? viewport.bottom - character.bottom : dy;
    const nextLeft = root.left + clampedDx;
    const nextTop = root.top + clampedDy;
    this.#root.style.left = `${nextLeft}px`;
    this.#root.style.top = `${nextTop}px`;
    this.#root.dataset.positionSource = 'user';
    if (persist) writePetPosition({ x: nextLeft, y: nextTop });
    this.#gaze.updateBounds();
  }

  #restorePosition(): void {
    if (this.#positionRestored) return;
    this.#positionRestored = true;
    const position = readPetPosition();
    if (position) this.#setRootPosition(position.x, position.y, false);
  }

  #onViewportChange = (): void => {
    this.#measureSafeArea();
    if (this.#root.dataset.positionSource === 'user') {
      const bounds = this.#root.getBoundingClientRect();
      this.#setRootPosition(bounds.left, bounds.top, true);
    }
    this.#gaze.updateBounds();
    this.#positionBubble();
  };

  #onStageKeyDown = (event: KeyboardEvent): void => {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
    event.preventDefault();
    this.#handlePetInteraction('pet-head');
  };

  #onToyButtonKeyDown = (event: KeyboardEvent): void => {
    this.#activateButtonFromKeyboard(event, () => this.#toggleToy());
  };

  #onHideButtonKeyDown = (event: KeyboardEvent): void => {
    this.#activateButtonFromKeyboard(event, this.#onHide);
  };

  #onRecallButtonKeyDown = (event: KeyboardEvent): void => {
    this.#activateButtonFromKeyboard(event, this.#onRecall);
  };

  #onMobileTocToggle = (): void => {
    if (!window.matchMedia(ARTICLE_TOC_OVERLAY_QUERY).matches) return;
    if (this.#mobileToc?.open) {
      this.#cancelDrag();
      this.#root.dataset.tocOpen = 'true';
      if (!this.#hidden) {
        this.#hiddenForToc = true;
        this.#setHidden(true, false);
      }
      return;
    }
    delete this.#root.dataset.tocOpen;
    if (this.#hiddenForToc) {
      this.#hiddenForToc = false;
      this.#setHidden(false, false);
    }
  };

  #activateButtonFromKeyboard(event: KeyboardEvent, action: () => void): void {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
    event.preventDefault();
    action();
  }

  #handlePetInteraction(trigger: 'pet-head' | 'pet-nose'): void {
    const now = Date.now();
    if (now < this.#interactionBlockedUntil) return;

    this.#clickTimes = [...this.#clickTimes.filter((time) => now - time <= RAPID_CLICK_WINDOW_MS), now];
    if (this.#clickTimes.length >= RAPID_CLICK_LIMIT) {
      this.#clickTimes = [];
      this.#interactionBlockedUntil = now + RAPID_CLICK_COOLDOWN_MS;
      this.#speechQueue = this.#speechQueue.filter(
        (request) => request.trigger !== 'pet-head' && request.trigger !== 'pet-nose',
      );
      this.#react('rapid', 'annoyed');
      this.#requestSpeech({ trigger: 'rapid-click', priority: 95, announce: true });
      return;
    }

    const isNose = trigger === 'pet-nose';
    this.#react(isNose ? 'nose' : 'head', isNose ? 'surprised' : 'happy');
    if (!isNose) this.#createParticles('heart');
    this.#requestSpeech({ trigger, priority: 80, announce: true });
  }

  #react(kind: 'head' | 'nose' | 'rapid' | 'paw' | 'return', mood: PetMood): void {
    const lease = this.#machine.acquire('reacting', 85);
    if (!lease) return;

    window.clearTimeout(this.#reactionTimer);
    this.#root.dataset.reaction = kind;
    this.#root.dataset.mood = mood;
    this.#reactionTimer = window.setTimeout(() => {
      delete this.#root.dataset.reaction;
      if (!this.#speechRunning) this.#root.dataset.mood = this.#toyActive ? 'playful' : 'neutral';
      this.#machine.release(lease, this.#toyActive ? 'playing' : this.#restingState());
    }, kind === 'rapid' ? 1_100 : 760);
  }

  #toggleToy(): void {
    if (this.#toyActive) {
      this.#stopToy(true);
      return;
    }

    if (this.#hidden) return;
    this.#toyActive = true;
    this.#toyButton.setAttribute('aria-pressed', 'true');
    this.#toyButton.setAttribute('aria-label', '关闭逗猫棒模式');
    const stageBounds = this.#stage.getBoundingClientRect();
    this.#toy.style.setProperty('--pet-toy-x', `${stageBounds.left + stageBounds.width * 0.8}px`);
    this.#toy.style.setProperty('--pet-toy-y', `${stageBounds.top + stageBounds.height * 0.28}px`);
    this.#root.dataset.toyActive = 'true';
    this.#root.dataset.mood = 'playful';
    this.#machine.force('playing');
    this.#requestSpeech({ trigger: 'toy-start', priority: 75, announce: true });
    window.clearTimeout(this.#toyTimer);
    this.#toyTimer = window.setTimeout(() => this.#stopToy(true), TOY_DURATION_MS);
  }

  #stopToy(speakAfter: boolean): void {
    if (!this.#toyActive) return;
    this.#toyActive = false;
    window.clearTimeout(this.#toyTimer);
    this.#toyButton.setAttribute('aria-pressed', 'false');
    this.#toyButton.setAttribute('aria-label', '开启逗猫棒模式');
    delete this.#root.dataset.toyActive;
    this.#toy.style.removeProperty('--pet-toy-x');
    this.#toy.style.removeProperty('--pet-toy-y');
    this.#machine.force(this.#restingState());
    if (!this.#speechRunning) this.#root.dataset.mood = 'neutral';
    if (speakAfter && !this.#hidden) {
      this.#requestSpeech({ trigger: 'toy-end', priority: 65, announce: true });
    }
  }

  #onHide = (): void => {
    const shouldMoveFocus = document.activeElement === this.#hideButton;
    this.#hiddenForToc = false;
    this.#setHidden(true, true);
    if (shouldMoveFocus) this.#recallButton.focus({ preventScroll: true });
  };

  #onRecall = (): void => {
    this.#cancelDrag();
    const shouldMoveFocus = document.activeElement === this.#recallButton;
    if (this.#mobileToc?.open && window.matchMedia(ARTICLE_TOC_OVERLAY_QUERY).matches) {
      this.#mobileToc.open = false;
    }
    delete this.#root.dataset.tocOpen;
    this.#hiddenForToc = false;
    this.#pendingArrival = true;
    this.#pendingRecallSpeech = true;
    this.#root.dataset.arrivalPhase = 'preparing';
    this.#touchPrimed = true;
    this.#setHidden(false, true);
    if (this.#root.dataset.renderer === 'assets') {
      void this.#playArrival();
    } else if (this.#root.dataset.renderer === 'fallback') {
      this.#finishRecall();
    }
    if (this.#coarsePointer) this.#openTouchToolbar();
    if (shouldMoveFocus) this.#stage.focus({ preventScroll: true });
  };

  #openTouchToolbar(): void {
    window.clearTimeout(this.#touchToolbarTimer);
    this.#root.dataset.touchToolbar = 'true';
    this.#touchToolbarTimer = window.setTimeout(() => {
      delete this.#root.dataset.touchToolbar;
      if (
        !this.#pointerInside &&
        !this.#focusInside &&
        !this.#toyActive &&
        !this.#speechRunning &&
        this.#machine.state === 'attentive'
      ) {
        this.#machine.force('idle');
      }
    }, 5_000);
  }

  #closeTouchToolbar(): void {
    window.clearTimeout(this.#touchToolbarTimer);
    delete this.#root.dataset.touchToolbar;
  }

  #onVisibilityChange = (): void => {
    if (document.hidden) {
      this.#cancelDrag();
      this.#stopArrival();
      this.#hiddenAt = Date.now();
      this.#root.dataset.paused = 'true';
      window.clearTimeout(this.#idleTimer);
      window.clearTimeout(this.#blinkTimer);
      window.clearTimeout(this.#earTimer);
      delete this.#root.dataset.blinking;
      delete this.#root.dataset.earTwitch;
      this.#stopToy(false);
      this.#cancelSpeech();
      this.#gaze.stop(false);
      return;
    }

    delete this.#root.dataset.paused;
    if (!this.#hidden) {
      this.#gaze.start();
      this.#scheduleIdleLine();
      this.#scheduleBlink();
      this.#scheduleEarTwitch();
    }

    const now = Date.now();
    const awayFor = this.#hiddenAt ? now - this.#hiddenAt : 0;
    this.#hiddenAt = 0;
    if (
      this.#hidden ||
      awayFor < RETURN_MIN_AWAY_MS ||
      now - this.#lastReturnGreetingAt < RETURN_COOLDOWN_MS
    ) {
      return;
    }

    this.#lastReturnGreetingAt = now;
    writeLastReturnGreetingAt(now);
    const trigger: PetTrigger = awayFor >= RETURN_LONG_AWAY_MS ? 'tab-return-long' : 'tab-return';
    this.#gaze.lookCenter();
    this.#react('return', 'happy');
    this.#requestSpeech({ trigger, priority: 88, announce: true });
  };

  #onPageHide = (event: PageTransitionEvent): void => {
    this.#cancelDrag();
    if (!event.persisted) {
      this.destroy();
      return;
    }

    this.#hiddenAt ||= Date.now();
    this.#stopArrival();
    this.#root.dataset.paused = 'true';
    window.clearTimeout(this.#idleTimer);
    window.clearTimeout(this.#blinkTimer);
    window.clearTimeout(this.#earTimer);
    this.#stopToy(false);
    this.#cancelSpeech();
    this.#gaze.stop(false);
  };

  #onPageShow = (event: PageTransitionEvent): void => {
    if (!event.persisted) return;
    delete this.#root.dataset.paused;
    if (this.#hidden) return;
    this.#gaze.start();
    this.#gaze.updateBounds();
    this.#scheduleIdleLine();
    this.#scheduleBlink();
    this.#scheduleEarTwitch();
  };

  #onMotionPreferenceChange = (event: MediaQueryListEvent): void => {
    this.#root.dataset.reducedMotion = String(event.matches);
    this.#gaze.setReducedMotion(event.matches);
    if (event.matches) {
      if (this.#root.dataset.arrivalPhase) void this.#playArrival();
      window.clearTimeout(this.#blinkTimer);
      window.clearTimeout(this.#earTimer);
      delete this.#root.dataset.blinking;
      delete this.#root.dataset.earTwitch;
      if (this.#activeLine) {
        this.#bubbleText.textContent = this.#activeLine.text;
        this.#root.dataset.mouth = 'closed';
      }
    } else if (!this.#hidden && !document.hidden) {
      this.#gaze.start();
      this.#scheduleBlink();
      this.#scheduleEarTwitch();
    }
  };

  #onScroll = (): void => {
    this.#scrolling = true;
    window.clearTimeout(this.#scrollTimer);
    this.#scrollTimer = window.setTimeout(() => {
      this.#scrolling = false;
    }, 260);
  };

  #requestSpeech(request: SpeechRequest): void {
    if (this.#hidden || document.hidden) return;
    if (this.#speechQueue.some((queued) => queued.trigger === request.trigger)) return;
    this.#speechQueue.push(request);
    this.#speechQueue.sort((a, b) => b.priority - a.priority);
    void this.#runSpeechQueue();
  }

  async #runSpeechQueue(): Promise<void> {
    if (this.#speechRunning) return;
    const runVersion = this.#speechRunVersion;
    this.#speechRunning = true;

    try {
      while (runVersion === this.#speechRunVersion && this.#speechQueue.length && !this.#hidden) {
        const request = this.#speechQueue.shift();
        if (!request) break;
        const line = this.#dialogue.pick(request.trigger, this.#pathname);
        if (!line) continue;
        await this.#playLine(line, request, runVersion);
      }
    } finally {
      if (runVersion !== this.#speechRunVersion) return;
      this.#speechRunning = false;
      this.#root.dataset.speaking = 'false';
      this.#root.dataset.mouth = 'closed';
      if (!this.#hidden) {
        this.#root.dataset.mood = this.#toyActive ? 'playful' : 'neutral';
        if (!this.#toyActive) this.#machine.force(this.#restingState());
      }
    }
  }

  async #playLine(line: PetLine, request: SpeechRequest, runVersion: number): Promise<void> {
    this.#speechAbort = new AbortController();
    const signal = this.#speechAbort.signal;
    const stateLease = this.#toyActive ? null : this.#machine.acquire('speaking', request.priority);
    this.#activeLine = line;

    this.#root.dataset.speaking = 'true';
    this.#root.dataset.bubbleVisible = 'true';
    this.#root.dataset.mood = line.mood;
    this.#root.dataset.mouth = 'closed';
    this.#bubbleText.textContent = '';
    this.#bubble.hidden = false;
    requestAnimationFrame(() => this.#positionBubble());
    if (request.announce) this.#liveRegion.textContent = line.text;

    try {
      if (this.#reducedMotionQuery.matches) {
        this.#bubbleText.textContent = line.text;
        this.#root.dataset.mouth = 'closed';
      } else {
        this.#root.dataset.mouth =
          line.mood === 'surprised' || line.mood === 'playful' || line.mood === 'happy'
            ? 'open'
            : 'small';
        const characters = Array.from(line.text);
        for (const character of characters) {
          if (this.#reducedMotionQuery.matches) {
            this.#bubbleText.textContent = line.text;
            this.#root.dataset.mouth = 'closed';
            break;
          }
          this.#bubbleText.textContent += character;
          await wait(34, signal);
        }
        this.#root.dataset.mouth = 'closed';
        this.#positionBubble();
      }

      await wait(Math.max(1_150, Math.min(2_400, line.text.length * 105)), signal);
      this.#root.dataset.mouth = 'closed';
      await wait(this.#reducedMotionQuery.matches ? 0 : 260, signal);
    } catch {
      // Hiding or navigating intentionally cancels the current line.
    } finally {
      if (runVersion === this.#speechRunVersion) {
        this.#bubble.hidden = true;
        this.#bubbleText.textContent = '';
        delete this.#root.dataset.bubbleVisible;
        this.#speechAbort = null;
        this.#activeLine = null;
      }
      this.#machine.release(stateLease, this.#toyActive ? 'playing' : this.#restingState());
    }
  }

  #positionBubble(): void {
    if (this.#bubble.hidden || this.#hidden || this.#root.dataset.tocOpen === 'true') return;
    const viewport = this.#viewportBounds();
    const character = this.#character.getBoundingClientRect();
    const bubble = this.#bubble.getBoundingClientRect();
    const gap = 12;
    const candidates = [
      { side: 'right', vertical: 'above', left: character.right + gap, top: character.top - bubble.height - gap },
      { side: 'left', vertical: 'above', left: character.left - bubble.width - gap, top: character.top - bubble.height - gap },
      { side: 'right', vertical: 'below', left: character.right + gap, top: character.bottom + gap },
      { side: 'left', vertical: 'below', left: character.left - bubble.width - gap, top: character.bottom + gap },
    ] as const;
    const toc = this.#mobileToc?.open ? this.#mobileToc.getBoundingClientRect() : null;
    const overflowScore = (candidate: (typeof candidates)[number]) => {
      const right = candidate.left + bubble.width;
      const bottom = candidate.top + bubble.height;
      let score =
        Math.max(0, viewport.left - candidate.left) +
        Math.max(0, right - viewport.right) +
        Math.max(0, viewport.top - candidate.top) +
        Math.max(0, bottom - viewport.bottom);
      if (toc) {
        const overlapWidth = Math.max(0, Math.min(right, toc.right) - Math.max(candidate.left, toc.left));
        const overlapHeight = Math.max(0, Math.min(bottom, toc.bottom) - Math.max(candidate.top, toc.top));
        score += overlapWidth * overlapHeight;
      }
      return score;
    };
    const chosen = candidates.reduce((best, candidate) =>
      overflowScore(candidate) < overflowScore(best) ? candidate : best,
    );
    const left = Math.min(viewport.right - bubble.width, Math.max(viewport.left, chosen.left));
    const top = Math.min(viewport.bottom - bubble.height, Math.max(viewport.top, chosen.top));
    this.#bubble.style.setProperty('--pet-bubble-x', `${left}px`);
    this.#bubble.style.setProperty('--pet-bubble-y', `${top}px`);
    this.#bubble.dataset.bubbleSide = chosen.side;
    this.#bubble.dataset.bubbleVertical = chosen.vertical;
    this.#bubble.dataset.bubbleClamped = String(left !== chosen.left || top !== chosen.top);
  }

  #cancelSpeech(): void {
    this.#speechRunVersion += 1;
    this.#speechQueue = [];
    this.#speechAbort?.abort();
    this.#speechAbort = null;
    this.#activeLine = null;
    this.#liveRegion.textContent = '';
    this.#speechRunning = false;
    this.#bubble.hidden = true;
    this.#bubbleText.textContent = '';
    delete this.#root.dataset.bubbleVisible;
    this.#root.dataset.speaking = 'false';
    this.#root.dataset.mouth = 'closed';
    this.#root.dataset.mood = this.#toyActive ? 'playful' : 'neutral';
    if (!this.#hidden && !this.#toyActive) this.#machine.force(this.#restingState());
  }

  #scheduleIdleLine(): void {
    window.clearTimeout(this.#idleTimer);
    if (this.#hidden || document.hidden) return;
    const delay = IDLE_MIN_MS + Math.random() * IDLE_JITTER_MS;
    this.#idleTimer = window.setTimeout(() => {
      if (!this.#shouldSuppressIdleLine()) {
        this.#requestSpeech({ trigger: this.#idleTriggerForPath(), priority: 25, announce: false });
      }
      this.#scheduleIdleLine();
    }, delay);
  }

  #scheduleBlink(): void {
    window.clearTimeout(this.#blinkTimer);
    if (this.#hidden || document.hidden || this.#reducedMotionQuery.matches) return;
    const delay = 2_500 + Math.random() * 4_500;
    this.#blinkTimer = window.setTimeout(() => {
      if (this.#hidden || document.hidden || this.#reducedMotionQuery.matches) {
        return;
      }
      this.#blink(Math.random() < 0.18);
    }, delay);
  }

  #scheduleEarTwitch(): void {
    window.clearTimeout(this.#earTimer);
    if (this.#reducedMotionQuery.matches || this.#hidden || document.hidden) return;
    const delay = 8_000 + Math.random() * 10_000;
    this.#earTimer = window.setTimeout(() => {
      const variants = ['left', 'right', 'both'] as const;
      this.#root.dataset.earTwitch = variants[Math.floor(Math.random() * variants.length)];
      this.#earTimer = window.setTimeout(() => {
        delete this.#root.dataset.earTwitch;
        this.#scheduleEarTwitch();
      }, 320);
    }, delay);
  }

  #blink(doubleBlink: boolean): void {
    this.#root.dataset.blinking = 'true';
    this.#blinkTimer = window.setTimeout(() => {
      delete this.#root.dataset.blinking;
      if (!doubleBlink) {
        this.#scheduleBlink();
        return;
      }
      this.#blinkTimer = window.setTimeout(() => {
        this.#root.dataset.blinking = 'true';
        this.#blinkTimer = window.setTimeout(() => {
          delete this.#root.dataset.blinking;
          this.#scheduleBlink();
        }, 95);
      }, 85);
    }, 110);
  }

  #shouldSuppressIdleLine(): boolean {
    const active = document.activeElement;
    const editing =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      (active instanceof HTMLElement && active.isContentEditable);
    const selecting = Boolean(window.getSelection()?.toString());
    return (
      this.#hidden ||
      document.hidden ||
      this.#scrolling ||
      this.#toyActive ||
      this.#speechRunning ||
      editing ||
      selecting
    );
  }

  #idleTriggerForPath(): PetTrigger {
    if (this.#pathname === '/blog' || this.#pathname.startsWith('/blog/')) return 'page-blog';
    if (this.#pathname === '/projects' || this.#pathname.startsWith('/projects/')) {
      return 'page-projects';
    }
    if (this.#pathname === '/about' || this.#pathname.startsWith('/about/')) return 'page-about';
    return 'idle';
  }

  #restingState(): PetState {
    return this.#pointerInside || this.#focusInside ? 'attentive' : 'idle';
  }

  #createParticles(kind: 'heart' | 'spark'): void {
    if (this.#reducedMotionQuery.matches) return;
    const count = kind === 'heart' ? 2 : 5;
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement('span');
      particle.className = `cat-companion__particle cat-companion__particle--${kind}`;
      particle.textContent = kind === 'heart' ? '♥' : '✦';
      particle.style.setProperty('--particle-index', String(index));
      particle.style.left = `${76 + index * 13 + Math.random() * 10}px`;
      particle.style.top = `${34 + Math.random() * 26}px`;
      particle.style.setProperty('--pet-particle-x', `${-18 + Math.random() * 36}px`);
      particle.style.setProperty('--pet-particle-y', `${-34 - Math.random() * 28}px`);
      this.#particles.append(particle);
      window.setTimeout(() => particle.remove(), 1_000);
    }
  }

  async #loadAssetRenderer(): Promise<void> {
    if (!this.#assetRoot || this.#assetLoadStarted) return;
    this.#assetLoadStarted = true;

    try {
      const response = await fetch('/pet/cat-v1/manifest.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Unable to load pet manifest (${response.status}).`);
      const manifest = (await response.json()) as AssetManifest;
      if (manifest.schemaVersion !== 1 || !manifest.ready) {
        throw new Error('Pet manifest is not ready.');
      }

      const layerEntries = [
        ['shadow', manifest.layers.shadow],
        ['book', manifest.layers.book],
        ['tail', manifest.layers.tail],
        ['body', manifest.layers.body],
        ['head', manifest.layers.head],
        ['ear-left', manifest.layers.earLeft],
        ['ear-right', manifest.layers.earRight],
        ['eye-base-left', manifest.layers.eyeBases.left],
        ['eye-base-right', manifest.layers.eyeBases.right],
        ['pupil-left', manifest.layers.pupils.left],
        ['pupil-right', manifest.layers.pupils.right],
        ['eyelid-half-left', manifest.layers.eyelids.half.left],
        ['eyelid-half-right', manifest.layers.eyelids.half.right],
        ['eyelid-closed-left', manifest.layers.eyelids.closed.left],
        ['eyelid-closed-right', manifest.layers.eyelids.closed.right],
        ['mouth-closed', manifest.layers.mouths.closed],
        ['mouth-small', manifest.layers.mouths.small],
        ['mouth-open', manifest.layers.mouths.open],
        ['mouth-smile', manifest.layers.mouths.smile],
        ['paw', manifest.layers.paw],
      ] as const;

      if (
        manifest.walk.frames.length !== 8 ||
        manifest.arrival.frames.length !== 10 ||
        manifest.arrival.durationsMs.length !== 10 ||
        manifest.arrival.walkOffset.x !== 0 ||
        manifest.arrival.walkOffset.y !== 64
      ) {
        throw new Error('Pet arrival manifest does not match the required sequence contract.');
      }

      const loadImage = (
        source: string,
        width: number,
        height: number,
        data: Record<string, string>,
      ) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.alt = '';
          image.decoding = 'async';
          image.draggable = false;
          image.fetchPriority = 'low';
          for (const [key, value] of Object.entries(data)) image.dataset[key] = value;
          image.onload = () => {
            if (image.naturalWidth !== width || image.naturalHeight !== height) {
              reject(
                new Error(
                  `${source} is ${image.naturalWidth}x${image.naturalHeight}; expected ` +
                    `${width}x${height}`,
                ),
              );
              return;
            }
            resolve(image);
          };
          image.onerror = () => reject(new Error(`Unable to load ${source}`));
          image.src = source;
        });

      const [images, walkFrames, arrivalFrames] = await Promise.all([
        Promise.all(
          layerEntries.map(([part, source]) =>
            loadImage(source, manifest.canvas.width, manifest.canvas.height, { assetPart: part }),
          ),
        ),
        Promise.all(
          manifest.walk.frames.map((source, index) =>
            loadImage(source, manifest.walk.canvas.width, manifest.walk.canvas.height, {
              sequenceKind: 'walk',
              sequenceFrame: String(index + 1),
            }),
          ),
        ),
        Promise.all(
          manifest.arrival.frames.map((source, index) =>
            loadImage(source, manifest.arrival.canvas.width, manifest.arrival.canvas.height, {
              sequenceKind: 'arrival',
              sequenceFrame: String(index + 1),
            }),
          ),
        ),
      ]);

      const fragment = document.createDocumentFragment();
      const headGroup = document.createElement('div');
      headGroup.dataset.assetHeadGroup = '';
      const headMotion = document.createElement('div');
      headMotion.dataset.assetHeadMotion = '';
      headGroup.append(headMotion);
      const headParts = new Set([
        'head',
        'ear-left',
        'ear-right',
        'eye-base-left',
        'eye-base-right',
        'pupil-left',
        'pupil-right',
        'eyelid-half-left',
        'eyelid-half-right',
        'eyelid-closed-left',
        'eyelid-closed-right',
        'mouth-closed',
        'mouth-small',
        'mouth-open',
        'mouth-smile',
      ]);

      let headGroupMounted = false;
      for (const image of images) {
        if (headParts.has(image.dataset.assetPart ?? '')) {
          if (!headGroupMounted) {
            fragment.append(headGroup);
            headGroupMounted = true;
          }
          headMotion.append(image);
        } else {
          fragment.append(image);
        }
      }
      this.#applyAssetManifest(manifest);
      this.#walkFrames = walkFrames;
      this.#arrivalFrames = arrivalFrames;
      this.#walkFrameDurationMs = manifest.walk.frameDurationMs;
      this.#arrivalDurationsMs = [...manifest.arrival.durationsMs];
      this.#arrivalReducedMotionFadeMs = manifest.arrival.reducedMotionFadeMs;
      this.#assetRoot.replaceChildren(fragment);
      this.#walkRoot.replaceChildren(...walkFrames, ...arrivalFrames);
      this.#root.dataset.renderer = 'assets';
      this.#gaze.updateBounds();
      if (this.#pendingArrival) void this.#playArrival();
    } catch {
      this.#root.dataset.renderer = 'fallback';
      this.#stopArrival(false);
      this.#pendingArrival = false;
      this.#finishRecall();
    }
  }

  async #playArrival(): Promise<void> {
    const runVersion = ++this.#arrivalRunVersion;
    if (
      this.#walkFrames.length !== 8 ||
      this.#arrivalFrames.length !== 10 ||
      this.#arrivalDurationsMs.length !== 10 ||
      this.#hidden ||
      document.hidden
    ) {
      this.#stopArrival(false);
      this.#finishRecall();
      return;
    }

    this.#gaze.stop();
    this.#pendingArrival = false;
    const frameDuration = Math.max(90, Math.min(140, this.#walkFrameDurationMs));
    this.#root.style.setProperty('--pet-walk-duration', `${frameDuration * this.#walkFrames.length}ms`);
    const setActiveFrame = (active: HTMLImageElement) => {
      for (const frame of [...this.#walkFrames, ...this.#arrivalFrames]) {
        frame.dataset.active = String(frame === active);
      }
    };

    if (this.#reducedMotionQuery.matches) {
      const fadeMs = Math.max(160, Math.min(220, this.#arrivalReducedMotionFadeMs));
      setActiveFrame(this.#arrivalFrames.at(-1)!);
      this.#root.dataset.arrivalPhase = 'transition';
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (runVersion !== this.#arrivalRunVersion || this.#hidden || document.hidden) return;
      this.#root.style.setProperty('--pet-arrival-handoff-duration', `${fadeMs}ms`);
      this.#root.dataset.arrivalPhase = 'handoff';
      await new Promise<void>((resolve) => window.setTimeout(resolve, fadeMs));
      if (runVersion === this.#arrivalRunVersion) {
        this.#stopArrival(false);
        this.#finishRecall();
      }
      return;
    }

    this.#root.dataset.arrivalPhase = 'walk';

    for (let index = 0; index < this.#walkFrames.length; index += 1) {
      if (runVersion !== this.#arrivalRunVersion || this.#hidden || document.hidden) return;
      setActiveFrame(this.#walkFrames[index]);
      await new Promise<void>((resolve) => window.setTimeout(resolve, frameDuration));
    }

    this.#root.dataset.arrivalPhase = 'transition';
    for (let index = 0; index < this.#arrivalFrames.length; index += 1) {
      if (runVersion !== this.#arrivalRunVersion || this.#hidden || document.hidden) return;
      setActiveFrame(this.#arrivalFrames[index]);
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, this.#arrivalDurationsMs[index]),
      );
    }

    if (runVersion !== this.#arrivalRunVersion || this.#hidden || document.hidden) return;
    const handoffMs = this.#arrivalDurationsMs.at(-1) ?? 160;
    this.#root.style.setProperty('--pet-arrival-handoff-duration', `${handoffMs}ms`);
    this.#root.dataset.arrivalPhase = 'handoff';
    await new Promise<void>((resolve) => window.setTimeout(resolve, handoffMs));
    if (runVersion === this.#arrivalRunVersion) {
      this.#stopArrival(false);
      this.#finishRecall();
    }
  }

  #stopArrival(clearPending = true): void {
    this.#arrivalRunVersion += 1;
    if (clearPending) {
      this.#pendingArrival = false;
      this.#pendingRecallSpeech = false;
    }
    delete this.#root.dataset.arrivalPhase;
    this.#root.style.removeProperty('--pet-walk-duration');
    this.#root.style.removeProperty('--pet-arrival-handoff-duration');
    for (const frame of [...this.#walkFrames, ...this.#arrivalFrames]) delete frame.dataset.active;
  }

  #finishRecall(): void {
    if (!this.#pendingRecallSpeech || this.#hidden) return;
    this.#pendingRecallSpeech = false;
    if (!document.hidden) {
      this.#gaze.updateBounds();
      this.#gaze.start();
    }
    this.#requestSpeech({ trigger: 'recall', priority: 90, announce: true });
  }

  #applyAssetManifest(manifest: AssetManifest): void {
    for (const breakpoint of ['desktop', 'tablet', 'mobile'] as const) {
      const size = manifest.displaySizes[breakpoint];
      this.#root.style.setProperty(`--pet-asset-${breakpoint}-width`, `${size.width}px`);
      this.#root.style.setProperty(`--pet-asset-${breakpoint}-height`, `${size.height}px`);
    }

    const setOrigin = (name: string, point: { x: number; y: number }) => {
      this.#root.style.setProperty(name, `${point.x * 100}% ${point.y * 100}%`);
    };
    setOrigin('--pet-head-origin', manifest.anchors.head);
    setOrigin('--pet-ear-left-origin', manifest.anchors.earLeft);
    setOrigin('--pet-ear-right-origin', manifest.anchors.earRight);
    setOrigin('--pet-eye-left-origin', manifest.anchors.eyeLeft);
    setOrigin('--pet-eye-right-origin', manifest.anchors.eyeRight);
    setOrigin('--pet-paw-origin', manifest.anchors.paw);
    setOrigin('--pet-tail-origin', manifest.anchors.tail);
    setOrigin('--pet-book-origin', manifest.bookMotion.transformOrigin);
    this.#root.style.setProperty('--pet-book-max-turn', `${manifest.bookMotion.maxRotationDeg}deg`);
    this.#root.style.setProperty('--pet-book-max-lift', `${manifest.bookMotion.maxLiftPx}px`);
    this.#noseHitArea = manifest.hitAreas.nose;
  }
}

const controllers = new WeakMap<HTMLElement, CatCompanionController>();

export const mountCatCompanions = (): void => {
  document.querySelectorAll<HTMLElement>('[data-cat-companion]').forEach((root) => {
    if (controllers.has(root)) return;
    controllers.set(root, new CatCompanionController(root));
  });
};
