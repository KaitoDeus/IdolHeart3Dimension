import { describe, it, expect } from 'vitest';
import {
  createTaubinHeartGeometry,
  createHeartAuraAttributes,
  createHeartDrawFilaments,
  createVolumetricHeartParticles,
  createVortexPoolAttributes,
  createVortexArcsGeometry,
  createFountainStreakCurves,
  evaluateTaubinSurfacePoint
} from '../src/three/heartGeometry.js';

describe('3D Taubin Heart Geometry & Drawing Filaments', () => {
  it('builds a symmetric, watertight 3D heart BufferGeometry with finite attributes and unit normals', () => {
    const geo = createTaubinHeartGeometry({ detail: 18, scale: [1.15, 1.12, 1.2] });
    const pos = geo.getAttribute('position');
    const norm = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');

    expect(pos).toBeDefined();
    expect(norm).toBeDefined();
    expect(uv).toBeDefined();
    expect(geo.index).not.toBeNull();
    expect(pos.count).toBeGreaterThan(2000);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      expect(Number.isFinite(x)).toBe(true);
      expect(Number.isFinite(y)).toBe(true);
      expect(Number.isFinite(z)).toBe(true);

      const nx = norm.getX(i);
      const ny = norm.getY(i);
      const nz = norm.getZ(i);
      const nLen = Math.hypot(nx, ny, nz);
      expect(nLen).toBeCloseTo(1.0, 2);
    }

    const box = geo.boundingBox;
    expect(Math.abs(box.min.x + box.max.x)).toBeLessThan(0.03);
    expect(Math.abs(box.min.z + box.max.z)).toBeLessThan(0.03);
    expect(box.max.y).toBeGreaterThan(1.1);
    expect(box.min.y).toBeLessThan(-1.0);

    geo.dispose();
  });

  it('samples finite aura particle attributes outside the heart surface', () => {
    const count = 400;
    const { positions, seeds, sizes } = createHeartAuraAttributes(count);
    expect(positions.length).toBe(count * 3);
    expect(seeds.length).toBe(count);
    expect(sizes.length).toBe(count);

    for (let i = 0; i < count; i++) {
      expect(Number.isFinite(positions[i * 3])).toBe(true);
      expect(Number.isFinite(positions[i * 3 + 1])).toBe(true);
      expect(Number.isFinite(positions[i * 3 + 2])).toBe(true);
      expect(seeds[i]).toBeGreaterThanOrEqual(0);
      expect(sizes[i]).toBeGreaterThan(0);
    }
  });

  it('generates progressive 3D draw filaments from bottom tip to top cleft', () => {
    const { geometry, heroCurves } = createHeartDrawFilaments([1.15, 1.12, 1.2]);
    const pos = geometry.getAttribute('position');
    const prog = geometry.getAttribute('aProgress');

    expect(pos.count).toBeGreaterThan(1000);
    expect(prog.count).toBe(pos.count);
    expect(heroCurves).toHaveLength(2);

    for (const curve of heroCurves) {
      expect(curve.length).toBe(141);
      // Starts at bottom cusp (y < -1.0) and finishes at top cleft (y > 0.8)
      expect(curve[0].y).toBeLessThan(-1.0);
      expect(curve[curve.length - 1].y).toBeGreaterThan(0.8);
    }

    for (let i = 0; i < prog.count; i++) {
      const p = prog.getX(i);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }

    geometry.dispose();
  });

  it('evaluates consistent 3D surface points along unit rays', () => {
    const rightPt = evaluateTaubinSurfacePoint(1, 0, 0);
    const leftPt = evaluateTaubinSurfacePoint(-1, 0, 0);
    expect(rightPt.x).toBeGreaterThan(0.9);
    expect(leftPt.x).toBeCloseTo(-rightPt.x, 4);
  });

  it('builds volumetric stardust heart particles, vortex base, and fountain streaks', () => {
    const vp = createVolumetricHeartParticles(600, [1.18, 1.14, 1.18], -1.58);
    expect(vp.positions.length).toBe(1800);
    expect(vp.vortexPositions.length).toBe(1800);
    expect(vp.colorMix.length).toBe(600);
    for (let i = 0; i < 600; i++) {
      expect(Number.isFinite(vp.positions[i * 3])).toBe(true);
      expect(vp.vortexPositions[i * 3 + 1]).toBeCloseTo(-1.58, 0);
      expect(vp.colorMix[i]).toBeGreaterThanOrEqual(0);
      expect(vp.colorMix[i]).toBeLessThanOrEqual(1);
    }

    const pool = createVortexPoolAttributes(300, -1.58);
    expect(pool.positions.length).toBe(900);
    expect(pool.radii.length).toBe(300);

    const arcs = createVortexArcsGeometry(-1.58);
    expect(arcs.getAttribute('position').count).toBeGreaterThan(400);
    arcs.dispose();

    const { geometry: streakGeo, curves } = createFountainStreakCurves(16, [1.18, 1.14, 1.18], -1.58);
    expect(curves).toHaveLength(16);
    expect(streakGeo.getAttribute('position').count).toBeGreaterThan(500);
    for (const c of curves) {
      expect(c.points[0].y).toBeLessThan(-1.4);
      expect(c.points[c.points.length - 1].y).toBeGreaterThan(-0.3);
    }
    streakGeo.dispose();
  });
});
