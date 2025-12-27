import { describe, it, expect, beforeEach } from 'vitest';
import { recordCitationOutcome, resetCitationWindowForTests } from './citation-rate.js';

describe('recordCitationOutcome', () => {
  beforeEach(() => {
    resetCitationWindowForTests();
  });

  it('ignores non-eligible responses', () => {
    const snap = recordCitationOutcome({ eligible: false, cited: false });
    expect(snap.eligibleWindowCount).toBe(0);
    expect(snap.rate).toBeNull();
  });

  it('tracks cited rate over eligible responses', () => {
    for (let i = 0; i < 10; i++) {
      recordCitationOutcome({ eligible: true, cited: true });
    }
    const snap = recordCitationOutcome({ eligible: true, cited: false });
    expect(snap.eligibleWindowCount).toBe(11);
    expect(snap.citedWindowCount).toBe(10);
    expect(snap.rate).toBeCloseTo(10 / 11);
    expect(snap.belowTarget).toBe(false);
  });

  it('flags below target once window is large enough', () => {
    for (let i = 0; i < 20; i++) {
      recordCitationOutcome({ eligible: true, cited: false });
    }
    const snap = recordCitationOutcome({ eligible: true, cited: false });
    expect(snap.eligibleWindowCount).toBe(21);
    expect(snap.rate).toBe(0);
    expect(snap.belowTarget).toBe(true);
  });
});


