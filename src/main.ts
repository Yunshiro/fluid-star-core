import './style.css';

import { createExperience } from './experience.ts';
import type { Experience } from './experience.ts';
import { loadTypeface, proceduralWordmark, sampleWordmark } from './logo.ts';
import { hasWebGL2, readLaunch } from './quality.ts';
import { shotProgress, state } from './state.ts';
import type { YunnBridge } from './state.ts';
import { mountInterface, showFallback } from './ui.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitFrames(bridge: YunnBridge, count: number): Promise<void> {
  const started = performance.now();
  while (bridge.frames < count && performance.now() - started < 12000) {
    await new Promise((resolve) => {
      requestAnimationFrame(() => resolve(null));
    });
  }
}

function morphForShot(shot: string): number {
  if (shot === 'nebula') return 1;
  if (shot === 'logo') return 2;
  return 0;
}

async function boot(): Promise<void> {
  const started = performance.now();
  const launch = readLaunch();
  state.reduced = launch.reduced;
  state.motion = launch.reduced ? 0.08 : 1;
  state.shot = launch.shot;
  if (launch.reduced) document.documentElement.classList.add('reduce');

  const bridge: YunnBridge = {
    ready: false,
    shotReady: false,
    fallback: false,
    fps: 0,
    ms: 0,
    tier: '',
    particles: 0,
    sim: '',
    morph: 0,
    dpr: 1,
    frames: 0,
  };
  window.__YUNN__ = bridge;
  window.addEventListener('core-lost', () => {
    showFallback();
    bridge.fallback = true;
    bridge.ready = true;
    bridge.shotReady = true;
  });

  if (launch.fallback || !hasWebGL2()) {
    showFallback();
    bridge.fallback = true;
    bridge.ready = true;
    bridge.shotReady = true;
    return;
  }

  const canvas = document.querySelector<HTMLCanvasElement>('#webgl');
  if (!canvas) {
    showFallback();
    bridge.fallback = true;
    bridge.ready = true;
    bridge.shotReady = true;
    return;
  }

  if (launch.shot && launch.shot !== 'intro') {
    state.lockMorph = morphForShot(launch.shot);
    state.morph = state.lockMorph;
  }

  let experience: Experience;
  try {
    experience = createExperience(canvas, bridge, launch.quality);
  } catch {
    showFallback();
    bridge.fallback = true;
    bridge.ready = true;
    bridge.shotReady = true;
    return;
  }

  const fontPromise = loadTypeface()
    .then(() => true)
    .catch(() => false);
  const fontReady = await Promise.race([fontPromise, sleep(480).then(() => false)]);
  if (fontReady && document.fonts.check('500 80px "Cormorant Garamond"')) {
    experience.setLogo(sampleWordmark());
  } else {
    experience.setLogo(proceduralWordmark());
    void fontPromise.then((ok) => {
      if (ok && state.morph < 0.35) experience.setLogo(sampleWordmark());
    });
  }

  const ui = mountInterface({ debug: launch.debug });
  experience.start();
  document.addEventListener('visibilitychange', () => {
    state.hidden = document.hidden;
  });

  if (launch.shot === 'intro') {
    await waitFrames(bridge, 1);
    experience.settle(18);
    ui.live();
    ui.setProgress(0.72);
    bridge.ready = true;
    bridge.shotReady = true;
  } else if (launch.shot) {
    ui.hideNow();
    ui.scrollToProgress(shotProgress(launch.shot));
    await waitFrames(bridge, 1);
    experience.settle(launch.shot === 'logo' ? 200 : launch.shot === 'nebula' ? 90 : 36);
    bridge.ready = true;
    bridge.shotReady = true;
  } else {
    await waitFrames(bridge, 1);
    ui.live();
    ui.setProgress(1);
    const remain = (state.reduced ? 240 : 1200) - (performance.now() - started);
    if (remain > 0) await sleep(remain);
    experience.reveal();
    await ui.finish();
    ui.enableScroll();
    bridge.ready = true;
  }

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      experience.dispose();
      ui.destroy();
    });
  }
}

void boot().catch(() => {
  showFallback();
  const bridge = window.__YUNN__;
  if (bridge) {
    bridge.fallback = true;
    bridge.ready = true;
    bridge.shotReady = true;
  }
});
