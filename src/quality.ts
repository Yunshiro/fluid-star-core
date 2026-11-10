export type Tier = 'high' | 'medium' | 'low';

export interface Profile {
  tier: Tier;
  simSize: number;
  dprCap: number;
  orbDetail: number;
  ringTubular: number;
  bloom: boolean;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  dof: number;
  chroma: number;
  grain: number;
  vignette: number;
  curl: boolean;
  clearcoat: number;
  exposure: number;
  envIntensity: number;
  assignedTarget: number;
  pointScale: number;
  bloomTap: number;
}

const PRESETS: Record<Tier, Profile> = {
  high: {
    tier: 'high',
    simSize: 512,
    dprCap: 1.5,
    orbDetail: 6,
    ringTubular: 220,
    bloom: true,
    bloomStrength: 0.26,
    bloomRadius: 0.34,
    bloomThreshold: 0.9,
    dof: 0.55,
    chroma: 0.0015,
    grain: 0.05,
    vignette: 0.5,
    curl: true,
    clearcoat: 1,
    exposure: 0.96,
    envIntensity: 1.18,
    assignedTarget: 16000,
    pointScale: 1,
    bloomTap: 0,
  },
  medium: {
    tier: 'medium',
    simSize: 256,
    dprCap: 1.25,
    orbDetail: 5,
    ringTubular: 140,
    bloom: true,
    bloomStrength: 0.22,
    bloomRadius: 0.32,
    bloomThreshold: 0.9,
    dof: 0,
    chroma: 0.001,
    grain: 0.042,
    vignette: 0.46,
    curl: true,
    clearcoat: 0.85,
    exposure: 1.06,
    envIntensity: 1.12,
    assignedTarget: 8000,
    pointScale: 1.18,
    bloomTap: 0,
  },
  low: {
    tier: 'low',
    simSize: 128,
    dprCap: 1,
    orbDetail: 3,
    ringTubular: 80,
    bloom: false,
    bloomStrength: 0,
    bloomRadius: 0,
    bloomThreshold: 1,
    dof: 0,
    chroma: 0.00045,
    grain: 0.032,
    vignette: 0.4,
    curl: false,
    clearcoat: 0,
    exposure: 1.04,
    envIntensity: 1.05,
    assignedTarget: 4800,
    pointScale: 1.5,
    bloomTap: 0.22,
  },
};

export interface LaunchOptions {
  quality: string | null;
  shot: string | null;
  debug: boolean;
  reduced: boolean;
  fallback: boolean;
}

export function readLaunch(): LaunchOptions {
  const params = new URLSearchParams(location.search);
  const motion = params.get('motion');
  const reduced =
    document.documentElement.classList.contains('reduce') ||
    motion === 'reduce' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    quality: params.get('quality'),
    shot: params.get('shot'),
    debug: params.has('debug'),
    reduced,
    fallback: params.has('fallback'),
  };
}

export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', {
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'high-performance',
    });
    return Boolean(gl);
  } catch {
    return false;
  }
}

function rendererString(gl: WebGL2RenderingContext): string {
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  if (!debug) return '';
  const value = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
  return typeof value === 'string' ? value : '';
}

export function detectTier(gl: WebGL2RenderingContext, override: string | null): Tier {
  if (override === 'high' || override === 'medium' || override === 'low') return override;
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  if (nav.connection?.saveData) return 'low';

  const ua = navigator.userAgent;
  const wechat = /MicroMessenger/i.test(ua);
  const ios =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const mobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua) || wechat || ios;
  const small = Math.min(window.screen.width, window.screen.height) <= 900;
  const gpu = rendererString(gl);
  const weak =
    /Mali-4|Mali-T|Adreno \(TM\) [1-5]|PowerVR|VideoCore|Intel\(R\) HD Graphics|Intel\(R\) UHD Graphics [5-6]|SwiftShader|llvmpipe|Microsoft Basic/i.test(
      gpu,
    );
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;

  if ((mobile && small) || (wechat && small)) return 'low';
  if (ios || android) return memory <= 4 ? 'low' : 'medium';
  if (weak || memory <= 4 || cores <= 4) return 'medium';
  return 'high';
}

export function profileFor(tier: Tier): Profile {
  return PRESETS[tier];
}

export function supportsColorBuffer(
  gl: WebGL2RenderingContext,
  internalFormat: number,
  type: number,
): boolean {
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) return false;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, gl.RGBA, type, null);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteTexture(texture);
  return ok;
}
