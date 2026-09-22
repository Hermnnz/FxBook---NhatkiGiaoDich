export type SizeInput = {
  balance: number; riskPercent: number; entry: number; stop: number; target?: number;
  instrument: 'forex' | 'stock' | 'futures'; direction: 'buy' | 'sell';
  tickSize?: number; tickValue?: number; lotStep?: number; minSize?: number;
};
export type SizeResult = { riskBudget: number; rawSize: number; size: number; actualRisk: number; rewardRisk: number | null };

export function calculatePositionSize(input: SizeInput): SizeResult {
  const { balance, riskPercent, entry, stop, target, instrument } = input;
  if (![balance, riskPercent, entry, stop].every(Number.isFinite) || balance <= 0 || riskPercent <= 0 || riskPercent > 100 || entry <= 0 || stop <= 0 || entry === stop) throw new Error('Số dư, rủi ro, Entry và SL phải hợp lệ.');
  if (input.direction === 'buy' && stop >= entry || input.direction === 'sell' && stop <= entry) throw new Error('SL phải nằm phía lỗ của vị thế.');
  if (target !== undefined && (!Number.isFinite(target) || target <= 0 || (input.direction === 'buy' && target <= entry) || (input.direction === 'sell' && target >= entry))) throw new Error('TP phải hợp lệ và nằm phía lợi nhuận của vị thế.');
  const distance = Math.abs(entry - stop);
  const riskBudget = balance * riskPercent / 100;
  let riskPerUnit: number;
  let step: number;
  if (instrument === 'stock') {
    riskPerUnit = distance;
    step = input.lotStep ?? 1;
  } else {
    const tickSize = input.tickSize ?? 0;
    const tickValue = input.tickValue ?? 0;
    if (tickSize <= 0 || tickValue <= 0) throw new Error('Nhập Tick Size và Tick Value theo thông số hợp đồng của broker.');
    riskPerUnit = distance / tickSize * tickValue;
    step = input.lotStep ?? (instrument === 'forex' ? 0.01 : 1);
  }
  const minSize = input.minSize ?? step;
  if (step <= 0 || !Number.isFinite(step) || minSize <= 0 || !Number.isFinite(minSize) || riskPerUnit <= 0) throw new Error('Bước hoặc khối lượng tối thiểu không hợp lệ.');
  const rawSize = riskBudget / riskPerUnit;
  if (rawSize < minSize - 1e-10) throw new Error('Mức rủi ro hiện tại nhỏ hơn khối lượng tối thiểu.');
  const decimals = Math.max(String(step).split('.')[1]?.length ?? 0, String(minSize).split('.')[1]?.length ?? 0);
  const size = Number((minSize + Math.floor((rawSize - minSize + 1e-10) / step) * step).toFixed(decimals));
  const rewardRisk = target !== undefined && Number.isFinite(target) && target > 0 ? Math.abs(target - entry) / distance : null;
  return { riskBudget, rawSize, size, actualRisk: size * riskPerUnit, rewardRisk };
}
