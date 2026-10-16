import { useEffect, useRef } from 'react';
import '../windDust.css';

type Point = readonly [number, number];
type WindVariant = 'login' | 'hero';
const CURVES = [
  [-.12, .76, .08, .47, .38, .22, .56, .4],
  [.56, .4, .83, .65, .77, .94, .52, .72],
  [.52, .72, .26, .51, .49, .04, .78, .27],
  [.78, .27, .99, .46, 1.06, .38, 1.14, .2],
] as const;
const MAX_PIXELS = 900_000;

function paint(canvas: HTMLCanvasElement, width: number, height: number, colors: string[], layer: number, variant: WindVariant) {
  const scale = width && height ? Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(MAX_PIXELS / (width * height))) : 1;
  canvas.width = Math.floor(width * scale); canvas.height = Math.floor(height * scale);
  if (!width || !height) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  const points: Point[] = [];
  for (const curve of CURVES) for (let step = 0; step < 64; step++) {
    const t = step / 63, a = 1 - t;
    const x = a ** 3 * curve[0] + 3 * a * a * t * curve[2] + 3 * a * t * t * curve[4] + t ** 3 * curve[6];
    const y = a ** 3 * curve[1] + 3 * a * a * t * curve[3] + 3 * a * t * t * curve[5] + t ** 3 * curve[7];
    points.push([(1 - x) * width, y * height]);
  }
  if (variant === 'login') {
    const streams = Array.from({ length: 3 }, (_, lane) => points.map(([x, y]): Point => [
      x - (lane - 1) * .007 * width, y + (lane - 1) * .027 * height,
    ]));
    const gradient = context.createLinearGradient(width, height * .8, 0, height * .2);
    gradient.addColorStop(0, `${colors[0]}00`);
    gradient.addColorStop(.2, colors[0]);
    gradient.addColorStop(.55, colors[1]);
    gradient.addColorStop(.8, colors[2]);
    gradient.addColorStop(1, `${colors[2]}00`);
    context.strokeStyle = gradient; context.lineCap = 'round'; context.lineJoin = 'round';
    for (const stream of streams) {
      const path = new Path2D();
      stream.forEach(([x, y], i) => i ? path.lineTo(x, y) : path.moveTo(x, y));
      for (const [lineWidth, alpha] of [[24, .025], [9, .055], [1.2, .16]]) {
        context.lineWidth = lineWidth; context.globalAlpha = alpha; context.stroke(path);
      }
    }
    const count = width < 768 ? 16 : 24;
    for (let i = 0; i < count; i++) {
      const stream = streams[i % 3], phase = (i / count + layer * .061) % 1;
      const [x, y] = stream[Math.floor(phase * (stream.length - 1))];
      const size = 1.4 + ((i * 7) % 5) * .4;
      context.fillStyle = colors[i % colors.length];
      context.globalAlpha = .12; context.fillRect(Math.round(x + 7), Math.round(y + 2), size * .6, size * .6);
      context.globalAlpha = .66; context.fillRect(Math.round(x), Math.round(y), size, size);
    }
    context.globalAlpha = 1;
    return;
  }
  // Stable scatter keeps resizing/theme changes from reshuffling the dust.
  let seed = 173 + layer * 997;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const glows = colors.map(color => {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const glow = sprite.getContext('2d')!;
    const gradient = glow.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, `${color}aa`);
    gradient.addColorStop(.22, `${color}55`);
    gradient.addColorStop(1, `${color}00`);
    glow.fillStyle = gradient; glow.fillRect(0, 0, 32, 32);
    return sprite;
  });
  const count = width < 768 ? 260 : 460;
  const spread = Math.min(width, height) * .075;
  for (let i = 0; i < count; i++) {
    const phase = random(), index = Math.min(colors.length - 1, Math.floor(phase * colors.length));
    const point = points[Math.floor(phase * (points.length - 1))];
    const scatter = () => (random() + random() + random() - 1.5);
    const cloud = .35 + .65 * Math.sin(phase * Math.PI * 4) ** 2;
    const x = point[0] + scatter() * spread * .6, y = point[1] + scatter() * spread * cloud;
    const size = .45 + random() ** 2 * 1.5;
    const fade = Math.min(1, phase * 8, (1 - phase) * 8);
    context.globalAlpha = (.2 + random() * .6) * fade;
    if (i % 3 === 0) {
      const halo = size * 7;
      context.drawImage(glows[index], x - halo, y - halo, halo * 2, halo * 2);
    }
    context.fillStyle = colors[index];
    context.beginPath(); context.arc(x, y, size, 0, Math.PI * 2); context.fill();
    if (i % 29 === 0) {
      // A few tiny four-point glints punctuate the softer dust cloud.
      const ray = size * 3.5, core = size * .55;
      context.beginPath();
      context.moveTo(x, y - ray); context.lineTo(x + core, y - core);
      context.lineTo(x + ray, y); context.lineTo(x + core, y + core);
      context.lineTo(x, y + ray); context.lineTo(x - core, y + core);
      context.lineTo(x - ray, y); context.lineTo(x - core, y - core);
      context.closePath(); context.fill();
    }
  }
  context.globalAlpha = 1;
}

/** Draw only on resize/theme changes; CSS moves the two cached textures together. */
export default function WindDust({ variant = 'login' }: { variant?: WindVariant }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const canvases = [...element.querySelectorAll('canvas')];
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const forcedColors = matchMedia('(forced-colors: active)');
    let visible = false, width = 0, height = 0;
    const sync = () => {
      element.dataset.paused = String(!visible || document.hidden || motion.matches || forcedColors.matches);
    };
    const cache = () => {
      const style = getComputedStyle(element);
      const colors = ['--pv-wind-blue', '--pv-wind-gold', '--pv-wind-sky'].map(name => style.getPropertyValue(name).trim());
      canvases.forEach((canvas, i) => paint(canvas, width, height, colors, i, variant));
    };
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width; height = entry.contentRect.height;
      cache();
    });
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    const theme = new MutationObserver(cache);
    resize.observe(element); intersection.observe(element);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync); forcedColors.addEventListener('change', sync);
    return () => {
      resize.disconnect(); intersection.disconnect(); theme.disconnect();
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync); forcedColors.removeEventListener('change', sync);
      canvases.forEach(canvas => { canvas.width = canvas.height = 0; });
    };
  }, [variant]);
  return <div ref={ref} className={`wind-dust wind-dust--${variant}`} data-wind-dust={variant} data-paused="true" aria-hidden="true">
    <canvas className="wind-dust__layer" /><canvas className="wind-dust__layer" />
  </div>;
}
