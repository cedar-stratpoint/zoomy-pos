import { updateTransactionRemarks, markRemarksSynced } from '../db/transactions';
import { setRemoteOrderRemarks } from './orders-remote';

/**
 * How a remarks save ended:
 *   saved     stored everywhere it needs to be (Coop has it, or the sale never syncs)
 *   pending   stored on this device; Coop missed it, so the outbox drain retries it
 *   rejected  a Coop-only sale (no local row) whose Coop write failed: nothing kept it
 *   failed    the local write itself failed: nothing kept it
 * Only rejected and failed mean the screen should put the old note back.
 */
export type RemarksSaveOutcome = 'saved' | 'pending' | 'rejected' | 'failed';

export async function saveRemarks(target: {
  /** Local transaction id; only used when isLocal. */
  id: number;
  /** Has a row in this device's SQLite (isLocalTransaction). */
  isLocal: boolean;
  /** Coop identity; null for a sale that never syncs (imported rows). */
  clientUuid: string | null;
  remarks: string | null;
}): Promise<RemarksSaveOutcome> {
  if (target.isLocal) {
    try {
      // Nulls remarks_synced_at, which is what queues the outbox retry.
      await updateTransactionRemarks(target.id, target.remarks);
    } catch {
      return 'failed';
    }
  }
  if (!target.clientUuid) return 'saved';
  if (await setRemoteOrderRemarks(target.clientUuid, target.remarks)) {
    await markRemarksSynced(target.clientUuid);
    return 'saved';
  }
  return target.isLocal ? 'pending' : 'rejected';
}
