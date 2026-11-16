import * as Haptics from 'expo-haptics';
import { hapticOutcome } from '../../utils/haptics';

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const notify = Haptics.notificationAsync as jest.Mock;

describe('hapticOutcome', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['success', Haptics.NotificationFeedbackType.Success],
    ['warning', Haptics.NotificationFeedbackType.Warning],
    ['error', Haptics.NotificationFeedbackType.Error],
  ] as const)('plays the system %s notification', (outcome, type) => {
    hapticOutcome(outcome);

    expect(notify).toHaveBeenCalledWith(type);
  });

  it('never throws where haptics are unavailable', async () => {
    notify.mockReturnValueOnce(Promise.reject(new Error('not supported')));

    expect(() => hapticOutcome('success')).not.toThrow();
    await Promise.resolve();
  });
});
