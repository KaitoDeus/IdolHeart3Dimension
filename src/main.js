import './style.css';
import { CDRAMA_IDOLS } from './data/idols.js';
import { HeartScene } from './three/HeartScene.js';

const canvas = document.getElementById('heart-canvas');

const btnAutoRotate = document.getElementById('btn-auto-rotate');
const btnOpenGallery = document.getElementById('btn-open-gallery');
const btnToggle3DCards = document.getElementById('btn-toggle-3d-cards');
const btnResetView = document.getElementById('btn-reset-view');
const modeButtons = document.querySelectorAll('.mode-btn');

const galleryModal = document.getElementById('gallery-modal');
const idolGrid = document.getElementById('idol-grid');
const filterChips = document.querySelectorAll('.filter-chip');
const btnShuffle = document.getElementById('btn-shuffle-idols');
const closeGalleryTriggers = document.querySelectorAll('#btn-close-gallery, [data-close-gallery]');

const lightbox = document.getElementById('lightbox');
const lightboxCard = document.getElementById('lightbox-card');
const lightboxImg = document.getElementById('lightbox-img');
const lightboxIndex = document.getElementById('lightbox-index');
const lightboxHanzi = document.getElementById('lightbox-hanzi');
const lightboxName = document.getElementById('lightbox-name');
const lightboxEng = document.getElementById('lightbox-eng');
const lightboxTagline = document.getElementById('lightbox-tagline');
const lightboxDramas = document.getElementById('lightbox-dramas');
const lightboxCredit = document.getElementById('lightbox-credit');
const closeLightboxTriggers = document.querySelectorAll('#btn-close-lightbox, [data-close-lightbox]');
const btnLbPrev = document.getElementById('lightbox-prev');
const btnLbNext = document.getElementById('lightbox-next');
const mobileStepBtns = document.querySelectorAll('[data-lb-step]');

let orderedIdols = [...CDRAMA_IDOLS];
let activeFilter = 'all';
let currentLightboxList = [...orderedIdols];
let currentLightboxIdx = 0;
let currentMode = 'orbit';
let autoRotateEnabled = true;
let galleryOpenTimer = null;

const heartScene = new HeartScene(canvas, CDRAMA_IDOLS, {
  onHeartClick: () => {
    clearTimeout(galleryOpenTimer);
    galleryOpenTimer = setTimeout(() => {
      openGallery();
    }, 360);
  },
  onCardClick: (idolIndex) => {
    const clickedIdol = CDRAMA_IDOLS[idolIndex];
    if (!clickedIdol) return;
    currentLightboxList = [...orderedIdols];
    const idx = currentLightboxList.findIndex((item) => item.id === clickedIdol.id);
    openLightbox(idx >= 0 ? idx : 0);
  },
  onCardsVisibilityChange: (visible) => {
    btnToggle3DCards.classList.toggle('is-active', visible);
    btnToggle3DCards.setAttribute('aria-pressed', String(visible));
  }
});

function getFilteredIdols() {
  if (activeFilter === 'all') return orderedIdols;
  return orderedIdols.filter((item) => item.category === activeFilter);
}

function renderGalleryGrid() {
  const list = getFilteredIdols();
  currentLightboxList = list;
  idolGrid.innerHTML = '';

  const fragment = document.createDocumentFragment();
  list.forEach((idol, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'idol-card';
    card.style.animationDelay = `${Math.min(idx * 35, 350)}ms`;
    card.setAttribute('aria-label', `Xem ảnh ${idol.name}`);

    card.innerHTML = `
      <div class="idol-card-media">
        <img src="${idol.image}" alt="${idol.name} (${idol.englishName})" loading="lazy" />
        <div class="idol-card-overlay">
          <span class="idol-card-hanzi">${idol.hanzi}</span>
          <div class="idol-card-name">${idol.name}</div>
          <div class="idol-card-drama">${idol.dramas[0]}</div>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      openLightbox(idx);
    });

    fragment.appendChild(card);
  });

  idolGrid.appendChild(fragment);
}

function openGallery() {
  renderGalleryGrid();
  galleryModal.hidden = false;
  if (!heartScene.cardsRevealed) {
    heartScene.toggle3DCards(true);
  }
}

function closeGallery() {
  galleryModal.hidden = true;
}

function openLightbox(index) {
  if (!currentLightboxList.length) return;
  currentLightboxIdx =
    ((index % currentLightboxList.length) + currentLightboxList.length) %
    currentLightboxList.length;

  const idol = currentLightboxList[currentLightboxIdx];
  lightboxImg.src = idol.image;
  lightboxImg.alt = `${idol.name} (${idol.englishName})`;
  lightboxIndex.textContent = `${currentLightboxIdx + 1} / ${currentLightboxList.length}`;
  lightboxHanzi.textContent = idol.hanzi;
  lightboxName.textContent = idol.name;
  lightboxEng.textContent = idol.englishName;
  lightboxTagline.textContent = idol.tagline;
  lightboxCredit.textContent = `Nguồn ảnh: ${idol.credit}`;

  lightboxDramas.innerHTML = idol.dramas
    .map((drama) => `<span class="drama-tag">${drama}</span>`)
    .join('');

  lightbox.hidden = false;
}

function closeLightbox() {
  lightbox.hidden = true;
}

function stepLightbox(delta) {
  openLightbox(currentLightboxIdx + delta);
}

// Mode switching: Orbit 360 vs Free Drag & Drop
modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const nextMode = btn.dataset.mode;
    currentMode = nextMode;
    modeButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
    heartScene.setMode(nextMode);
  });
});

btnAutoRotate.addEventListener('click', () => {
  autoRotateEnabled = !autoRotateEnabled;
  btnAutoRotate.classList.toggle('is-active', autoRotateEnabled);
  btnAutoRotate.setAttribute('aria-pressed', String(autoRotateEnabled));
  heartScene.setAutoRotate(autoRotateEnabled);
});

btnOpenGallery.addEventListener('click', () => {
  heartScene.triggerHeartCelebration();
  openGallery();
});

btnToggle3DCards.addEventListener('click', () => {
  heartScene.toggle3DCards();
});

btnResetView.addEventListener('click', () => {
  heartScene.resetView();
});

filterChips.forEach((chip) => {
  chip.addEventListener('click', () => {
    activeFilter = chip.dataset.filter;
    filterChips.forEach((c) => {
      const active = c === chip;
      c.classList.toggle('is-active', active);
      c.setAttribute('aria-selected', String(active));
    });
    renderGalleryGrid();
  });
});

btnShuffle.addEventListener('click', () => {
  for (let i = orderedIdols.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [orderedIdols[i], orderedIdols[j]] = [orderedIdols[j], orderedIdols[i]];
  }
  renderGalleryGrid();
});

closeGalleryTriggers.forEach((el) => el.addEventListener('click', closeGallery));
closeLightboxTriggers.forEach((el) => el.addEventListener('click', closeLightbox));

btnLbPrev.addEventListener('click', () => stepLightbox(-1));
btnLbNext.addEventListener('click', () => stepLightbox(1));
mobileStepBtns.forEach((btn) =>
  btn.addEventListener('click', () => stepLightbox(Number(btn.dataset.lbStep)))
);

// Keyboard navigation
window.addEventListener('keydown', (e) => {
  if (!lightbox.hidden) {
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft') stepLightbox(-1);
    else if (e.key === 'ArrowRight') stepLightbox(1);
    return;
  }

  if (!galleryModal.hidden && e.key === 'Escape') {
    closeGallery();
  }
});

// Touch swipe navigation in Lightbox for mobile & tablet
let touchStartX = 0;
let touchStartY = 0;

lightboxCard.addEventListener(
  'touchstart',
  (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  },
  { passive: true }
);

lightboxCard.addEventListener(
  'touchend',
  (e) => {
    if (e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      stepLightbox(dx < 0 ? 1 : -1);
    }
  },
  { passive: true }
);
