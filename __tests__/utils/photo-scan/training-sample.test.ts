import { buildTrainingLabel, type LabelInput } from '../../../utils/photo-scan/training-sample';
import type { UnsurePack } from '../../../utils/photo-scan/match-scan';
import { pickBundle, product } from '../../../__fixtures__/photo-scan';

const salmon = product({ id: 1, name: 'Salmon', sku: 'FD-SAL' });
const beef = product({ id: 2, name: 'Beef', sku: 'MT-BEEF' });
const duck = product({ id: 3, name: 'Duck', sku: 'SD-DUCK' });
const buyAny2 = pickBundle({ id: 10, name: 'Buy Any 2', price: 350, pick_count: 2 });
const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
const unsurePack: UnsurePack = { id: 0, candidates: [duck, beef], quantity: 1, box, cropUri: null };

function input(over: Partial<LabelInput>): LabelInput {
  return {
    matched: [{ product: salmon, quantity: 2 }],
    unsurePacks: [],
    bundles: [],
    singles: [{ product: salmon, quantity: 2 }],
    unsureAnswers: [],
    catalog: [salmon, beef, duck],
    ...over,
  };
}

describe('buildTrainingLabel', () => {
  it('labels an accepted scan as unedited, counted by SKU', () => {
    const label = buildTrainingLabel(input({}));

    expect(label).toEqual({ counts: { 'FD-SAL': 2 }, bundles: [], unsure: [], edited: false });
  });

  it('marks a changed quantity as edited', () => {
    const label = buildTrainingLabel(input({ singles: [{ product: salmon, quantity: 3 }] }));

    expect(label.counts).toEqual({ 'FD-SAL': 3 });
    expect(label.edited).toBe(true);
  });

  it('marks a removed product as edited', () => {
    const label = buildTrainingLabel(input({
      matched: [{ product: salmon, quantity: 2 }, { product: beef, quantity: 1 }],
    }));

    expect(label.edited).toBe(true);
  });

  it('counts bundle picks with the singles and keeps the bundle', () => {
    const label = buildTrainingLabel(input({
      matched: [{ product: salmon, quantity: 2 }, { product: beef, quantity: 1 }],
      bundles: [{ bundle: buyAny2, items: [{ id: 1, name: 'Salmon', quantity: 1 }, { id: 2, name: 'Beef', quantity: 1 }] }],
      singles: [{ product: salmon, quantity: 1 }],
    }));

    expect(label.counts).toEqual({ 'FD-SAL': 2, 'MT-BEEF': 1 });
    expect(label.bundles).toEqual([{ preset_id: 10, name: 'Buy Any 2', picks: { 'FD-SAL': 1, 'MT-BEEF': 1 } }]);
    expect(label.edited).toBe(false);
  });

  it('treats taking the top guess for an unsure pack as unedited', () => {
    const label = buildTrainingLabel(input({
      unsurePacks: [unsurePack],
      singles: [{ product: salmon, quantity: 2 }, { product: duck, quantity: 1 }],
      unsureAnswers: [{ packId: 0, product: duck, via: 'candidate' }],
    }));

    expect(label.unsure).toEqual([
      { box, candidates: ['SD-DUCK', 'MT-BEEF'], quantity: 1, answer: 'SD-DUCK', via: 'candidate' },
    ]);
    expect(label.edited).toBe(false);
  });

  it('treats another guess, another product or a skip as edited', () => {
    const cases: LabelInput[] = [
      input({
        unsurePacks: [unsurePack],
        singles: [{ product: salmon, quantity: 2 }, { product: beef, quantity: 1 }],
        unsureAnswers: [{ packId: 0, product: beef, via: 'candidate' }],
      }),
      input({
        unsurePacks: [unsurePack],
        singles: [{ product: salmon, quantity: 3 }],
        unsureAnswers: [{ packId: 0, product: salmon, via: 'other' }],
      }),
      input({
        unsurePacks: [unsurePack],
        unsureAnswers: [{ packId: 0, product: null, via: 'skipped' }],
      }),
    ];

    const labels = cases.map(buildTrainingLabel);

    expect(labels.map((l) => l.edited)).toEqual([true, true, true]);
    expect(labels.map((l) => [l.unsure[0].answer, l.unsure[0].via])).toEqual([
      ['MT-BEEF', 'candidate'],
      ['FD-SAL', 'other'],
      [null, 'skipped'],
    ]);
  });

  it('keys a product with no Coop SKU by its local id', () => {
    const local = { ...product({ id: 7, name: 'Local' }), sku: null };

    const label = buildTrainingLabel(input({ matched: [], singles: [{ product: local, quantity: 1 }] }));

    expect(label.counts).toEqual({ 'local:7': 1 });
  });
});
