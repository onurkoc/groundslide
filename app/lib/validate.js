// All checks of the app in one place: the core (validateModel), the single
// circles (SPEC_ETAPPE2 5.2) and unreadable input fields. No DOM access.

import { validateModel } from '../../core/index.js';
import { validateSurfaces } from './surfaces-check.js';

/**
 * Returns { valid, errors }, errors = [{ code, message, path }].
 * `inputErrors` are the unreadable input fields (APP_NUMBER_INVALID) of the page.
 */
export function validateAll(model, inputErrors = []) {
  const core = validateModel(model);
  const errors = [...core.errors, ...validateSurfaces(model && model.surfaces), ...inputErrors];
  return { valid: errors.length === 0, errors };
}
