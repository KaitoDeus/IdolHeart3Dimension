// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');

let sceneCallbacks = null;
const mockSceneInstance = {
  cardsRevealed: false,
  setMode: vi.fn(),
  setAutoRotate: vi.fn(),
  toggle3DCards: vi.fn((force) => {
    mockSceneInstance.cardsRevealed =
      force !== null && force !== undefined ? force : !mockSceneInstance.cardsRevealed;
    sceneCallbacks?.onCardsVisibilityChange?.(mockSceneInstance.cardsRevealed);
  }),
  triggerHeartCelebration: vi.fn(() => {
    mockSceneInstance.toggle3DCards(true);
  }),
  resetView: vi.fn()
};

vi.mock('../src/three/HeartScene.js', () => ({
  HeartScene: vi.fn(function (_canvas, _idols, callbacks) {
    sceneCallbacks = callbacks;
    return mockSceneInstance;
  })
}));

describe('UI Interactions, Click Events, Filters & Lightbox', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    mockSceneInstance.cardsRevealed = false;
    vi.clearAllMocks();

    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
    document.open();
    document.write(html);
    document.close();

    await import('../src/main.js');
  });

  it('opens the C-drama idol gallery when the 3D heart click callback fires', () => {
    const gallery = document.getElementById('gallery-modal');
    expect(gallery.hidden).toBe(true);

    sceneCallbacks.onHeartClick();
    vi.advanceTimersByTime(400);

    expect(gallery.hidden).toBe(false);
    const cards = document.querySelectorAll('.idol-card');
    expect(cards.length).toBe(14);
    expect(mockSceneInstance.toggle3DCards).toHaveBeenCalledWith(true);
  });

  it('filters idols by Nữ thần (actress) and Nam thần (actor)', () => {
    document.getElementById('btn-open-gallery').click();
    expect(document.querySelectorAll('.idol-card').length).toBe(14);

    const actressTab = document.querySelector('[data-filter="actress"]');
    actressTab.click();
    const actressCount = document.querySelectorAll('.idol-card').length;
    expect(actressCount).toBe(6);

    const actorTab = document.querySelector('[data-filter="actor"]');
    actorTab.click();
    const actorCount = document.querySelectorAll('.idol-card').length;
    expect(actorCount).toBe(8);
    expect(actressCount + actorCount).toBe(14);
  });

  it('opens Lightbox when clicking a 3D card or gallery card and navigates cleanly', () => {
    const lightbox = document.getElementById('lightbox');
    expect(lightbox.hidden).toBe(true);

    sceneCallbacks.onCardClick(0);
    expect(lightbox.hidden).toBe(false);
    expect(document.getElementById('lightbox-name').textContent).toBe('Tiêu Chiến');

    document.getElementById('lightbox-next').click();
    expect(document.getElementById('lightbox-name').textContent).toBe('Địch Lệ Nhiệt Ba');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(document.getElementById('lightbox-name').textContent).toBe('Tiêu Chiến');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(lightbox.hidden).toBe(true);
  });

  it('switches between Xoay 360° and Kéo thả tự do modes and resets view', () => {
    const dragBtn = document.getElementById('mode-drag');
    const orbitBtn = document.getElementById('mode-orbit');

    dragBtn.click();
    expect(mockSceneInstance.setMode).toHaveBeenCalledWith('drag');
    expect(dragBtn.classList.contains('is-active')).toBe(true);

    orbitBtn.click();
    expect(mockSceneInstance.setMode).toHaveBeenCalledWith('orbit');
    expect(orbitBtn.classList.contains('is-active')).toBe(true);

    document.getElementById('btn-reset-view').click();
    expect(mockSceneInstance.resetView).toHaveBeenCalledTimes(1);
  });
});
