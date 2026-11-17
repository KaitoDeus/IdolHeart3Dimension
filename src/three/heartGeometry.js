import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const CENTER_Y = 0.15;

/**
 * Evaluates Taubin's implicit 3D heart surface with +Y as up and +Z as depth.
 * F(x, y, z) <= 0 inside the heart, > 0 outside.
 */
function taubinValue(x, y, z) {
  const a = x * x + 2.25 * z * z + y * y - 1.0;
  const y3 = y * y * y;
  return a * a * a - x * x * y3 - 0.1125 * z * z * y3;
}

/**
 * Analytic outward gradient of Taubin's heart surface.
 */
function taubinGradient(x, y, z) {
  const a = x * x + 2.25 * z * z + y * y - 1.0;
  const a2 = a * a;
  const y2 = y * y;
  const y3 = y2 * y;

  const gx = 6.0 * x * a2 - 2.0 * x * y3;
  const gy = 6.0 * y * a2 - 3.0 * y2 * (x * x + 0.1125 * z * z);
  const gz = 13.5 * z * a2 - 0.225 * z * y3;

  return [gx, gy, gz];
}

/**
 * Finds the exact surface radius r along unit ray (dx, dy, dz) from (0, CENTER_Y, 0).
 */
function findSurfaceRadius(dx, dy, dz) {
  let lo = 0.0;
  let hi = 1.65;

  while (taubinValue(hi * dx, CENTER_Y + hi * dy, hi * dz) <= 0.0 && hi < 3.0) {
    hi += 0.35;
  }

  for (let i = 0; i < 24; i++) {
    const mid = 0.5 * (lo + hi);
    if (taubinValue(mid * dx, CENTER_Y + mid * dy, mid * dz) <= 0.0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

/**
 * Generates a watertight, ultra-smooth 3D heart BufferGeometry by projecting a
 * vertex-merged icosphere onto Taubin's implicit heart manifold.
 */
export function createTaubinHeartGeometry({
  detail = 18,
  scale = [1.18, 1.15, 1.22]
} = {}) {
  const base = new THREE.IcosahedronGeometry(1, detail);
  // Remove base normals/uvs before merging so vertices merge cleanly by position
  base.deleteAttribute('normal');
  base.deleteAttribute('uv');

  const geo = mergeVertices(base, 1e-4);
  base.dispose();

  const posAttr = geo.getAttribute('position');
  const count = posAttr.count;
  const rawPoints = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);

  const [sx, sy, sz] = scale;

  for (let i = 0; i < count; i++) {
    const dx = posAttr.getX(i);
    const dy = posAttr.getY(i);
    const dz = posAttr.getZ(i);
    const len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const uz = dz / len;

    const r = findSurfaceRadius(ux, uy, uz);
    const hx = r * ux;
    const hy = CENTER_Y + r * uy;
    const hz = r * uz;

    rawPoints[i * 3] = hx;
    rawPoints[i * 3 + 1] = hy;
    rawPoints[i * 3 + 2] = hz;

    // Center visually around y = 0
    posAttr.setXYZ(i, hx * sx, (hy - 0.12) * sy, hz * sz);

    // Spherical/planar UV mapping for subtle shader accents
    uvs[i * 2] = 0.5 + Math.atan2(uz, ux) / (2 * Math.PI);
    uvs[i * 2 + 1] = (hy + 1.0) / 2.25;
  }

  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();

  // Blend analytic implicit-surface gradient normals for mirror-smooth specular reflections
  const normAttr = geo.getAttribute('normal');
  for (let i = 0; i < count; i++) {
    const hx = rawPoints[i * 3];
    const hy = rawPoints[i * 3 + 1];
    const hz = rawPoints[i * 3 + 2];

    const [gx, gy, gz] = taubinGradient(hx, hy, hz);
    const nx = gx / sx;
    const ny = gy / sy;
    const nz = gz / sz;
    const glen = Math.hypot(nx, ny, nz);

    // Near the bottom cusp or cleft crease, analytic gradient approaches 0; keep vertex normal
    if (glen > 0.08) {
      const blend = Math.min(1, (glen - 0.08) / 0.35);
      const vx = normAttr.getX(i);
      const vy = normAttr.getY(i);
      const vz = normAttr.getZ(i);

      const mx = THREE.MathUtils.lerp(vx, nx / glen, blend);
      const my = THREE.MathUtils.lerp(vy, ny / glen, blend);
      const mz = THREE.MathUtils.lerp(vz, nz / glen, blend);
      const mlen = Math.hypot(mx, my, mz) || 1;
      normAttr.setXYZ(i, mx / mlen, my / mlen, mz / mlen);
    }
  }

  normAttr.needsUpdate = true;
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  return geo;
}

/**
 * Samples luminous aura particle positions floating just outside the 3D heart surface.
 */
export function createHeartAuraAttributes(count = 1500, scale = [1.26, 1.23, 1.3]) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const [sx, sy, sz] = scale;

  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);

    const dx = Math.sin(phi) * Math.cos(theta);
    const dy = Math.cos(phi);
    const dz = Math.sin(phi) * Math.sin(theta);

    const r = findSurfaceRadius(dx, dy, dz);
    const shellOffset = 1.03 + Math.pow(Math.random(), 1.8) * 0.38;

    const px = r * dx * shellOffset * sx;
    const py = (CENTER_Y + r * dy * shellOffset - 0.12) * sy;
    const pz = r * dz * shellOffset * sz;

    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;

    seeds[i] = Math.random() * Math.PI * 2;
    sizes[i] = 0.65 + Math.random() * 1.45;
  }

  return { positions, seeds, sizes };
}

/**
 * Evaluates a point on Taubin's 3D heart surface along unit ray (ux, uy, uz).
 */
export function evaluateTaubinSurfacePoint(
  ux,
  uy,
  uz,
  scale = [1.15, 1.12, 1.2],
  inflate = 1.0
) {
  const r = findSurfaceRadius(ux, uy, uz) * inflate;
  const [sx, sy, sz] = scale;
  return new THREE.Vector3(
    r * ux * sx,
    (CENTER_Y + r * uy - 0.12) * sy,
    r * uz * sz
  );
}

/**
 * Generates 3D surface-hugging sketch filament segments used for the initial
 * draw-in animation (sweeping from bottom tip up around the lobes to the cleft).
 */
export function createHeartDrawFilaments(scale = [1.15, 1.12, 1.2]) {
  const configs = [
    // Primary left & right silhouette traces
    { phi0: 0.0, twist: 0.0, steps: 140, isHero: true },
    { phi0: Math.PI, twist: 0.0, steps: 140, isHero: true },
    // Front & back 3D contour ribs
    { phi0: Math.PI * 0.5, twist: 0.0, steps: 120, isHero: false },
    { phi0: Math.PI * 1.5, twist: 0.0, steps: 120, isHero: false },
    { phi0: 0.65, twist: 0.2, steps: 120, isHero: false },
    { phi0: Math.PI - 0.65, twist: -0.2, steps: 120, isHero: false },
    { phi0: Math.PI + 0.65, twist: 0.2, steps: 120, isHero: false },
    { phi0: -0.65, twist: -0.2, steps: 120, isHero: false },
    // Graceful 3D helical wraps
    { phi0: 0.2, twist: Math.PI * 1.25, steps: 150, isHero: false },
    { phi0: Math.PI + 0.2, twist: -Math.PI * 1.25, steps: 150, isHero: false }
  ];

  const positions = [];
  const progresses = [];
  const heroFlags = [];
  const heroCurves = [];

  for (const cfg of configs) {
    const pts = [];
    for (let i = 0; i <= cfg.steps; i++) {
      const t = i / cfg.steps; // 0 = bottom tip, 1 = top cleft
      const theta = Math.PI * (1.0 - t);
      const phi = cfg.phi0 + cfg.twist * t;

      const ux = Math.sin(theta) * Math.cos(phi);
      const uy = Math.cos(theta);
      const uz = Math.sin(theta) * Math.sin(phi);

      const pt = evaluateTaubinSurfacePoint(ux, uy, uz, scale, 1.022);
      pts.push(pt);
    }

    if (cfg.isHero) {
      heroCurves.push(pts);
    }

    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const t0 = i / cfg.steps;
      const t1 = (i + 1) / cfg.steps;

      positions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
      progresses.push(t0, t1);
      heroFlags.push(cfg.isHero ? 1.0 : 0.0, cfg.isHero ? 1.0 : 0.0);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aProgress', new THREE.Float32BufferAttribute(progresses, 1));
  geometry.setAttribute('aHero', new THREE.Float32BufferAttribute(heroFlags, 1));

  return { geometry, heroCurves };
}

/**
 * Generates a high-contrast astronomical 4-point diffraction-spike star texture
 * for cosmic highlight stars.
 */
export function createCosmicHighlightStarTexture() {
  const size = 256;
  const cx = size / 2;
  const cy = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Soft outer celestial halo
  const outerHalo = ctx.createRadialGradient(cx, cy, 0, cx, cy, cx);
  outerHalo.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  outerHalo.addColorStop(0.08, 'rgba(255, 248, 225, 0.95)');
  outerHalo.addColorStop(0.22, 'rgba(253, 224, 171, 0.42)');
  outerHalo.addColorStop(0.45, 'rgba(251, 182, 206, 0.14)');
  outerHalo.addColorStop(1.0, 'rgba(251, 182, 206, 0.0)');
  ctx.fillStyle = outerHalo;
  ctx.fillRect(0, 0, size, size);

  const drawSpike = (angleRad, length, width, alpha) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    const grad = ctx.createLinearGradient(-length, 0, length, 0);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 0)');
    grad.addColorStop(0.38, `rgba(255, 240, 210, ${alpha * 0.45})`);
    grad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
    grad.addColorStop(0.62, `rgba(255, 240, 210, ${alpha * 0.45})`);
    grad.addColorStop(1.0, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-length, 0);
    ctx.quadraticCurveTo(0, -width, length, 0);
    ctx.quadraticCurveTo(0, width, -length, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  // Primary 4 diffraction rays
  drawSpike(0, 122, 4.2, 0.98);
  drawSpike(Math.PI / 2, 122, 4.2, 0.98);
  // Subtle diagonal micro-rays
  drawSpike(Math.PI / 4, 62, 2.2, 0.55);
  drawSpike(-Math.PI / 4, 62, 2.2, 0.55);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates a crisp pinpoint starlight dot texture for distant universe stars.
 */
export function createTwinkleStarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.18, 'rgba(240, 249, 255, 0.9)');
  grad.addColorStop(0.45, 'rgba(224, 231, 255, 0.28)');
  grad.addColorStop(1.0, 'rgba(224, 231, 255, 0.0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates a soft glowing circular bokeh sprite texture.
 */
export function createGlowSpriteTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.25, 'rgba(255, 210, 228, 0.85)');
  grad.addColorStop(0.6, 'rgba(244, 63, 94, 0.25)');
  grad.addColorStop(1.0, 'rgba(244, 63, 94, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates a delicate mini-heart particle sprite texture for click bursts.
 */
export function createMiniHeartTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');

  ctx.save();
  ctx.translate(48, 50);
  ctx.scale(1.65, 1.65);

  ctx.shadowColor = 'rgba(255, 160, 195, 0.95)';
  ctx.shadowBlur = 10;

  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.bezierCurveTo(-18, 0, -22, -16, -9, -19);
  ctx.bezierCurveTo(-2, -20, 0, -13, 0, -11);
  ctx.bezierCurveTo(0, -13, 2, -20, 9, -19);
  ctx.bezierCurveTo(22, -16, 18, 0, 0, 12);
  ctx.closePath();

  const grad = ctx.createRadialGradient(0, -5, 2, 0, -2, 22);
  grad.addColorStop(0, '#fff7fa');
  grad.addColorStop(0.45, '#fda4af');
  grad.addColorStop(1, '#e11d48');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates a sleek luxury photocard backplate texture for the reverse side of 3D cards.
 */
export function createCardBackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 360;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 360, 480);
  bg.addColorStop(0, '#2a0a18');
  bg.addColorStop(0.5, '#190612');
  bg.addColorStop(1, '#260919');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 360, 480);

  // Subtle gold hairline border
  ctx.strokeStyle = 'rgba(253, 186, 116, 0.5)';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, 324, 444);

  // Center heart emblem
  ctx.save();
  ctx.translate(180, 225);
  ctx.scale(2.8, 2.8);
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.bezierCurveTo(-18, 0, -22, -16, -9, -19);
  ctx.bezierCurveTo(-2, -20, 0, -13, 0, -11);
  ctx.bezierCurveTo(0, -13, 2, -20, 9, -19);
  ctx.bezierCurveTo(22, -16, 18, 0, 0, 12);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(251, 113, 133, 0.75)';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(253, 230, 238, 0.75)';
  ctx.font = '600 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('C-DRAMA STARLIGHT', 180, 315);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Renders a portrait image onto a crisp rounded-frame 3D photocard CanvasTexture.
 */
export function createPhotocardTexture(idol, img) {
  const w = 420;
  const h = 560;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Card dark velvet base
  const bgGrad = ctx.createLinearGradient(0, 0, w, h);
  bgGrad.addColorStop(0, '#2a0f1c');
  bgGrad.addColorStop(1, '#12060d');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Center-crop image into upper frame (cover fit with face-biased vertical crop)
  const pad = 16;
  const imgW = w - pad * 2;
  const imgH = 448;

  ctx.save();
  roundRectPath(ctx, pad, pad, imgW, imgH, 18);
  ctx.clip();

  const srcAspect = img.naturalWidth / img.naturalHeight;
  const dstAspect = imgW / imgH;
  let drawW, drawH, offsetX, offsetY;

  if (srcAspect > dstAspect) {
    drawH = imgH;
    drawW = imgH * srcAspect;
    offsetX = pad - (drawW - imgW) * 0.5;
    offsetY = pad;
  } else {
    drawW = imgW;
    drawH = imgW / srcAspect;
    offsetX = pad;
    // Slight upper bias (0.22) so portrait faces are never cropped
    offsetY = pad - (drawH - imgH) * 0.22;
  }
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

  // Subtle bottom vignette over portrait
  const vig = ctx.createLinearGradient(0, pad + imgH - 95, 0, pad + imgH);
  vig.addColorStop(0, 'rgba(18, 6, 13, 0)');
  vig.addColorStop(1, 'rgba(18, 6, 13, 0.65)');
  ctx.fillStyle = vig;
  ctx.fillRect(pad, pad + imgH - 95, imgW, 95);
  ctx.restore();

  // Rose-gold border accent around portrait
  ctx.save();
  roundRectPath(ctx, pad, pad, imgW, imgH, 18);
  ctx.strokeStyle = 'rgba(255, 210, 224, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // Outer card frame
  ctx.save();
  roundRectPath(ctx, 4, 4, w - 8, h - 8, 24);
  ctx.strokeStyle = 'rgba(251, 146, 172, 0.55)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // Nameplate below portrait
  ctx.fillStyle = '#fff1f5';
  ctx.font = '700 26px "Be Vietnam Pro", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(idol.name, w / 2, 502);

  ctx.fillStyle = 'rgba(253, 186, 200, 0.85)';
  ctx.font = '500 17px "Be Vietnam Pro", system-ui, sans-serif';
  ctx.fillText(`${idol.hanzi} · ${idol.englishName}`, w / 2, 532);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function roundRectPath(ctx, x, y, w, h, r) {
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
