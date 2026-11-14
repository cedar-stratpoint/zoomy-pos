import {
  getSavedBundles,
  getActivePickBundles,
  getSavedBundleById,
  savePickBundle,
  updatePickBundle,
  validatePickBundleInput,
  reconcileRemoteBundles,
  PickBundleInput,
  RemoteBundle,
} from '../../db/saved-bundles';
import { mockDb } from '../../__mocks__/expo-sqlite';

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

const pickRow = {
  id: 3,
  name: 'Buy Any 4',
  items_json: '[]',
  price: 570,
  bundle_type: 'pick',
  pick_count: 4,
  line_categories: '["Freeze Dried","Meaty Treats"]',
  is_active: 1,
  created_at: '2026-09-03T10:00:00.000Z',
};

const validInput: PickBundleInput = {
  name: 'Buy Any 4',
  price: 570,
  pickCount: 4,
  lineCategories: ['Freeze Dried', 'Meaty Treats'],
};

describe('validatePickBundleInput', () => {
  it('returns null for valid input', () => {
    expect(validatePickBundleInput(validInput)).toBeNull();
  });

  it('rejects a blank name', () => {
    expect(validatePickBundleInput({ ...validInput, name: '  ' })).toBe('Enter a bundle name.');
  });

  it('rejects a negative or non-finite price', () => {
    expect(validatePickBundleInput({ ...validInput, price: -1 })).toBe('Enter a valid price.');
    expect(validatePickBundleInput({ ...validInput, price: NaN })).toBe('Enter a valid price.');
  });

  it('requires an amount of at least 1', () => {
    expect(validatePickBundleInput({ ...validInput, pickCount: 0 })).toBe(
      'Amount of items must be at least 1.'
    );
  });

  it('requires at least one product line', () => {
    expect(validatePickBundleInput({ ...validInput, lineCategories: [] })).toBe(
      'Select at least one product line.'
    );
  });
});

describe('getActivePickBundles', () => {
  it('queries only active pick bundles and parses line_categories', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([pickRow]);
    const result = await getActivePickBundles();
    expect(mockDb.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining("bundle_type = 'pick'")
    );
    expect(result[0]).toMatchObject({
      id: 3,
      bundle_type: 'pick',
      pick_count: 4,
      line_categories: ['Freeze Dried', 'Meaty Treats'],
      items: [],
    });
  });
});

describe('getSavedBundles', () => {
  it('maps a legacy fixed bundle with null line_categories', async () => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { ...pickRow, bundle_type: 'fixed', pick_count: null, line_categories: null, items_json: '[{"id":1,"name":"Beef","quantity":2}]' },
    ]);
    const result = await getSavedBundles();
    expect(result[0]).toMatchObject({
      bundle_type: 'fixed',
      pick_count: null,
      line_categories: null,
      items: [{ id: 1, name: 'Beef', quantity: 2 }],
    });
  });
});

describe('getSavedBundleById', () => {
  it('returns the mapped bundle when found', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(pickRow);
    const result = await getSavedBundleById(3);
    expect(result).toMatchObject({ id: 3, pick_count: 4 });
  });

  it('returns null when not found', async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce(null);
    expect(await getSavedBundleById(999)).toBeNull();
  });
});

describe('savePickBundle', () => {
  it('inserts a pick bundle with empty items and returns the new id', async () => {
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 7, changes: 1 });
    const id = await savePickBundle(validInput);
    expect(id).toBe(7);
    const [sql, params] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('INSERT INTO saved_bundles');
    expect(params).toEqual([
      'Buy Any 4',
      '[]',
      570,
      'pick',
      4,
      '["Freeze Dried","Meaty Treats"]',
      expect.any(String), // bundle_uuid
      null, // emoji (none set)
      expect.any(String), // created_at
    ]);
  });
});

describe('updatePickBundle', () => {
  it('updates name, price, pick_count and line_categories', async () => {
    await updatePickBundle(3, validInput);
    const [sql, params] = mockDb.runAsync.mock.calls[0];
    expect(sql).toContain('UPDATE saved_bundles SET name = ?, price = ?, pick_count = ?, line_categories = ?, emoji = ?');
    expect(params).toEqual(['Buy Any 4', 570, 4, '["Freeze Dried","Meaty Treats"]', null, 3]);
  });
});

describe('reconcileRemoteBundles', () => {
  const remote = (uuid: string, name = 'Any 3'): RemoteBundle => ({
    bundle_uuid: uuid, name, price: 300, bundle_type: 'pick', pick_count: 3,
    line_categories: ['Jerky'], emoji: null, is_active: 1, items: [],
  });

  beforeEach(() => {
    mockDb.getAllAsync.mockResolvedValueOnce([
      { id: 1, bundle_uuid: 'kept' },
      { id: 2, bundle_uuid: 'gone-a' },
      { id: 3, bundle_uuid: 'gone-b' },
    ]);
  });
  afterEach(() => mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 }));

  it('reads local bundles once, no matter how many come from Coop', async () => {
    await reconcileRemoteBundles([remote('kept'), remote('new-1'), remote('new-2')]);

    expect(mockDb.getAllAsync).toHaveBeenCalledTimes(1);
    expect(mockDb.getFirstAsync).not.toHaveBeenCalled();
  });

  it('updates a known bundle only when a field differs, and inserts an unknown one', async () => {
    await reconcileRemoteBundles([remote('kept'), remote('new-1')]);

    const [updateSql] = mockDb.runAsync.mock.calls.find(([sql]) => String(sql).startsWith('UPDATE saved_bundles'))!;
    expect(updateSql).toContain('name IS NOT ?');
    const inserts = mockDb.runAsync.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO saved_bundles'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toContain('new-1');
  });

  it('deletes every bundle Coop no longer has in a single statement', async () => {
    await reconcileRemoteBundles([remote('kept')]);

    const deletes = mockDb.runAsync.mock.calls.filter(([sql]) => String(sql).startsWith('DELETE FROM saved_bundles'));
    expect(deletes).toEqual([['DELETE FROM saved_bundles WHERE id IN (?,?)', [2, 3]]]);
  });

  it('reports no change when Coop matches the local copy', async () => {
    mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 0, changes: 0 });
    mockDb.getAllAsync.mockReset().mockResolvedValueOnce([{ id: 1, bundle_uuid: 'kept' }]);

    expect(await reconcileRemoteBundles([remote('kept')])).toBe(0);
    mockDb.getAllAsync.mockResolvedValue([]);
  });
});
