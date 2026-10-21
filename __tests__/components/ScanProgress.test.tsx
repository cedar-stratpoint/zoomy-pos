import React from 'react';
import { render } from '@testing-library/react-native';
import { ScanProgress, SCAN_STAGES, type ScanStage } from '../../components/ScanProgress';

describe('ScanProgress', () => {
  it.each<[ScanStage, string, number]>([
    ['preparing', 'Step 1 of 3', 15],
    ['reading', 'Step 2 of 3', 90],
    ['matching', 'Step 3 of 3', 100],
  ])('shows what the %s stage is doing', (stage, step, percent) => {
    const { getByText, getByTestId } = render(<ScanProgress stage={stage} />);

    expect(getByText(step)).toBeTruthy();
    expect(getByText(SCAN_STAGES[stage].label)).toBeTruthy();
    expect(getByText(SCAN_STAGES[stage].detail)).toBeTruthy();
    expect(getByTestId('scan-progress').props.accessibilityValue).toMatchObject({ now: percent });
  });

  it('never reports the Claude wait as finished', () => {
    expect(SCAN_STAGES.reading.target).toBeLessThan(1);
  });

  it('uses no em or en dashes in its copy', () => {
    const copy = Object.values(SCAN_STAGES).map((s) => s.label + s.detail).join(' ');
    expect(copy).not.toMatch(/[–—]/);
  });
});
