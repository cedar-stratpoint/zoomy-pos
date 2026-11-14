/**
 * Optimistic update for an edit that must reach Coop to stick (Coop is the
 * source of truth, so an edit it never received is undone by the next pull):
 *
 *   1. show    update the screen immediately (synchronous state change)
 *   2. persist write the local SQLite row
 *   3. push    send it to Coop; resolves true when Coop accepted it
 *   4. undo    only on failure: restore the local row and the screen
 *
 * Resolves true when the change stuck, false when it was rolled back, so the
 * caller can tell the cashier.
 */
export async function runOptimistic(steps: {
  show: () => void;
  persist: () => Promise<void>;
  push: () => Promise<boolean>;
  undo: () => Promise<void>;
}): Promise<boolean> {
  steps.show();
  try {
    await steps.persist();
  } catch {
    await steps.undo();
    return false;
  }
  if (await steps.push()) return true;
  await steps.undo();
  return false;
}
