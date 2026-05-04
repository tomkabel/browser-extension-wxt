import { describe, it, expect } from 'vitest';
import { RttEstimator } from './rttEstimator';

describe('RttEstimator', () => {
  it('converges to actual RTT within 10 samples', () => {
    const estimator = new RttEstimator();
    const actualRtt = 50;

    for (let i = 0; i < 10; i++) {
      estimator.updateRtt(actualRtt);
    }

    const avg = estimator.getRttAvg();
    expect(avg).toBeLessThan(100);
    expect(avg).toBeGreaterThan(actualRtt);
  });

  it('RTO floor is 1000ms', () => {
    const estimator = new RttEstimator();
    for (let i = 0; i < 20; i++) {
      estimator.updateRtt(1);
    }
    expect(estimator.getRto()).toBeGreaterThanOrEqual(1000);
  });

  it('RTT spike causes RTO increase within 5 samples', () => {
    const estimator = new RttEstimator();

    for (let i = 0; i < 10; i++) {
      estimator.updateRtt(50);
    }
    const rtoBefore = estimator.getRto();

    for (let i = 0; i < 5; i++) {
      estimator.updateRtt(500);
    }
    const rtoAfter = estimator.getRto();

    expect(rtoAfter).toBeGreaterThan(rtoBefore);
  });

  it('starts with initial values', () => {
    const estimator = new RttEstimator();
    expect(estimator.getRttAvg()).toBe(200);
    expect(estimator.getRttVar()).toBe(100);
    expect(estimator.getRto()).toBeGreaterThanOrEqual(1000);
  });
});
