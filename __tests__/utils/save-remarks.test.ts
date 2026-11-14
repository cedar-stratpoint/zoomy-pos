import { saveRemarks } from '../../utils/save-remarks';
import { updateTransactionRemarks, markRemarksSynced } from '../../db/transactions';
import { setRemoteOrderRemarks } from '../../utils/orders-remote';

jest.mock('../../db/transactions', () => ({
  updateTransactionRemarks: jest.fn(async () => {}),
  markRemarksSynced: jest.fn(async () => {}),
}));
jest.mock('../../utils/orders-remote', () => ({ setRemoteOrderRemarks: jest.fn() }));

const remote = setRemoteOrderRemarks as jest.Mock;

describe('saveRemarks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saves a local synced sale on the device and on Coop, then marks it synced', async () => {
    remote.mockResolvedValue(true);

    const outcome = await saveRemarks({ id: 4, isLocal: true, clientUuid: 'u-4', remarks: 'Paid exact' });

    expect(outcome).toBe('saved');
    expect(updateTransactionRemarks).toHaveBeenCalledWith(4, 'Paid exact');
    expect(markRemarksSynced).toHaveBeenCalledWith('u-4');
  });

  it('keeps the note on the device for the outbox to retry when Coop is unreachable', async () => {
    remote.mockResolvedValue(false);

    const outcome = await saveRemarks({ id: 4, isLocal: true, clientUuid: 'u-4', remarks: 'Paid exact' });

    expect(outcome).toBe('pending');
    expect(updateTransactionRemarks).toHaveBeenCalled();
    expect(markRemarksSynced).not.toHaveBeenCalled();
  });

  it('reports a Coop-only sale as rejected when Coop is unreachable, since nothing kept the note', async () => {
    remote.mockResolvedValue(false);

    const outcome = await saveRemarks({ id: -2, isLocal: false, clientUuid: 'u-remote', remarks: 'x' });

    expect(outcome).toBe('rejected');
    expect(updateTransactionRemarks).not.toHaveBeenCalled();
  });

  it('fails without touching Coop when the local write fails', async () => {
    (updateTransactionRemarks as jest.Mock).mockRejectedValueOnce(new Error('disk'));

    const outcome = await saveRemarks({ id: 4, isLocal: true, clientUuid: 'u-4', remarks: 'x' });

    expect(outcome).toBe('failed');
    expect(remote).not.toHaveBeenCalled();
  });

  it('treats a sale that never syncs as saved once it is on the device', async () => {
    const outcome = await saveRemarks({ id: 7, isLocal: true, clientUuid: null, remarks: null });

    expect(outcome).toBe('saved');
    expect(remote).not.toHaveBeenCalled();
  });
});
