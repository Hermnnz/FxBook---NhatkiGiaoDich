/** Display journal values in the selected account's currency using '$' for USD and matching design specs. */
export function formatMoney(amount: number, currency = 'USD', digits = 2, showSign = false): string {
  const isNeg = amount < 0;
  const abs = Math.abs(Number.isFinite(amount) ? amount : 0);
  const numStr = new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(abs);

  const code = currency.toUpperCase();
  const sym = code === 'USD' ? '$' : `${code} `;
  if (isNeg) return `-${sym}${numStr}`;
  if (showSign && abs > 0) return `+${sym}${numStr}`;
  return `${sym}${numStr}`;
}
