// Undo and redo of the model (SPEC_ETAPPE2 6.1, "Rückgängig"): the list of earlier and later states. No DOM access.
//
// A state is an opaque value (the page uses the JSON text of the whole model, which keeps every field, also those the
// app does not know, and the order of the keys; see snapshotModel). The history keeps at most `limit` steps (at least 100
// are required); the oldest ones fall out when the limit is reached.

/** Steps that are kept (the spec asks for at least 100). */
export const HISTORY_LIMIT = 200;

/** State of the model for the history: JSON text of the whole model. */
export const snapshotModel = (model) => JSON.stringify(model);

/** Model of a state made by snapshotModel (a new object; the model of the page is replaced by it). */
export const modelFromSnapshot = (text) => JSON.parse(text);

/**
 * history.record(before, group?)  a change was made; `before` is the state before it. The steps that were undone (the
 *                                 later ones) are dropped. A `group` (any string) joins changes that belong together,
 *                                 such as the keystrokes in one field: as long as the same group is recorded again
 *                                 without anything in between, only the first change makes a step.
 * history.breakGroup()            the next change makes a new step (the field was left)
 * history.undo(current)           the state to go back to, or null; `current` becomes a later step
 * history.redo(current)           the state to go forward to, or null; `current` becomes an earlier step
 * history.canUndo / canRedo, undoSteps / redoSteps, clear()
 */
export function createHistory({ limit = HISTORY_LIMIT } = {}) {
  let past = [];
  let future = [];
  let group = null;
  return {
    record(before, joined = null) {
      if (joined !== null && joined === group) return;
      group = joined;
      past.push(before);
      if (past.length > limit) past.shift();
      future = [];
    },
    breakGroup() {
      group = null;
    },
    undo(current) {
      group = null;
      if (past.length === 0) return null;
      future.push(current);
      return past.pop();
    },
    redo(current) {
      group = null;
      if (future.length === 0) return null;
      past.push(current);
      return future.pop();
    },
    clear() {
      past = [];
      future = [];
      group = null;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    get undoSteps() {
      return past.length;
    },
    get redoSteps() {
      return future.length;
    },
  };
}
