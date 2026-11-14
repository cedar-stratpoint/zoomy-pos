import { runOptimistic } from '../../utils/optimistic';

function steps(opts: { pushOk?: boolean; persistThrows?: boolean } = {}) {
  const order: string[] = [];
  return {
    order,
    show: jest.fn(() => { order.push('show'); }),
    persist: jest.fn(async () => {
      order.push('persist');
      if (opts.persistThrows) throw new Error('disk full');
    }),
    push: jest.fn(async () => { order.push('push'); return opts.pushOk ?? true; }),
    undo: jest.fn(async () => { order.push('undo'); }),
  };
}

describe('runOptimistic', () => {
  it('shows the change before anything is written or sent, and keeps it when Coop accepts', async () => {
    const s = steps({ pushOk: true });

    const ok = await runOptimistic(s);

    expect(ok).toBe(true);
    expect(s.order).toEqual(['show', 'persist', 'push']);
    expect(s.undo).not.toHaveBeenCalled();
  });

  it('rolls back when Coop rejects the change', async () => {
    const s = steps({ pushOk: false });

    const ok = await runOptimistic(s);

    expect(ok).toBe(false);
    expect(s.order).toEqual(['show', 'persist', 'push', 'undo']);
  });

  it('rolls back without sending anything when the local write fails', async () => {
    const s = steps({ persistThrows: true });

    const ok = await runOptimistic(s);

    expect(ok).toBe(false);
    expect(s.push).not.toHaveBeenCalled();
    expect(s.order).toEqual(['show', 'persist', 'undo']);
  });
});
