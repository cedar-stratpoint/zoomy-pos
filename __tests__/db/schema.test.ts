import { initSchema } from '../../db/schema';
import { mockDb } from '../../__mocks__/expo-sqlite';

/** Answers `PRAGMA table_info(scan_samples)` with these column names. */
function scanSamplesColumns(names: string[]) {
  mockDb.getAllAsync.mockImplementation(async (sql: string) =>
    sql === 'PRAGMA table_info(scan_samples)' ? names.map((name) => ({ name })) : []);
}

function rebuildCalls() {
  return mockDb.execAsync.mock.calls.filter(([sql]) => String(sql).includes('RENAME TO scan_samples_v1'));
}

describe('initSchema scan_samples upgrade', () => {
  beforeEach(() => jest.clearAllMocks());
  afterAll(() => mockDb.getAllAsync.mockResolvedValue([]));

  it('rebuilds the first layout, which has no photo_base64, keeping its rows', async () => {
    scanSamplesColumns(['client_uuid', 'photo_uri', 'width']);

    await initSchema();

    expect(mockDb.withTransactionAsync).toHaveBeenCalledTimes(1);
    const [[sql]] = rebuildCalls();
    expect(sql).toContain('photo_base64 TEXT');
    expect(sql).toMatch(/INSERT INTO scan_samples \(client_uuid, photo_uri, .*\)\s+SELECT client_uuid, photo_uri, .* FROM scan_samples_v1/);
    expect(sql).toContain('DROP TABLE scan_samples_v1');
  });

  it('leaves a current table alone', async () => {
    scanSamplesColumns(['client_uuid', 'photo_uri', 'photo_base64']);

    await initSchema();

    expect(rebuildCalls()).toHaveLength(0);
    expect(mockDb.withTransactionAsync).not.toHaveBeenCalled();
  });
});
