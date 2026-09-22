import { describe, expect, it } from 'vitest';
import { calculateBrokerFee, calculateBrokerProfit, calculateBrokerRisk } from '../trade-calculation';

const contract = {
  mode: 'contract' as const, direction: 'buy' as const,
  entryPrice: 1.1, closePrice: 1.101, volume: 0.5,
  contractSize: 100_000, tickSize: null, tickValue: null, conversionRate: 1,
};

describe('broker-parameter-based estimates', () => {
  it('calculates buy and sell gross P&L only from explicit contract settings', () => {
    expect(calculateBrokerProfit(contract)).toBe(50);
    expect(calculateBrokerProfit({ ...contract, direction: 'sell' })).toBe(-50);
    expect(calculateBrokerProfit({ ...contract, conversionRate: null })).toBeNull();
    expect(calculateBrokerProfit({ ...contract, contractSize: null })).toBeNull();
  });

  it('uses tick size, tick value and conversion rate for tick instruments', () => {
    expect(calculateBrokerProfit({ ...contract, mode: 'tick', entryPrice: 3000, closePrice: 3002,
      tickSize: 0.25, tickValue: 12.5, conversionRate: 1.2 })).toBe(60);
    expect(calculateBrokerProfit({ ...contract, mode: 'tick', tickSize: null })).toBeNull();
  });

  it('combines explicit round-turn commission and signed swap charge', () => {
    expect(calculateBrokerFee({ mode: 'per_lot', volume: 0.5,
      commissionPerLotRoundTurn: 7, swapCharge: -1.25 })).toBe(2.25);
    expect(calculateBrokerFee({ mode: 'per_lot', volume: 0.5,
      commissionPerLotRoundTurn: null, swapCharge: 0 })).toBeNull();
    expect(calculateBrokerFee({ mode: 'manual', volume: 0.5,
      commissionPerLotRoundTurn: 7, swapCharge: 0 })).toBeNull();
  });

  it('estimates gross risk only for a Stop Loss on the losing side', () => {
    expect(calculateBrokerRisk({ ...contract, stopLoss: 1.099 })).toBe(50);
    expect(calculateBrokerRisk({ ...contract, stopLoss: 1.101 })).toBeNull();
    expect(calculateBrokerRisk({ ...contract, direction: 'sell', stopLoss: 1.101 })).toBe(50);
    expect(calculateBrokerRisk({ ...contract, conversionRate: null, stopLoss: 1.099 })).toBeNull();
  });
});

describe('calcTheoreticalProfit', () => {
  it('calculates theoretical profit for Gold (XAUUSD / XAUUSDT) with multiplier 100', async () => {
    const { calcTheoreticalProfit } = await import('../calculations');
    // Sell 0.12 lot from 2045 to TP 2031 -> (2045 - 2031) * 0.12 * 100 = 168
    expect(
      calcTheoreticalProfit({
        symbol: 'XAUUSD',
        direction: 'sell',
        entryPrice: 2045,
        tpPrice: 2031,
        volume: 0.12,
        fee: 0,
      })
    ).toBe(168);

    // Buy 0.07 lot from 4457.24 to TP 4470 -> (4470 - 4457.24) * 0.07 * 100 = 89.32
    expect(
      calcTheoreticalProfit({
        symbol: 'XAUUSD',
        direction: 'buy',
        entryPrice: 4457.24,
        tpPrice: 4470,
        volume: 0.07,
        fee: 0,
      })
    ).toBe(89.32);
  });

  it('calculates theoretical profit for standard Forex pairs with multiplier 100,000', async () => {
    const { calcTheoreticalProfit } = await import('../calculations');
    // Buy 1.0 lot EURUSD from 1.0800 to TP 1.0850 -> 0.0050 * 1.0 * 100,000 = 500
    expect(
      calcTheoreticalProfit({
        symbol: 'EURUSD',
        direction: 'buy',
        entryPrice: 1.0800,
        tpPrice: 1.0850,
        volume: 1.0,
      })
    ).toBe(500);
  });

  it('returns null when entryPrice or tpPrice or volume is missing', async () => {
    const { calcTheoreticalProfit } = await import('../calculations');
    expect(
      calcTheoreticalProfit({
        symbol: 'XAUUSD',
        direction: 'buy',
        entryPrice: null,
        tpPrice: 2050,
        volume: 0.1,
      })
    ).toBeNull();

    expect(
      calcTheoreticalProfit({
        symbol: 'XAUUSD',
        direction: 'buy',
        entryPrice: 2000,
        tpPrice: null,
        volume: 0.1,
      })
    ).toBeNull();
  });
});

