import { cropRect } from '../../../utils/photo-scan/crop';

describe('cropRect', () => {
  it('turns a box into pixels with a margin around the pack', () => {
    const rect = cropRect({ x: 0.4, y: 0.4, width: 0.2, height: 0.2 }, 1000, 500);

    // 15% of the box on each side: 30px across, 15px down.
    expect(rect).toEqual({ originX: 370, originY: 185, width: 260, height: 130 });
  });

  it('keeps the crop inside the photo near an edge', () => {
    const rect = cropRect({ x: 0, y: 0.9, width: 0.2, height: 0.1 }, 1000, 1000);

    expect(rect).toEqual({ originX: 0, originY: 885, width: 230, height: 115 });
  });

  it('never returns an empty crop', () => {
    const rect = cropRect({ x: 0.5, y: 0.5, width: 0.0001, height: 0.0001 }, 100, 100);

    expect(rect.width).toBeGreaterThanOrEqual(1);
    expect(rect.height).toBeGreaterThanOrEqual(1);
  });
});
