export interface BrokerTradeEstimateInput {
  accountName: string;
  accountCurrency: string;
  symbol: string;
  direction: 'buy' | 'sell';
  entryPrice: number | null;
  closePrice: number | null;
  stopLoss: number | null;
  volume: number | null;
  tradeDate?: string;
}

export interface BrokerTradeEstimate {
  supported: boolean;
  ready: boolean;
  profileLabel: string | null;
  grossProfit: number | null;
  fee: number | null;
  riskAmount: number | null;
  note: string;
}

const FTMO_METALS_COMMISSION_RATE_PER_SIDE = 0.000007; // 0.0007%
const FTMO_LEGACY_METALS_COMMISSION_RATE_PER_SIDE = 0.000005; // 0.0005%
const FTMO_COMMISSION_CHANGE_DATE = '2025-09-29';
const XAUUSD_CONTRACT_SIZE = 100; // 100 troy ounces per lot

function positive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function money(value: number): number {
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
}

function normalizedSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Estimates values that can be derived safely from the order fields and a
 * known broker profile. Imported MT5 trades keep the broker's actual values.
 */
export function estimateBrokerTrade(input: BrokerTradeEstimateInput): BrokerTradeEstimate {
  const isFtmo = /(^|\W)ftmo(\W|$)/i.test(input.accountName);
  const isUsdAccount = input.accountCurrency.trim().toUpperCase() === 'USD';
  const isGoldUsd = normalizedSymbol(input.symbol).startsWith('XAUUSD');

  if (!isFtmo || !isUsdAccount || !isGoldUsd) {
    return {
      supported: false,
      ready: false,
      profileLabel: null,
      grossProfit: null,
      fee: null,
      riskAmount: null,
      note: 'Chưa có cấu hình tự động cho broker, tiền tệ hoặc symbol này.',
    };
  }

  const profileLabel = 'FTMO · XAUUSD · USD';
  if (!positive(input.entryPrice) || !positive(input.closePrice) || !positive(input.volume)) {
    return {
      supported: true,
      ready: false,
      profileLabel,
      grossProfit: null,
      fee: null,
      riskAmount: null,
      note: 'Điền Entry, Close Price và Volume để hệ thống tự tính.',
    };
  }

  const side = input.direction === 'buy' ? 1 : -1;
  const grossProfit = money(
    side * (input.closePrice - input.entryPrice) * XAUUSD_CONTRACT_SIZE * input.volume,
  );
  const commissionRate = input.tradeDate && input.tradeDate.slice(0, 10) < FTMO_COMMISSION_CHANGE_DATE
    ? FTMO_LEGACY_METALS_COMMISSION_RATE_PER_SIDE
    : FTMO_METALS_COMMISSION_RATE_PER_SIDE;
  const fee = money(
    (input.entryPrice + input.closePrice) * XAUUSD_CONTRACT_SIZE * input.volume *
      commissionRate,
  );
  const stopDistance = positive(input.stopLoss) ? Math.abs(input.entryPrice - input.stopLoss) : 0;
  const riskAmount = stopDistance > 0
    ? money(stopDistance * XAUUSD_CONTRACT_SIZE * input.volume)
    : null;

  return {
    supported: true,
    ready: true,
    profileLabel,
    grossProfit,
    fee,
    riskAmount,
    note: `Commission được tính theo biểu phí FTMO Metals CFD (${commissionRate === FTMO_METALS_COMMISSION_RATE_PER_SIDE ? '0,0007%' : '0,0005%'} mỗi chiều); lệnh nhập tay chưa cộng swap qua đêm.`,
  };
}
