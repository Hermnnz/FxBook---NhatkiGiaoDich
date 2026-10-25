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
  warning?: string | null;
  isPriceInvalid?: boolean;
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

function getContractSize(symbol: string): number {
  const sym = normalizedSymbol(symbol);
  if (sym.includes('XAU') || sym.includes('GOLD')) {
    return XAUUSD_CONTRACT_SIZE; // 100
  }
  if (sym.includes('BTC') || sym.includes('ETH')) {
    return 1;
  }
  if (
    sym.includes('US30') ||
    sym.includes('DJ30') ||
    sym.includes('NAS') ||
    sym.includes('SPX') ||
    sym.includes('GER') ||
    sym.includes('DAX')
  ) {
    return 1;
  }
  // Standard Forex
  return 100000;
}

/**
 * Estimates values that can be derived safely from the order fields and a
 * known broker profile. Imported MT5 trades keep the broker's actual values.
 */
export function estimateBrokerTrade(input: BrokerTradeEstimateInput): BrokerTradeEstimate {
  const accountName = (input.accountName || '').trim();
  const isFtmo = /(^|\W)ftmo(\W|$)/i.test(accountName);
  const accountCurrency = (input.accountCurrency || 'USD').trim().toUpperCase() || 'USD';
  const sym = normalizedSymbol(input.symbol || '');

  if (!sym) {
    return {
      supported: false,
      ready: false,
      profileLabel: null,
      grossProfit: null,
      fee: null,
      riskAmount: null,
      note: 'Vui lòng nhập Symbol để hệ thống tự tính.',
    };
  }

  const contractSize = getContractSize(input.symbol);
  const isGold = sym.includes('XAU') || sym.includes('GOLD');

  const profileLabel = isFtmo
    ? `FTMO · ${sym} · ${accountCurrency}`
    : `${accountName || 'Chuẩn'} · ${sym} · ${accountCurrency}`;

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

  const isSlValid = input.stopLoss == null || (
    input.direction === 'buy' ? input.stopLoss < input.entryPrice : input.stopLoss > input.entryPrice
  );

  let warning: string | null = null;
  let isPriceInvalid = false;

  if (positive(input.stopLoss) && !isSlValid) {
    isPriceInvalid = true;
    warning = input.direction === 'sell'
      ? `Lệnh Sell yêu cầu Stop Loss (${input.stopLoss}) phải cao hơn Entry (${input.entryPrice}). Hiện tại SL đang thấp hơn Entry.`
      : `Lệnh Buy yêu cầu Stop Loss (${input.stopLoss}) phải thấp hơn Entry (${input.entryPrice}). Hiện tại SL đang cao hơn Entry.`;
  } else if (
    (positive(input.stopLoss) && (input.entryPrice > input.stopLoss * 2.5 || input.stopLoss > input.entryPrice * 2.5)) ||
    (positive(input.closePrice) && (input.entryPrice > input.closePrice * 2.5 || input.closePrice > input.entryPrice * 2.5))
  ) {
    isPriceInvalid = true;
    warning = `Cảnh báo: Chênh lệch giá bất thường giữa Entry (${input.entryPrice}) và SL/Close (${input.stopLoss ?? input.closePrice}). Vui lòng kiểm tra xem bạn có gõ thừa/thiếu chữ số không.`;
  }

  const side = input.direction === 'buy' ? 1 : -1;
  const grossProfit = money(
    side * (input.closePrice - input.entryPrice) * contractSize * input.volume,
  );

  let fee = 0;
  let feeNote = `Hệ thống tự tính Lãi/Lỗ theo kích thước hợp đồng chuẩn (${contractSize} / lot).`;

  if (isFtmo && isGold) {
    const commissionRate = input.tradeDate && input.tradeDate.slice(0, 10) < FTMO_COMMISSION_CHANGE_DATE
      ? FTMO_LEGACY_METALS_COMMISSION_RATE_PER_SIDE
      : FTMO_METALS_COMMISSION_RATE_PER_SIDE;
    fee = money(
      (input.entryPrice + input.closePrice) * contractSize * input.volume * commissionRate,
    );
    feeNote = `Commission được tính theo biểu phí FTMO Metals CFD (${commissionRate === FTMO_METALS_COMMISSION_RATE_PER_SIDE ? '0,0007%' : '0,0005%'} mỗi chiều); lệnh nhập tay chưa cộng swap qua đêm.`;
  }

  const stopDistance = positive(input.stopLoss) && isSlValid ? Math.abs(input.entryPrice - input.stopLoss) : 0;
  const riskAmount = stopDistance > 0
    ? money(stopDistance * contractSize * input.volume)
    : null;

  return {
    supported: true,
    ready: true,
    profileLabel,
    grossProfit,
    fee,
    riskAmount,
    note: feeNote,
    warning,
    isPriceInvalid,
  };
}
