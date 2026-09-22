export type ProfitMode = 'manual' | 'contract' | 'tick';
export type FeeMode = 'manual' | 'per_lot';

export interface BrokerProfitInput {
  mode: ProfitMode;
  direction: 'buy' | 'sell';
  entryPrice: number | null;
  closePrice: number | null;
  volume: number;
  contractSize: number | null;
  tickSize: number | null;
  tickValue: number | null;
  conversionRate: number | null;
}

export interface BrokerFeeInput {
  mode: FeeMode;
  volume: number;
  commissionPerLotRoundTurn: number | null;
  swapCharge: number | null;
}

function positive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function money(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
}

/** Returns null until every broker parameter needed for the selected mode is supplied. */
export function calculateBrokerProfit(input: BrokerProfitInput): number | null {
  if (input.mode === 'manual' || !positive(input.volume) ||
      !positive(input.entryPrice) || !positive(input.closePrice) || !positive(input.conversionRate)) {
    return null;
  }

  const side = input.direction === 'buy' ? 1 : -1;
  const priceMove = side * (input.closePrice - input.entryPrice);
  if (input.mode === 'contract') {
    if (!positive(input.contractSize)) return null;
    return money(priceMove * input.contractSize * input.volume * input.conversionRate);
  }
  if (!positive(input.tickSize) || !positive(input.tickValue)) return null;
  return money((priceMove / input.tickSize) * input.tickValue * input.volume * input.conversionRate);
}

/** Estimated gross loss if Stop Loss fills at its exact price, excluding fees and slippage. */
export function calculateBrokerRisk(input: BrokerProfitInput & { stopLoss: number | null }): number | null {
  const atStop = calculateBrokerProfit({ ...input, closePrice: input.stopLoss });
  return atStop !== null && atStop < 0 ? -atStop : null;
}

/** Swap charge is signed: a credit is negative and reduces total cost. */
export function calculateBrokerFee(input: BrokerFeeInput): number | null {
  if (input.mode === 'manual' || !positive(input.volume) ||
      input.commissionPerLotRoundTurn === null || !Number.isFinite(input.commissionPerLotRoundTurn) ||
      input.commissionPerLotRoundTurn < 0 || input.swapCharge === null || !Number.isFinite(input.swapCharge)) {
    return null;
  }
  return money(input.commissionPerLotRoundTurn * input.volume + input.swapCharge);
}
