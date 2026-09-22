import type { ParseResult } from './shared';
import { blankTrade, parseNumber, parseTimestamp } from './shared';

export type Mt5Options = { accountId: string; accountNumber: string; brokerUtcOffsetMinutes: number };

export function decodeMt5File(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  if (view.length >= 2 && view[0] === 0xff && view[1] === 0xfe) return new TextDecoder('utf-16le').decode(view);
  if (view.length >= 2 && view[0] === 0xfe && view[1] === 0xff) return new TextDecoder('utf-16be').decode(view);
  if (view.length >= 3 && view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) return new TextDecoder('utf-8').decode(view);
  const sample = view.subarray(0, Math.min(view.length, 200));
  let oddNulls = 0; let evenNulls = 0;
  sample.forEach((value, index) => {
    if (value === 0) {
      if (index % 2) oddNulls++;
      else evenNulls++;
    }
  });
  if (oddNulls > sample.length / 8) return new TextDecoder('utf-16le').decode(view);
  if (evenNulls > sample.length / 8) return new TextDecoder('utf-16be').decode(view);
  return new TextDecoder('utf-8', { fatal: true }).decode(view);
}

const cellText = (cell: Element) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim();
const cells = (row: Element) => Array.from(row.children).filter((el) => el.tagName === 'TD' || el.tagName === 'TH').map(cellText);
const norm = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

export function parseMt5Html(html: string, options: Mt5Options): ParseResult {
  const result: ParseResult = { format: 'mt5', trades: [], issues: [] };
  if (typeof DOMParser === 'undefined') {
    result.issues.push({ row: 0, message: 'DOMParser chỉ có trong trình duyệt.' });
    return result;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const plainText = doc.body.textContent ?? '';
  const detectedAccount = plainText.match(/(?:Account|Login|Tài khoản)\s*(?:No\.?|Number|#|:)\s*([0-9]{4,})/i)?.[1];
  result.accountNumber = detectedAccount;
  if (!/^\d{4,}$/.test(options.accountNumber)) {
    result.issues.push({ row: 0, message: 'Cần nhập số tài khoản MT5 để tạo khóa chống trùng.' });
    return result;
  }
  if (detectedAccount && detectedAccount !== options.accountNumber) {
    result.issues.push({ row: 0, message: `Số tài khoản trong báo cáo (${detectedAccount}) khác số đã nhập (${options.accountNumber}).` });
    return result;
  }
  if (!Number.isInteger(options.brokerUtcOffsetMinutes) || Math.abs(options.brokerUtcOffsetMinutes) > 14 * 60) {
    result.issues.push({ row: 0, message: 'Múi giờ server MT5 không hợp lệ.' });
    return result;
  }
  const balanceMatch = plainText.match(/(?:^|\s)Balance\s*:?\s*([\d.,'\s-]+)(?:\s|$)/i);
  if (balanceMatch) result.reportedBalance = parseNumber(balanceMatch[1]) ?? undefined;

  let foundSection = false;
  let inPositions = false;
  let section: 'positions' | 'other' | null = null;
  let rowNumber = 0;
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.querySelectorAll('tr'));
    let headerSeen = false;
    for (const row of rows) {
      rowNumber++;
      const values = cells(row);
      if (!values.length) continue;
      const joined = norm(values.join(' '));
      if (values.length <= 3 && /^(positions|closed positions|vị thế)/i.test(joined)) { inPositions = true; section = 'positions'; headerSeen = false; foundSection = true; continue; }
      if (values.length <= 3 && /^(orders|deals|summary|working orders|details)/i.test(joined)) { inPositions = false; section = 'other'; continue; }
      const header = values.map(norm);
      if (inPositions || section === null && (header.includes('position') || header.includes('position id'))) {
        if (header.includes('symbol') && header.includes('profit') && header.some((h) => h.includes('volume'))) {
          const supported = header.length >= 14 && header[1].includes('position') && header[2] === 'symbol' && header[3] === 'type' && header[5].includes('volume') && header[11].includes('commission') && header[12] === 'swap' && header[13] === 'profit';
          if (!supported) {
            result.issues.push({ row: rowNumber, message: 'Bảng Positions có thứ tự cột khác mẫu 14 cột được hỗ trợ; không nhập để tránh sai số liệu.' });
            inPositions = false;
            section = 'other';
            continue;
          }
          inPositions = true; headerSeen = true; foundSection = true;
          continue;
        }
      }
      if (!inPositions || !headerSeen) continue;
      if (values.length < 14) continue;
      const id = values[1].trim();
      if (!/^\d+$/.test(id)) continue;
      const direction = norm(values[3]);
      const open = parseTimestamp(values[0], options.brokerUtcOffsetMinutes);
      const close = parseTimestamp(values[9], options.brokerUtcOffsetMinutes);
      const volume = parseNumber(values[5]);
      const entry = parseNumber(values[6]);
      const sl = parseNumber(values[7]);
      const tp = parseNumber(values[8]);
      const exit = parseNumber(values[10]);
      const commission = parseNumber(values[11]);
      const swap = parseNumber(values[12]);
      const profit = parseNumber(values[13]);
      if (!close) {
        result.issues.push({ row: rowNumber, message: `Vị thế ${id} chưa đóng hoặc thiếu giờ đóng; bỏ qua.` });
        continue;
      }
      const invalidOptionalPrice = (raw: string, parsed: number | null) => raw.trim() !== '' && !['-', '—'].includes(raw.trim()) && parsed === null;
      if (!open || close < open || !values[2] || !['buy', 'sell'].includes(direction) || volume === null || volume <= 0 || entry === null || exit === null || commission === null || swap === null || profit === null || invalidOptionalPrice(values[7], sl) || invalidOptionalPrice(values[8], tp)) {
        result.issues.push({ row: rowNumber, message: `Vị thế ${id} thiếu hoặc sai dữ liệu bắt buộc.` });
        continue;
      }
      const trade = blankTrade(options.accountId);
      trade.date = open;
      trade.close_time = close;
      trade.symbol = values[2].toUpperCase();
      trade.direction = direction as 'buy' | 'sell';
      trade.volume = volume;
      trade.entry_price = entry;
      trade.exit_price = exit;
      trade.sl_price = sl;
      trade.tp_price = tp;
      trade.profit = profit;
      // MT5 reports commission and swap as signed cash flows; a positive entry is a credit.
      trade.fee = -(commission + swap);
      trade.mt5_key = `mt5_${options.accountNumber}_${id}`;
      result.trades.push({ row: rowNumber, trade, sourceId: trade.mt5_key });
    }
  }
  const positionCounts = new Map<string, number>();
  for (const item of result.trades) positionCounts.set(item.sourceId, (positionCounts.get(item.sourceId) ?? 0) + 1);
  for (const [sourceId, count] of positionCounts) {
    if (count > 1) result.issues.push({ row: 0, message: `Mã vị thế ${sourceId} xuất hiện ${count} lần; cần đối chiếu báo cáo trước khi nhập.` });
  }
  result.trades = result.trades.filter((item) => positionCounts.get(item.sourceId) === 1);
  if (!foundSection) result.issues.unshift({ row: 0, message: 'Không tìm thấy bảng Positions phù hợp trong báo cáo MT5. Hãy xuất báo cáo HTML có lịch sử vị thế.' });
  if (foundSection && !result.trades.length && !result.issues.length) result.issues.push({ row: 0, message: 'Bảng Positions không có vị thế đã đóng để nhập.' });
  return result;
}
