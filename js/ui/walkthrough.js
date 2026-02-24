// Walkthrough guide — paginated modal
// First visit: starts at page 0 (welcome), walks through everything.
// Subsequent visits: opens directly to the quick reference page,
// with full navigation available if the user wants to revisit.

const STORAGE_KEY = 'bsp-walkthrough-seen';
const QUICK_REF_PAGE = 8; // last page index — the reference card

const overlay   = document.getElementById('walkthroughOverlay');
const body      = document.getElementById('wtBody');
const progress  = document.getElementById('wtProgress');
const prevBtn   = document.getElementById('wtPrev');
const nextBtn   = document.getElementById('wtNext');
const closeBtn  = document.getElementById('wtClose');
const indicator = document.getElementById('wtPageIndicator');

const pages = body.querySelectorAll('.wt-page');
const total = pages.length;
let current = 0;

// Build progress pips (clickable)
for (let i = 0; i < total; i++) {
  const pip = document.createElement('div');
  pip.className = 'wt-pip';
  pip.addEventListener('click', () => show(i));
  progress.appendChild(pip);
}
const pips = progress.querySelectorAll('.wt-pip');

function show(index) {
  current = Math.max(0, Math.min(total - 1, index));

  pages.forEach(p => p.classList.remove('active'));
  pages[current].classList.add('active');

  pips.forEach((p, i) => {
    p.className = 'wt-pip';
    if (i < current) p.classList.add('done');
    if (i === current) p.classList.add('active');
  });

  prevBtn.disabled = current === 0;

  if (current === total - 1) {
    nextBtn.textContent = 'close';
    nextBtn.classList.remove('primary');
  } else {
    nextBtn.textContent = 'next \u2192';
    nextBtn.classList.add('primary');
  }

  indicator.textContent = `${current + 1} / ${total}`;
  body.scrollTop = 0;
}

function close() {
  overlay.style.display = 'none';
  // Mark as seen after first close — subsequent opens go to quick ref
  try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) { /* ok */ }
}

function open(startPage) {
  overlay.style.display = 'flex';
  show(startPage ?? 0);
}

function hasSeen() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { return false; }
}

// --- Navigation ---

prevBtn.addEventListener('click', () => show(current - 1));

nextBtn.addEventListener('click', () => {
  if (current === total - 1) close();
  else show(current + 1);
});

closeBtn.addEventListener('click', close);

// Keyboard: arrows, escape
overlay.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.stopPropagation(); close(); }
  if (e.key === 'ArrowRight') show(current + 1);
  if (e.key === 'ArrowLeft') show(current - 1);
});

// Backdrop click
overlay.addEventListener('click', (e) => {
  if (e.target === overlay) close();
});

// --- Wire the ? button ---
// Replaces the old guideOverlay handler from ui.js.
// First click after seeing the walkthrough → quick reference.
// First ever visit → full walkthrough from page 0.

document.getElementById('guideBtn').addEventListener('click', () => {
  open(hasSeen() ? QUICK_REF_PAGE : 0);
});

// --- Auto-show on first visit ---
if (!hasSeen()) {
  // Small delay so the app finishes rendering first
  requestAnimationFrame(() => open(0));
}
