// Apply the texts of app/lib/i18n.js to the page (elements with data-i18n*).

import { translate } from '../lib/i18n.js';

const ATTRIBUTES = {
  'data-i18n-title': 'title',
  'data-i18n-aria-label': 'aria-label',
  'data-i18n-placeholder': 'placeholder',
};

/** Set text and attributes of all marked elements below `root` for the language. */
export function applyTranslations(root, lang) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = translate(lang, el.getAttribute('data-i18n'));
  }
  for (const [attr, target] of Object.entries(ATTRIBUTES)) {
    for (const el of root.querySelectorAll(`[${attr}]`)) {
      el.setAttribute(target, translate(lang, el.getAttribute(attr)));
    }
  }
}
