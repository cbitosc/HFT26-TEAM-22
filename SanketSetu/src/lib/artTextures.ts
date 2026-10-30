import * as THREE from 'three';
import { OrbExpression, ThemeMode } from './scroll';
import { PRODUCT_SCENARIOS, ScenarioAccent, ScenarioItem } from '../content';

/**
 * Procedural Canvas2D Art & Surface Texture Generator (src/lib/artTextures.ts)
 * -----------------------------------------------------------------------------
 * Synthesizes high-resolution (2x DPR: 1024x720) scenario cards for the
 * 06 USE CASES 3D Spiral / List gallery, plus expressive face textures for the
 * 3D Orb and hardware textures for Scene 3.
 *
 * - Light theme cards: warm white/ivory (#FFFFFF / #F6F4EF) base with soft
 *   pastel mesh gradient built from scenario accent + white, subtle grain,
 *   1px inner border in --line, and crisp baked text (index, domain, title,
 *   summary, metricLabel + metricValue).
 * - Dark theme cards: deep graphite (#141418) base with rich accent mesh glow
 *   and crisp off-white typography.
 */

const scenarioTextureCache: Record<ThemeMode, THREE.CanvasTexture[] | null> = {
  light: null,
  dark: null,
};

const scenarioDataUrlCache: Record<ThemeMode, string[] | null> = {
  light: null,
  dark: null,
};

let cachedHeroOuterTexture: THREE.CanvasTexture | null = null;
let cachedHeroInnerTexture: THREE.CanvasTexture | null = null;
const cachedOrbFaces: Partial<Record<OrbExpression, THREE.CanvasTexture>> = {};

interface AccentPalette {
  solid: string;
  pastelLight: string;
  meshSecondaryLight: string;
  deepDark: string;
  meshSecondaryDark: string;
}

const ACCENT_MAP: Record<ScenarioAccent, AccentPalette> = {
  lime: {
    solid: '#C6FF3D',
    pastelLight: '#E9FFAD',
    meshSecondaryLight: '#DCFCE7',
    deepDark: '#365314',
    meshSecondaryDark: '#1A2E05',
  },
  lilac: {
    solid: '#B79CFF',
    pastelLight: '#E9DFFF',
    meshSecondaryLight: '#F3E8FF',
    meshSecondaryDark: '#2E1065',
    deepDark: '#4C1D95',
  },
  blue: {
    solid: '#2D5BFF',
    pastelLight: '#DCE6FF',
    meshSecondaryLight: '#E0F2FE',
    deepDark: '#1E3A8A',
    meshSecondaryDark: '#172554',
  },
  coral: {
    solid: '#FF6A4D',
    pastelLight: '#FFE0D9',
    meshSecondaryLight: '#FFEDD5',
    deepDark: '#7C2D12',
    meshSecondaryDark: '#431407',
  },
  peach: {
    solid: '#FFB58C',
    pastelLight: '#FFEAD9',
    meshSecondaryLight: '#FEF3C7',
    deepDark: '#78350F',
    meshSecondaryDark: '#451A03',
  },
};

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wrapCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2
) {
  const words = text.split(' ');
  let line = '';
  let lineCount = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line ? `${line} ${words[n]}` : words[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      lineCount += 1;
      if (lineCount >= maxLines) {
        ctx.fillText(`${line.trim()}…`, x, y);
        return;
      }
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
  }
}

function createScenarioCanvas(
  scenario: ScenarioItem,
  idx: number,
  theme: ThemeMode
): HTMLCanvasElement {
  // 2x DPR high-density canvas (1024 x 720)
  const width = 1024;
  const height = 720;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const isLight = theme === 'light';
  const pal = ACCENT_MAP[scenario.accent] ?? ACCENT_MAP.lime;

  // 1. Base card fill (Light warm paper vs Dark obsidian surface)
  ctx.fillStyle = isLight ? '#FFFFFF' : '#14141A';
  ctx.fillRect(0, 0, width, height);

  // 2. Soft pastel mesh gradient built from accent color + white (or deep rich glow in dark mode)
  const blob1 = ctx.createRadialGradient(
    width * 0.82,
    height * 0.22,
    20,
    width * 0.82,
    height * 0.22,
    width * 0.62
  );
  blob1.addColorStop(0, isLight ? pal.pastelLight : pal.deepDark);
  blob1.addColorStop(0.55, isLight ? pal.meshSecondaryLight : pal.meshSecondaryDark);
  blob1.addColorStop(1, isLight ? 'rgba(255,255,255,0)' : 'rgba(20,20,26,0)');
  ctx.fillStyle = blob1;
  ctx.fillRect(0, 0, width, height);

  const blob2 = ctx.createRadialGradient(
    width * 0.18,
    height * 0.84,
    24,
    width * 0.18,
    height * 0.84,
    width * 0.52
  );
  blob2.addColorStop(0, isLight ? pal.meshSecondaryLight : pal.meshSecondaryDark);
  blob2.addColorStop(1, isLight ? 'rgba(246,244,239,0)' : 'rgba(20,20,26,0)');
  ctx.fillStyle = blob2;
  ctx.fillRect(0, 0, width, height);

  // 3. Faint editorial grid lines
  ctx.strokeStyle = isLight ? 'rgba(11, 11, 11, 0.045)' : 'rgba(245, 245, 243, 0.05)';
  ctx.lineWidth = 1.5;
  const step = 72;
  for (let x = step; x < width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = step; y < height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 4. Subtle procedural telemetry waveform / domain geometry in top-right background
  ctx.save();
  ctx.strokeStyle = isLight ? 'rgba(11, 11, 11, 0.09)' : 'rgba(245, 245, 243, 0.12)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 0; i <= 28; i++) {
    const px = width * 0.52 + (i / 28) * (width * 0.40);
    const py =
      height * 0.34 +
      Math.sin(i * 0.55 + idx * 1.1) * 28 +
      Math.cos(i * 0.28 - idx) * 14;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  // 5. Subtle tactile grain (deterministic fast pseudo-noise dots)
  ctx.fillStyle = isLight ? 'rgba(11, 11, 11, 0.025)' : 'rgba(255, 255, 255, 0.025)';
  let seed = (idx + 1) * 9301;
  for (let i = 0; i < 900; i++) {
    seed = (seed * 49297 + 233280) % 233280;
    const gx = (seed / 233280) * width;
    seed = (seed * 49297 + 233280) % 233280;
    const gy = (seed / 233280) * height;
    ctx.fillRect(gx, gy, 2, 2);
  }

  // 6. 1px Inner Border in --line (2px at 2x DPR)
  ctx.strokeStyle = isLight ? 'rgba(11, 11, 11, 0.14)' : 'rgba(245, 245, 243, 0.18)';
  ctx.lineWidth = 3;
  drawRoundedRectPath(ctx, 20, 20, width - 40, height - 40, 36);
  ctx.stroke();

  // 7. TOP ROW: Index Pill ("01") + Domain Pill ("SRE / DEVOPS")
  const padX = 64;
  const topY = 64;

  // Index pill with accent fill & dark text
  drawRoundedRectPath(ctx, padX, topY, 96, 48, 24);
  ctx.fillStyle = pal.solid;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#0B0B0B';
  ctx.stroke();

  ctx.fillStyle = '#0B0B0B';
  ctx.font = '700 24px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(scenario.index, padX + 31, topY + 25);

  // Domain tag pill on top-right
  const domainText = scenario.domain.toUpperCase();
  ctx.font = '600 21px ui-monospace, SFMono-Regular, Menlo, monospace';
  const domainW = Math.max(180, ctx.measureText(domainText).width + 48);
  const domainX = width - padX - domainW;

  drawRoundedRectPath(ctx, domainX, topY, domainW, 48, 24);
  ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.92)' : 'rgba(28, 28, 36, 0.92)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = isLight ? 'rgba(11, 11, 11, 0.16)' : 'rgba(245, 245, 243, 0.22)';
  ctx.stroke();

  ctx.fillStyle = isLight ? '#0B0B0B' : '#F5F5F3';
  ctx.fillText(domainText, domainX + 24, topY + 25);

  // 8. CENTER: Bold Grotesk Scenario Title + Concise Summary
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = isLight ? '#0B0B0B' : '#F6F4EF';
  ctx.font = '700 62px "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, sans-serif';
  wrapCanvasText(ctx, scenario.title, padX, 250, width - padX * 2, 68, 2);

  ctx.fillStyle = isLight ? '#4A4A46' : '#B4B4AE';
  ctx.font = '500 28px "Bricolage Grotesque", -apple-system, BlinkMacSystemFont, sans-serif';
  wrapCanvasText(ctx, scenario.summary, padX, 392, width - padX * 2, 40, 2);

  // 9. BOTTOM DIVIDER & METRIC ROW
  const footerLineY = height - 168;
  ctx.strokeStyle = isLight ? 'rgba(11, 11, 11, 0.10)' : 'rgba(245, 245, 243, 0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padX, footerLineY);
  ctx.lineTo(width - padX, footerLineY);
  ctx.stroke();

  // Metric Label on bottom-left
  ctx.fillStyle = isLight ? '#6B6B66' : '#9A9A94';
  ctx.font = '600 21px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(scenario.metricLabel.toUpperCase(), padX, height - 108);

  ctx.fillStyle = isLight ? '#0B0B0B' : '#F6F4EF';
  ctx.font = '500 22px "Instrument Serif", Georgia, serif';
  ctx.fillText('verified production benchmark', padX, height - 74);

  // Metric Value Badge on bottom-right
  ctx.font = '800 44px "Bricolage Grotesque", sans-serif';
  const metricValText = scenario.metricValue;
  const valW = Math.max(168, ctx.measureText(metricValText).width + 56);
  const valX = width - padX - valW;
  const valY = height - 134;

  drawRoundedRectPath(ctx, valX, valY, valW, 74, 37);
  ctx.fillStyle = pal.solid;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#0B0B0B';
  ctx.stroke();

  ctx.fillStyle = '#0B0B0B';
  ctx.textBaseline = 'middle';
  ctx.fillText(metricValText, valX + 28, valY + 38);

  return canvas;
}

function buildScenarioCache(theme: ThemeMode) {
  if (scenarioTextureCache[theme] && scenarioDataUrlCache[theme]) {
    return;
  }

  const textures: THREE.CanvasTexture[] = [];
  const dataUrls: string[] = [];

  PRODUCT_SCENARIOS.forEach((scenario, idx) => {
    const canvas = createScenarioCanvas(scenario, idx, theme);
    dataUrls.push(canvas.toDataURL('image/png'));

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    textures.push(tex);
  });

  scenarioTextureCache[theme] = textures;
  scenarioDataUrlCache[theme] = dataUrls;
}

export function getScenarioCardTextures(theme: ThemeMode = 'light'): THREE.CanvasTexture[] {
  buildScenarioCache(theme);
  return scenarioTextureCache[theme]!;
}

export function getScenarioCardDataUrls(theme: ThemeMode = 'light'): string[] {
  buildScenarioCache(theme);
  return scenarioDataUrlCache[theme]!;
}

/** Backwards-compatible alias */
export function getProjectArtTextures(theme: ThemeMode = 'light'): THREE.CanvasTexture[] {
  return getScenarioCardTextures(theme);
}

/**
 * Generates expressive emissive face textures ('neutral', 'worried', 'thinking', 'happy')
 * for the persistent 3D Glass Orb guide.
 */
export function getOrbFaceTexture(
  expression: OrbExpression = 'neutral'
): THREE.CanvasTexture {
  if (cachedOrbFaces[expression]) {
    return cachedOrbFaces[expression]!;
  }

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(
    size * 0.42,
    size * 0.35,
    16,
    size * 0.5,
    size * 0.5,
    size * 0.52
  );

  if (expression === 'worried') {
    grad.addColorStop(0, '#ff856d');
    grad.addColorStop(0.42, '#b79cff');
    grad.addColorStop(0.78, '#2d5bff');
    grad.addColorStop(1, '#08090e');
  } else if (expression === 'thinking') {
    grad.addColorStop(0, '#b79cff');
    grad.addColorStop(0.4, '#2d5bff');
    grad.addColorStop(0.75, '#c6ff3d');
    grad.addColorStop(1, '#08090e');
  } else if (expression === 'happy') {
    grad.addColorStop(0, '#e3ff8c');
    grad.addColorStop(0.38, '#c6ff3d');
    grad.addColorStop(0.75, '#2d5bff');
    grad.addColorStop(1, '#08090e');
  } else {
    grad.addColorStop(0, '#d8ff7a');
    grad.addColorStop(0.38, '#2d5bff');
    grad.addColorStop(0.72, '#b79cff');
    grad.addColorStop(1, '#08090e');
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  for (let r = 64; r < size * 0.48; r += 48) {
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.shadowColor = '#c6ff3d';
  ctx.shadowBlur = 18;
  ctx.lineCap = 'round';
  ctx.lineWidth = 10;

  const leftEyeX = size * 0.43;
  const rightEyeX = size * 0.57;
  const eyeY = size * 0.46;

  if (expression === 'neutral') {
    ctx.beginPath();
    ctx.roundRect(leftEyeX - 8, eyeY - 26, 16, 52, 8);
    ctx.roundRect(rightEyeX - 8, eyeY - 26, 16, 52, 8);
    ctx.fill();
  } else if (expression === 'worried') {
    ctx.beginPath();
    ctx.roundRect(leftEyeX - 8, eyeY - 18, 16, 40, 8);
    ctx.roundRect(rightEyeX - 8, eyeY - 18, 16, 40, 8);
    ctx.fill();

    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(leftEyeX - 18, eyeY - 28);
    ctx.lineTo(leftEyeX + 12, eyeY - 38);
    ctx.moveTo(rightEyeX + 18, eyeY - 28);
    ctx.lineTo(rightEyeX - 12, eyeY - 38);
    ctx.stroke();
  } else if (expression === 'thinking') {
    ctx.beginPath();
    ctx.roundRect(leftEyeX - 14, eyeY - 7, 28, 14, 7);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(rightEyeX, eyeY - 4, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(size * 0.5, eyeY + 42, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (expression === 'happy') {
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.arc(leftEyeX, eyeY + 6, 18, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(rightEyeX, eyeY + 6, 18, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cachedOrbFaces[expression] = tex;
  return tex;
}

export function getHeroObjectTextures(): {
  outer: THREE.CanvasTexture;
  inner: THREE.CanvasTexture;
} {
  if (cachedHeroOuterTexture && cachedHeroInnerTexture) {
    return { outer: cachedHeroOuterTexture, inner: cachedHeroInnerTexture };
  }

  const w = 512;
  const h = 360;

  const outerCanvas = document.createElement('canvas');
  outerCanvas.width = w;
  outerCanvas.height = h;
  const oCtx = outerCanvas.getContext('2d')!;
  oCtx.fillStyle = '#111318';
  oCtx.fillRect(0, 0, w, h);

  oCtx.strokeStyle = 'rgba(245,245,243,0.12)';
  oCtx.lineWidth = 2;
  oCtx.strokeRect(24, 24, w - 48, h - 48);

  oCtx.fillStyle = '#b8ff2c';
  oCtx.beginPath();
  oCtx.arc(64, 64, 10, 0, Math.PI * 2);
  oCtx.fill();

  oCtx.fillStyle = '#f5f5f3';
  oCtx.font = '600 22px sans-serif';
  oCtx.fillText('nova // core-01', 88, 72);

  oCtx.fillStyle = 'rgba(245,245,243,0.4)';
  oCtx.font = '500 14px monospace';
  oCtx.fillText('CALIBRATED SPATIAL MONOLITH', 60, h - 48);

  cachedHeroOuterTexture = new THREE.CanvasTexture(outerCanvas);
  cachedHeroOuterTexture.colorSpace = THREE.SRGBColorSpace;

  const innerCanvas = document.createElement('canvas');
  innerCanvas.width = w;
  innerCanvas.height = h;
  const iCtx = innerCanvas.getContext('2d')!;

  const innerGrad = iCtx.createLinearGradient(0, 0, w, h);
  innerGrad.addColorStop(0, '#101829');
  innerGrad.addColorStop(0.5, '#1d2d5c');
  innerGrad.addColorStop(1, '#18112b');
  iCtx.fillStyle = innerGrad;
  iCtx.fillRect(0, 0, w, h);

  iCtx.strokeStyle = 'rgba(184, 255, 44, 0.32)';
  iCtx.lineWidth = 1.5;
  for (let x = 32; x < w; x += 32) {
    iCtx.beginPath();
    iCtx.moveTo(x, 24);
    iCtx.lineTo(x, h - 24);
    iCtx.stroke();
  }

  iCtx.strokeStyle = '#b8ff2c';
  iCtx.lineWidth = 3;
  iCtx.beginPath();
  for (let x = 40; x < w - 40; x += 8) {
    const y =
      h * 0.5 +
      Math.sin(x * 0.045) * 48 * Math.cos(x * 0.015) +
      Math.sin(x * 0.11) * 14;
    if (x === 40) iCtx.moveTo(x, y);
    else iCtx.lineTo(x, y);
  }
  iCtx.stroke();

  iCtx.fillStyle = '#f5f5f3';
  iCtx.font = '600 18px monospace';
  iCtx.fillText('60.0 FPS // ZERO-ALLOCATION LOOP', 44, 56);

  cachedHeroInnerTexture = new THREE.CanvasTexture(innerCanvas);
  cachedHeroInnerTexture.colorSpace = THREE.SRGBColorSpace;

  return { outer: cachedHeroOuterTexture, inner: cachedHeroInnerTexture };
}

export function disposeArtTextures(): void {
  (['light', 'dark'] as ThemeMode[]).forEach((mode) => {
    if (scenarioTextureCache[mode]) {
      scenarioTextureCache[mode]!.forEach((t) => t.dispose());
      scenarioTextureCache[mode] = null;
    }
    scenarioDataUrlCache[mode] = null;
  });

  Object.values(cachedOrbFaces).forEach((tex) => tex?.dispose());
  for (const key of Object.keys(cachedOrbFaces) as OrbExpression[]) {
    delete cachedOrbFaces[key];
  }
  if (cachedHeroOuterTexture) {
    cachedHeroOuterTexture.dispose();
    cachedHeroOuterTexture = null;
  }
  if (cachedHeroInnerTexture) {
    cachedHeroInnerTexture.dispose();
    cachedHeroInnerTexture = null;
  }
}
