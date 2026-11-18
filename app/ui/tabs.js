// Tabs (SPEC_ETAPPE2 1.3): a tab list and its panels. Reachable by keyboard: arrow keys, Home, End move
// and select; Tab leaves the list into the panel. The markup is in index.html:
//   [role=tablist] > button[role=tab][data-tab=<id>][aria-controls]   and   [role=tabpanel][data-panel=<id>]
// Used twice: right side (Sketch | Result) and inside Result (Overview, Slices, Messages).

/**
 * list: the tablist element; panels: the container that holds the tab panels;
 * onSelect(id): called after the user (or select()) changed the tab.
 */
export function createTabs({ list, panels, onSelect }) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const shown = () => tabs.filter((t) => !t.hidden); // a tab can be hidden (Supports without supports in the result)
  const idOf = (tab) => tab.dataset.tab;
  let current = null;

  function select(id, { focus = false, silent = false } = {}) {
    const tab = tabs.find((t) => idOf(t) === id);
    if (!tab) return;
    const changed = current !== id;
    current = id;
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    }
    // only the direct children: a panel may hold a second tab list with its own panels (outer and inner tabs)
    for (const p of panels.querySelectorAll(':scope > [role="tabpanel"]')) p.hidden = p.dataset.panel !== id;
    if (focus) tab.focus();
    if (changed && !silent && onSelect) onSelect(id);
  }

  list.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) select(idOf(tab));
  });
  list.addEventListener('keydown', (e) => {
    const visible = shown();
    const i = visible.findIndex((t) => idOf(t) === current);
    const next = { ArrowRight: (i + 1) % visible.length, ArrowLeft: (i - 1 + visible.length) % visible.length, Home: 0, End: visible.length - 1 }[e.key];
    if (next === undefined || !visible.length) return;
    e.preventDefault();
    select(idOf(visible[next]), { focus: true });
  });

  select(idOf(tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0]), { silent: true });

  return {
    select: (id) => select(id),
    get current() {
      return current;
    },
  };
}
