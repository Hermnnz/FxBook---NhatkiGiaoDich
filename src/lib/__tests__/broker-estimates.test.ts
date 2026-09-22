import { describe, expect, it } from 'vitest';
import { estimateBrokerTrade } from '../broker-estimates';

const ftmoGold = {
  accountName: 'FTMO',
  accountCurrency: 'USD',
  symbol: 'XAUUSD',
  direction: 'buy' as const,
  entryPrice: 4457.24,
  closePrice: 4466.8,
  stopLoss: 4447.24,
  volume: 0.07,
  tradeDate: '2026-09-22',
};

describe('estimateBrokerTrade', () => {
  it('matches an actual FTMO XAUUSD trade to the cent', () => {
    const result = estimateBrokerTrade(ftmoGold);

    expect(result.supported).toBe(true);
    expect(result.ready).toBe(true);
    expect(result.grossProfit).toBe(66.92);
    expect(result.fee).toBe(0.44);
    expect(result.riskAmount).toBe(70);
  });

  it('reverses the price movement for sell trades without changing commission', () => {
    const result = estimateBrokerTrade({ ...ftmoGold, direction: 'sell' });

    expect(result.grossProfit).toBe(-66.92);
    expect(result.fee).toBe(0.44);
  });

  it('recognizes an FTMO account label and broker symbol suffix', () => {
    const result = estimateBrokerTrade({
      ...ftmoGold,
      accountName: 'FTMO (USD)',
      symbol: 'XAUUSD.pro',
    });

    expect(result.supported).toBe(true);
    expect(result.ready).toBe(true);
  });

  it('uses the FTMO metals rate that applied before 29 September 2025', () => {
    const result = estimateBrokerTrade({ ...ftmoGold, tradeDate: '2025-09-28' });

    expect(result.fee).toBe(0.31);
  });

  it('waits for order fields and rejects unknown broker profiles', () => {
    const incomplete = estimateBrokerTrade({ ...ftmoGold, closePrice: null });
    const unknown = estimateBrokerTrade({ ...ftmoGold, accountName: 'Personal' });

    expect(incomplete.supported).toBe(true);
    expect(incomplete.ready).toBe(false);
    expect(incomplete.fee).toBeNull();
    expect(unknown.supported).toBe(false);
  });
});
