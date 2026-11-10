export interface LogoPoint {
  x: number;
  y: number;
  z: number;
}

export const WORD_WIDTH = 3.42;

function normalize(points: LogoPoint[], width: number): LogoPoint[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const span = Math.max(0.001, maxX - minX);
  const scale = width / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map((point) => ({
    x: (point.x - cx) * scale,
    y: (point.y - cy) * scale,
    z: 0,
  }));
}

function stride(points: LogoPoint[], cap: number): LogoPoint[] {
  if (points.length <= cap) return points;
  const step = Math.ceil(points.length / cap);
  const out: LogoPoint[] = [];
  for (let i = 0; i < points.length; i += step) {
    const point = points[i];
    if (point) out.push(point);
  }
  return out;
}

function addSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  out: LogoPoint[],
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 0.0001;
  const steps = Math.max(2, Math.ceil(len / 0.012));
  const nx = -dy / len;
  const ny = dx / len;
  const rows = Math.max(2, Math.round(width / 0.012));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = ax + dx * t;
    const y = ay + dy * t;
    for (let r = 0; r < rows; r += 1) {
      const o = (r / (rows - 1) - 0.5) * width;
      out.push({ x: x + nx * o, y: y + ny * o, z: 0 });
    }
  }
}

function addCurve(
  p0: LogoPoint,
  p1: LogoPoint,
  p2: LogoPoint,
  width: number,
  out: LogoPoint[],
): void {
  const steps = 16;
  let prev = p0;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const mt = 1 - t;
    const next = {
      x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
      y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
      z: 0,
    };
    addSegment(prev.x, prev.y, next.x, next.y, width, out);
    prev = next;
  }
}

export function proceduralWordmark(): LogoPoint[] {
  const out: LogoPoint[] = [];
  const w = 0.085;
  addSegment(-1.62, 0.52, -1.18, 0.04, w, out);
  addSegment(-0.74, 0.52, -1.18, 0.04, w, out);
  addSegment(-1.18, 0.04, -1.18, -0.52, 0.07, out);
  addSegment(-1.72, 0.52, -1.52, 0.52, 0.05, out);
  addSegment(-0.84, 0.52, -0.64, 0.52, 0.05, out);
  addSegment(-1.3, -0.52, -1.06, -0.52, 0.05, out);

  addSegment(-0.46, 0.2, -0.46, -0.22, 0.07, out);
  addCurve({ x: -0.46, y: -0.22, z: 0 }, { x: -0.16, y: -0.5, z: 0 }, { x: 0.14, y: -0.22, z: 0 }, 0.07, out);
  addSegment(0.14, -0.22, 0.14, 0.22, 0.07, out);

  addSegment(0.42, -0.3, 0.42, 0.22, 0.07, out);
  addCurve({ x: 0.42, y: 0.16, z: 0 }, { x: 0.74, y: 0.42, z: 0 }, { x: 1.06, y: 0.16, z: 0 }, 0.068, out);
  addSegment(1.06, 0.16, 1.06, -0.3, 0.07, out);

  addSegment(1.34, -0.3, 1.34, 0.22, 0.07, out);
  addCurve({ x: 1.34, y: 0.16, z: 0 }, { x: 1.66, y: 0.42, z: 0 }, { x: 1.98, y: 0.16, z: 0 }, 0.068, out);
  addSegment(1.98, 0.16, 1.98, -0.3, 0.07, out);

  return normalize(stride(out, 7000), WORD_WIDTH);
}

export async function loadTypeface(): Promise<void> {
  const roman = new FontFace(
    'Cormorant Garamond',
    'url(/fonts/cormorant-garamond-500.woff2)',
    { weight: '500', style: 'normal' },
  );
  const italic = new FontFace(
    'Cormorant Garamond',
    'url(/fonts/cormorant-garamond-500-italic.woff2)',
    { weight: '500', style: 'italic' },
  );
  const faces = await Promise.all([roman.load(), italic.load()]);
  for (const face of faces) document.fonts.add(face);
}

export function sampleWordmark(): LogoPoint[] {
  const canvas = document.createElement('canvas');
  const width = 1800;
  const height = 720;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return proceduralWordmark();

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '500 340px "Cormorant Garamond"';
  const letters = ['Y', 'u', 'n', 'n'];
  const tracking = 52;
  const widths = letters.map((letter) => ctx.measureText(letter).width);
  const total = widths.reduce((sum, item) => sum + item, 0) + tracking * (letters.length - 1);
  if (total < 40) return proceduralWordmark();

  let cursor = (width - total) / 2;
  const baseline = height * 0.68;
  for (let i = 0; i < letters.length; i += 1) {
    const letter = letters[i] ?? '';
    ctx.strokeText(letter, cursor, baseline);
    ctx.fillText(letter, cursor, baseline);
    cursor += (widths[i] ?? 0) + tracking;
  }

  const image = ctx.getImageData(0, 0, width, height);
  const raw: LogoPoint[] = [];
  const step = 3;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const alpha = image.data[(y * width + x) * 4] ?? 0;
      if (alpha > 140) raw.push({ x, y: -y, z: 0 });
    }
  }
  if (raw.length < 500) return proceduralWordmark();
  return normalize(stride(raw, 8000), WORD_WIDTH);
}
