// Message rows (info, warning, error, ok) with code and text in the chosen language.

import { translate } from '../lib/i18n.js';

/**
 * Message descriptor:
 *   { kind: 'info' | 'warn' | 'error' | 'ok',
 *     code?, key?, params?,   // code (E_, I_, W_, APP_) or interface key, text from i18n.js
 *     path?, detail? }        // location in the model; detail = message of the core (English, as tooltip)
 * `onJump(path)` (optional): a row with a path becomes a button that jumps to the field.
 */
export function renderMessages(list, items, lang, onJump) {
  list.replaceChildren();
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'hint';
    li.textContent = translate(lang, 'ui.msg.none');
    list.append(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.className = `notice notice-${item.kind}`;
    if (item.detail) li.title = item.detail;
    const inner = onJump && item.path !== undefined && item.code ? document.createElement('button') : li;
    if (inner !== li) {
      inner.type = 'button';
      inner.className = 'notice-jump';
      inner.title = [item.detail, translate(lang, 'ui.msg.jump')].filter(Boolean).join('\n');
      inner.addEventListener('click', () => onJump(item.path));
      li.append(inner);
    }
    if (item.code) {
      const code = document.createElement('span');
      code.className = 'code';
      code.textContent = item.code;
      inner.append(code);
    }
    const text = document.createElement('span');
    text.className = 'notice-text';
    text.textContent = translate(lang, item.code || item.key, item.params);
    inner.append(text);
    if (item.path) {
      const where = document.createElement('span');
      where.className = 'where';
      where.textContent = translate(lang, 'ui.msg.path', { path: item.path });
      inner.append(where);
    }
    list.append(li);
  }
}
