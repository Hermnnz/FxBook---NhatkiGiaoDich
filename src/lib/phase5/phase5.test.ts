import { describe, expect, it } from 'vitest';
import { scoreReadiness } from './readiness';
import { calculatePositionSize } from './position-size';
import { getSubscriptionStatus } from './subscription';

describe('readiness', () => {
  it('uses the planned score bands and red override', () => {
    expect(scoreReadiness({ health: 2, emotion: 2, focus: 2, streak: 1, plan: 2 })).toMatchObject({
      score: 90,
      band: 'green',
      tier: 'A-Game',
    });
    expect(scoreReadiness({ health: 1, emotion: 1, focus: 1, streak: 1, plan: 2 })).toMatchObject({
      score: 60,
      band: 'yellow',
      tier: 'Caution',
      recommendedRisk: '50% — 70% Khối lượng chuẩn',
    });
    expect(scoreReadiness({ health: 2, emotion: 0, focus: 2, streak: 2, plan: 2 })).toMatchObject({
      score: 80,
      band: 'red',
      tier: 'C-Game',
    });
  });

  it('treats 70/100 as B-Game with 100% standard lot recommendation on A+ setups', () => {
    const result = scoreReadiness({ health: 2, emotion: 1, focus: 1, streak: 1, plan: 2 });
    expect(result.score).toBe(70);
    expect(result.band).toBe('green');
    expect(result.tier).toBe('B-Game');
    expect(result.recommendedRisk).toBe('100% Khối lượng chuẩn (Ưu tiên setup A+)');
    expect(result.actionPoints.length).toBeGreaterThan(0);
    expect(result.advice).toContain('B-Game');
  });

  it('triggers red band when plan is missing (0/2)', () => {
    const result = scoreReadiness({ health: 2, emotion: 2, focus: 2, streak: 2, plan: 0 });
    expect(result.band).toBe('red');
    expect(result.tier).toBe('C-Game');
    expect(result.recommendedRisk).toContain('0%');
  });
});

describe('position size', () => {
  it('rounds down to broker lot step and never exceeds risk budget', () => {
    const result = calculatePositionSize({ balance: 10000, riskPercent: 1, entry: 3650, stop: 3645, target: 3660, instrument: 'forex', direction: 'buy', tickSize: 0.01, tickValue: 1, lotStep: 0.01 });
    expect(result.size).toBe(0.2);
    expect(result.actualRisk).toBe(100);
    expect(result.rewardRisk).toBe(2);
  });
  it('calculates share quantity and rejects wrong stop side', () => {
    expect(calculatePositionSize({ balance: 100_000, riskPercent: 1, entry: 50, stop: 48, instrument: 'stock', direction: 'buy' }).size).toBe(500);
    expect(() => calculatePositionSize({ balance: 10000, riskPercent: 1, entry: 50, stop: 51, instrument: 'stock', direction: 'buy' })).toThrow();
  });
  it('rejects an invalid optional target or minimum size', () => {
    const base = { balance: 10000, riskPercent: 1, entry: 50, stop: 48, instrument: 'stock' as const, direction: 'buy' as const };
    expect(() => calculatePositionSize({ ...base, target: -1 })).toThrow('TP');
    expect(() => calculatePositionSize({ ...base, minSize: -2 })).toThrow('khối lượng tối thiểu');
  });
  it('rounds from the broker minimum volume before applying the step', () => {
    const result = calculatePositionSize({ balance: 1000, riskPercent: 0.32, entry: 50, stop: 48, instrument: 'stock', direction: 'buy', minSize: 1.5, lotStep: 1 });
    expect(result.rawSize).toBeCloseTo(1.6);
    expect(result.size).toBe(1.5);
  });
});

describe('subscription status', () => {
  it('shows trial expiry from server timestamps', () => {
    const subscription = { user_id: 'u', trial_started_at: '2026-09-01T00:00:00Z', trial_ends_at: '2026-10-01T00:00:00Z', paid_until: null };
    expect(getSubscriptionStatus(subscription, new Date('2026-09-17T00:00:00Z'))).toMatchObject({ state: 'trial', daysLeft: 14 });
    expect(getSubscriptionStatus(subscription, new Date('2026-10-02T00:00:00Z')).state).toBe('expired');
  });
});
