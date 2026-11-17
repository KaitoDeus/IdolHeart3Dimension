import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { CDRAMA_IDOLS } from '../src/data/idols.js';

const ROOT = path.resolve(import.meta.dirname, '..');

describe('C-Drama Idol Dataset & Local Portrait Assets', () => {
  it('contains 14 unique C-drama idols with complete Vietnamese & drama metadata', () => {
    expect(CDRAMA_IDOLS.length).toBe(14);

    const ids = new Set();
    for (const idol of CDRAMA_IDOLS) {
      expect(idol.id).toBeTruthy();
      expect(ids.has(idol.id)).toBe(false);
      ids.add(idol.id);

      expect(idol.name).toBeTruthy();
      expect(idol.englishName).toBeTruthy();
      expect(idol.hanzi).toBeTruthy();
      expect(['actor', 'actress']).toContain(idol.category);
      expect(Array.isArray(idol.dramas) && idol.dramas.length).toBeGreaterThanOrEqual(2);
      expect(idol.tagline).toBeTruthy();
      expect(idol.credit).toContain('CC');
    }

    const actors = CDRAMA_IDOLS.filter((i) => i.category === 'actor');
    const actresses = CDRAMA_IDOLS.filter((i) => i.category === 'actress');
    expect(actors.length).toBeGreaterThanOrEqual(5);
    expect(actresses.length).toBeGreaterThanOrEqual(5);
  });

  it('verifies every idol image file exists in public/idols and is a valid JPEG', () => {
    for (const idol of CDRAMA_IDOLS) {
      const rel = idol.image.replace(/^\.\//, '');
      const fullPath = path.join(ROOT, 'public', rel);
      expect(fs.existsSync(fullPath), `Missing image: ${fullPath}`).toBe(true);

      const buf = fs.readFileSync(fullPath);
      expect(buf.length).toBeGreaterThan(20_000);
      // JPEG magic bytes FF D8
      expect(buf[0]).toBe(0xff);
      expect(buf[1]).toBe(0xd8);
    }
  });
});
