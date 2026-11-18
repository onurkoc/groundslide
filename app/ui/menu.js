// Small menu at a button (SPEC_ETAPPE2 8.4, "Grafik exportieren": PNG or SVG). Keyboard: Enter, Space or arrow down at the
// button open it and put the focus on the first entry; arrows, Home and End move; Enter or Space choose; Esc closes and
// gives the focus back to the button; Tab or a click outside closes. Markup (index.html):
//   <button aria-haspopup="menu" aria-expanded="false" aria-controls="id">  and  <ul role="menu" id="id" hidden>
//   with <li role="none"><button role="menuitem" data-format="..."></li> entries.

/** button: the opening button; menu: the list; onSelect(value): the data-format of the chosen entry. */
export function createMenu({ button, menu, onSelect }) {
  const items = () => [...menu.querySelectorAll('[role="menuitem"]')];

  function isOpen() {
    return !menu.hidden;
  }
  function close({ focus = false } = {}) {
    if (!isOpen()) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focus) button.focus();
  }
  function open({ focusFirst = true } = {}) {
    if (button.disabled) return;
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    if (focusFirst) items()[0]?.focus();
  }

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isOpen()) close();
    else open({ focusFirst: e.detail === 0 }); // detail 0: keyboard (Enter, Space); mouse: the focus stays on the button
  });
  button.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open();
    } else if (e.key === 'Escape') {
      close();
    }
  });
  menu.addEventListener('keydown', (e) => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    const next = { ArrowDown: (i + 1) % list.length, ArrowUp: (i - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[e.key];
    if (next !== undefined) {
      e.preventDefault();
      list[next].focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close({ focus: true });
    } else if (e.key === 'Tab') {
      close();
    }
  });
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[role="menuitem"]');
    if (!item) return;
    close({ focus: true });
    onSelect(item.dataset.format);
  });
  document.addEventListener('click', (e) => {
    if (isOpen() && !menu.contains(e.target) && e.target !== button) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen() && !menu.contains(document.activeElement)) close();
  });

  return { close, open, get isOpen() { return isOpen(); } };
}
