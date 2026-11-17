import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(import.meta.dirname, '..');

describe('SEO, Accessibility & Deploy Readiness', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  it('includes essential SEO meta tags, Open Graph, Twitter Cards, and Vietnamese lang', () => {
    expect(doc.documentElement.lang).toBe('vi');
    expect(doc.querySelector('meta[name="viewport"]')?.getAttribute('content')).toContain(
      'viewport-fit=cover'
    );
    expect(doc.title.length).toBeGreaterThan(15);

    const desc = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    expect(desc.length).toBeGreaterThanOrEqual(80);
    expect(desc.length).toBeLessThanOrEqual(240);

    expect(doc.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('index');
    expect(doc.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBeTruthy();
    expect(
      doc.querySelector('meta[property="og:description"]')?.getAttribute('content')
    ).toBeTruthy();
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(
      './og-cover.png'
    );
    expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe(
      'summary_large_image'
    );
  });

  it('includes valid JSON-LD structured data and accessible landmarks', () => {
    const ldScript = doc.querySelector('script[type="application/ld+json"]');
    expect(ldScript).not.toBeNull();
    const jsonLd = JSON.parse(ldScript.textContent);
    expect(jsonLd['@type']).toBe('WebApplication');
    expect(jsonLd.inLanguage).toBe('vi');

    expect(doc.querySelector('main#app')).not.toBeNull();
    const h1s = doc.querySelectorAll('h1');
    expect(h1s.length).toBe(1);
    expect(h1s[0].classList.contains('sr-only')).toBe(true);
    expect(doc.querySelector('noscript')).not.toBeNull();
  });

  it('provides valid robots.txt, sitemap.xml, webmanifest, favicon, music, and OG assets', () => {
    const publicFiles = [
      'robots.txt',
      'sitemap.xml',
      'site.webmanifest',
      'favicon.svg',
      'og-cover.png',
      'apple-touch-icon.png',
      'music/theme.m4a'
    ];
    for (const file of publicFiles) {
      const p = path.join(ROOT, 'public', file);
      expect(fs.existsSync(p), `Missing public asset: ${file}`).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(30);
    }

    expect(fs.existsSync(path.join(ROOT, 'README.md'))).toBe(false);
    expect(doc.querySelector('audio#bg-music')?.getAttribute('src')).toBe('./music/theme.m4a');
    expect(doc.querySelector('button#btn-music-toggle')).not.toBeNull();

    const robots = fs.readFileSync(path.join(ROOT, 'public', 'robots.txt'), 'utf-8');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'public', 'site.webmanifest'), 'utf-8')
    );
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  it('has clean .gitignore ignoring node_modules and dist', () => {
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('node_modules/');
    expect(gitignore).toContain('dist/');
  });
});
