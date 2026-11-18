// Adjustable width of the input panel (mouse, touch and keyboard).

const MIN_WIDTH = 280;
const MIN_OUTPUT_WIDTH = 320;
const STEP = 16;

/** Make `splitter` resize the first column of `layout` through the CSS variable --input-width. */
export function initSplitter(splitter, layout) {
  const defaultWidth = parseFloat(getComputedStyle(layout).getPropertyValue('--input-width')) || 420;
  const maxWidth = () => Math.max(MIN_WIDTH, layout.clientWidth - MIN_OUTPUT_WIDTH);
  let width = defaultWidth;

  const set = (w) => {
    width = Math.min(Math.max(w, MIN_WIDTH), maxWidth());
    layout.style.setProperty('--input-width', `${width}px`);
    splitter.setAttribute('aria-valuemin', String(MIN_WIDTH));
    splitter.setAttribute('aria-valuemax', String(Math.round(maxWidth())));
    splitter.setAttribute('aria-valuenow', String(Math.round(width)));
  };
  set(defaultWidth);

  splitter.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add('is-dragging');
    e.preventDefault();
  });
  splitter.addEventListener('pointermove', (e) => {
    if (!splitter.hasPointerCapture(e.pointerId)) return;
    set(e.clientX - layout.getBoundingClientRect().left);
  });
  const end = (e) => {
    if (splitter.hasPointerCapture(e.pointerId)) splitter.releasePointerCapture(e.pointerId);
    splitter.classList.remove('is-dragging');
  };
  splitter.addEventListener('pointerup', end);
  splitter.addEventListener('pointercancel', end);

  splitter.addEventListener('keydown', (e) => {
    const actions = {
      ArrowLeft: () => set(width - STEP),
      ArrowRight: () => set(width + STEP),
      Home: () => set(MIN_WIDTH),
      End: () => set(maxWidth()),
      Enter: () => set(defaultWidth),
    };
    if (!actions[e.key]) return;
    actions[e.key]();
    e.preventDefault();
  });
  splitter.addEventListener('dblclick', () => set(defaultWidth));
  window.addEventListener('resize', () => set(width));
}
