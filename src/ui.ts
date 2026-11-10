import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

import { toggleAmbient } from './audio.ts';
import { captionWeights, clamp, morphFromProgress, state } from './state.ts';

gsap.registerPlugin(ScrollTrigger);

const NAMES = ['液态金属', '星云', '署名'];
const NUMBERS = ['01', '02', '03'];
const JUMPS = [0.02, 0.5, 0.92];

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

export function showFallback(): void {
  document.documentElement.classList.remove('is-loading');
  document.documentElement.classList.add('is-fallback');
  document.getElementById('loader')?.setAttribute('hidden', '');
  document.getElementById('webgl')?.setAttribute('hidden', '');
  document.querySelector('.hud')?.setAttribute('hidden', '');
  document.getElementById('story')?.setAttribute('hidden', '');
  document.getElementById('cursor')?.setAttribute('hidden', '');
  const fallback = document.getElementById('fallback');
  fallback?.classList.add('is-on');
  fallback?.removeAttribute('hidden');
}

export interface InterfaceController {
  setProgress(value: number): void;
  live(): void;
  finish(): Promise<void>;
  hideNow(): void;
  enableScroll(): void;
  scrollToProgress(progress: number): void;
  destroy(): void;
}

export function mountInterface(options: { debug: boolean }): InterfaceController {
  const loader = must<HTMLElement>('#loader');
  const percent = must<HTMLElement>('#loader-pct');
  const captions = Array.from(document.querySelectorAll<HTMLElement>('.caption'));
  const indexNum = must<HTMLElement>('#index-num');
  const indexName = must<HTMLElement>('#index-name');
  const hint = must<HTMLElement>('#hint');
  const bar = must<HTMLElement>('#progress-bar');
  const sound = must<HTMLButtonElement>('#sound');
  const cursor = must<HTMLElement>('#cursor');
  const debug = must<HTMLElement>('#debug');
  const rails = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-jump]'));
  const shown: number[] = captions.map((_, index) => (index === 0 ? 1 : 0));
  const weights: [number, number, number] = [1, 0, 0];
  let targetProgress = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--p') || '0.06',
  );
  if (Number.isNaN(targetProgress)) targetProgress = 0.06;
  let shownProgress = targetProgress;
  let cx = window.innerWidth * 0.5;
  let cy = window.innerHeight * 0.5;
  let tx = cx;
  let ty = cy;
  let raf = 0;
  let debugAt = 0;

  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine) document.documentElement.classList.add('has-cursor');
  if (options.debug) debug.removeAttribute('hidden');

  const lenis = state.reduced
    ? null
    : new Lenis({
        lerp: 0.085,
        smoothWheel: true,
        syncTouch: false,
        wheelMultiplier: 0.92,
        autoRaf: false,
        respectReducedMotion: true,
      });
  lenis?.stop();

  const trigger = ScrollTrigger.create({
    trigger: '#story',
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: (self) => apply(self.progress),
  });

  function apply(progress: number): void {
    const next = captionWeights(progress);
    weights[0] = next[0];
    weights[1] = next[1];
    weights[2] = next[2];
    if (state.lockMorph === null) state.morph = morphFromProgress(progress);
    let active = 0;
    if ((weights[1] ?? 0) >= (weights[0] ?? 0) && (weights[1] ?? 0) >= (weights[2] ?? 0)) active = 1;
    if ((weights[2] ?? 0) > (weights[active] ?? 0)) active = 2;
    indexNum.textContent = NUMBERS[active] ?? '01';
    indexName.textContent = NAMES[active] ?? '';
    rails.forEach((button, index) => button.classList.toggle('is-on', index === active));
    hint.style.opacity = String(clamp(1 - progress / 0.08, 0, 1));
    bar.style.transform = `scaleY(${clamp(progress, 0, 1)})`;
  }

  function paintProgress(value: number): void {
    const clamped = clamp(value, 0, 1);
    document.documentElement.style.setProperty('--p', clamped.toFixed(4));
    percent.textContent = String(Math.round(clamped * 100)).padStart(2, '0');
    loader.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
  }

  function updatePointer(clientX: number, clientY: number, kind: string): void {
    const width = window.visualViewport?.width ?? window.innerWidth;
    const height = window.visualViewport?.height ?? window.innerHeight;
    state.pointerX = (clientX / Math.max(1, width)) * 2 - 1;
    state.pointerY = -((clientY / Math.max(1, height)) * 2 - 1);
    state.pointerAt = performance.now();
    tx = clientX;
    ty = clientY;
    if (kind === 'touch') document.documentElement.classList.remove('has-cursor');
    else cursor.classList.add('is-on');
  }

  function onPointer(event: PointerEvent): void {
    updatePointer(event.clientX, event.clientY, event.pointerType);
  }
  function onTouch(event: TouchEvent): void {
    const touch = event.touches[0];
    if (!touch) return;
    updatePointer(touch.clientX, touch.clientY, 'touch');
  }
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('pointerdown', onPointer, { passive: true });
  window.addEventListener('touchstart', onTouch, { passive: true });
  window.addEventListener('touchmove', onTouch, { passive: true });

  let lastScroll = window.scrollY;
  function onScroll(): void {
    if (lenis) return;
    const y = window.scrollY;
    state.scrollVelocity = clamp((y - lastScroll) / 28, -1, 1);
    lastScroll = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  lenis?.on('scroll', (instance) => {
    state.scrollVelocity = clamp(instance.velocity / 28, -1, 1);
    ScrollTrigger.update();
  });

  document.querySelectorAll('button').forEach((button) => {
    button.addEventListener('pointerenter', () => cursor.classList.add('is-hot'));
    button.addEventListener('pointerleave', () => cursor.classList.remove('is-hot'));
  });

  sound.addEventListener('click', () => {
    void toggleAmbient().then((on) => {
      sound.setAttribute('aria-pressed', on ? 'true' : 'false');
      sound.setAttribute('aria-label', on ? '关闭声音' : '开启声音');
    });
  });

  rails.forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.jump ?? '0');
      scrollToProgress(JUMPS[index] ?? 0);
    });
  });

  function onKey(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const down = event.key === 'ArrowDown' || event.key === 'PageDown';
    const up = event.key === 'ArrowUp' || event.key === 'PageUp';
    if (!down && !up) return;
    if (document.documentElement.classList.contains('is-loading')) return;
    event.preventDefault();
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const delta = (event.key.startsWith('Page') ? 0.22 : 0.075) * max * (down ? 1 : -1);
    const current = lenis ? lenis.scroll : window.scrollY;
    const next = clamp(current + delta, 0, max);
    if (lenis) lenis.scrollTo(next, { duration: state.reduced ? 0 : 0.9 });
    else window.scrollTo({ top: next, behavior: state.reduced ? 'auto' : 'smooth' });
  }
  window.addEventListener('keydown', onKey);

  function loop(now: number): void {
    lenis?.raf(now);
    const progressK = state.reduced ? 1 : 0.14;
    shownProgress += (targetProgress - shownProgress) * progressK;
    if (Math.abs(targetProgress - shownProgress) < 0.001) shownProgress = targetProgress;
    paintProgress(shownProgress);

    const captionK = state.reduced || state.shot ? 1 : 0.12;
    captions.forEach((caption, index) => {
      const goal = weights[index] ?? 0;
      const current = shown[index] ?? 0;
      const next = current + (goal - current) * captionK;
      shown[index] = next;
      caption.style.opacity = next.toFixed(3);
      caption.style.transform = `translate3d(0, ${((1 - next) * 18).toFixed(2)}px, 0)`;
      caption.setAttribute('aria-hidden', next < 0.08 ? 'true' : 'false');
    });

    if (fine) {
      const cursorK = state.reduced ? 1 : 0.2;
      cx += (tx - cx) * cursorK;
      cy += (ty - cy) * cursorK;
      cursor.style.transform = `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`;
    }

    if (options.debug && now - debugAt > 250) {
      debugAt = now;
      const live = window.__YUNN__;
      setText('#d-fps', (live?.fps ?? state.fps).toFixed(1));
      setText('#d-ms', (live?.ms ?? state.ms).toFixed(1));
      setText('#d-tier', state.adapted ? `${state.tier} · adapted` : state.tier);
      setText('#d-count', String(state.particles));
      setText('#d-dpr', state.dpr.toFixed(2));
      setText('#d-morph', (live?.morph ?? state.morph).toFixed(2));
      setText('#d-bloom', state.bloom ? 'on' : 'off');
      setText('#d-sim', state.sim);
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  apply(0);

  function scrollToProgress(progress: number): void {
    document.documentElement.classList.remove('is-loading');
    ScrollTrigger.refresh();
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const y = max * clamp(progress, 0, 1);
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
    ScrollTrigger.update();
    apply(progress);
  }

  return {
    setProgress(value: number) {
      targetProgress = clamp(value, 0, 1);
      if (state.reduced) {
        shownProgress = targetProgress;
        paintProgress(shownProgress);
      }
    },
    live() {
      loader.classList.add('is-live');
    },
    finish() {
      targetProgress = 1;
      return new Promise((resolve) => {
        const started = performance.now();
        const step = (): void => {
          if (shownProgress > 0.985 || performance.now() - started > 900) {
            loader.classList.add('is-done');
            window.setTimeout(
              () => {
                loader.setAttribute('hidden', '');
                resolve();
              },
              state.reduced ? 16 : 860,
            );
            return;
          }
          requestAnimationFrame(step);
        };
        step();
      });
    },
    hideNow() {
      loader.classList.add('is-done');
      loader.setAttribute('hidden', '');
      document.documentElement.classList.remove('is-loading');
    },
    enableScroll() {
      document.documentElement.classList.remove('is-loading');
      ScrollTrigger.refresh();
      lenis?.start();
    },
    scrollToProgress,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
      trigger.kill();
      lenis?.destroy();
    },
  };
}

function setText(selector: string, value: string): void {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}
