'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import fs from 'fs';
import path from 'path';
import * as xlsx from 'xlsx';
import { calcTheoreticalProfit } from '@/lib/calculations';

export interface ImportDocsResult {
  success: boolean;
  count: number;
  skipped: number;
  error?: string;
  accountName?: string;
  source?: string;
}

type DocTrade = Record<string, unknown> & {
  mt5_key: string;
  theoretical_profit: number | null;
  tradingview_url: string | null;
};

function safeReadExcelWorkbook(filePath: string): xlsx.WorkBook | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath);
    return xlsx.read(buf, { type: 'buffer' });
  } catch {
    // If locked by Excel, try copy
    try {
      const tempPath = path.join(process.cwd(), 'docs', `_temp_read_${Date.now()}.xlsx`);
      fs.copyFileSync(filePath, tempPath);
      const buf = fs.readFileSync(tempPath);
      try { fs.unlinkSync(tempPath); } catch {}
      return xlsx.read(buf, { type: 'buffer' });
    } catch (e) {
      console.error('Failed to read Excel workbook:', e);
      return null;
    }
  }
}

async function getAuthenticatedUserAndAccount(targetAccountId?: string, preferredAccountName?: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('Chưa đăng nhập. Vui lòng đăng nhập để nạp dữ liệu.');
  }

  const { data: accounts, error: accError } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  if (accError) {
    throw new Error(`Lỗi truy vấn tài khoản: ${accError.message}`);
  }

  const accountList = accounts || [];
  let matchedAcc: (typeof accountList)[number] | null = null;

  // 1. If targetAccountId matches an account ID or account name
  if (targetAccountId && targetAccountId !== 'all') {
    matchedAcc = accountList.find(
      (a) => a.id === targetAccountId || a.name.toLowerCase() === targetAccountId.toLowerCase()
    );
  }

  // 2. If preferredAccountName is provided (e.g. 'Demo_strategy')
  if (!matchedAcc && preferredAccountName) {
    matchedAcc = accountList.find(
      (a) => a.name.toLowerCase() === preferredAccountName.toLowerCase()
    );
  }

  // 3. If preferredAccountName was requested but doesn't exist, create it!
  if (!matchedAcc && preferredAccountName) {
    const { data: newAcc, error: createAccErr } = await supabase
      .from('accounts')
      .insert({
        user_id: user.id,
        name: preferredAccountName,
        initial_balance: 10000,
        risk_pct: 1.0,
        currency: 'USD',
        is_active: true,
      })
      .select()
      .single();

    if (!createAccErr && newAcc) {
      matchedAcc = newAcc;
    }
  }

  // 4. Fallback to active account or first account
  if (!matchedAcc) {
    matchedAcc = accountList.find((a) => a.is_active) || accountList[0];
  }

  // 5. If still no account, create default
  if (!matchedAcc) {
    const { data: newAcc, error: createAccErr } = await supabase
      .from('accounts')
      .insert({
        user_id: user.id,
        name: preferredAccountName || 'Demo_strategy',
        initial_balance: 10000,
        risk_pct: 1.0,
        currency: 'USD',
        is_active: true,
      })
      .select()
      .single();

    if (createAccErr || !newAcc) {
      throw new Error('Không tạo được tài khoản giao dịch.');
    }
    matchedAcc = newAcc;
  }

  return { supabase, user, accountId: matchedAcc.id, accountName: matchedAcc.name, accounts: accountList };
}

function parseExcelTrades(userId: string, accountId: string) {
  const filePath = path.join(process.cwd(), 'docs', 'Nhật ký giao dịch.xlsx');
  const workbook = safeReadExcelWorkbook(filePath);
  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) return [];

  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  if (!data || data.length < 13) return [];

  const trades: DocTrade[] = [];
  for (let i = 12; i < data.length; i++) {
    const r = data[i];
    if (!r || !r[2]) continue;

    const serialOpen = Number(r[0]);
    const serialClose = r[1] != null && r[1] !== '' ? Number(r[1]) : null;
    if (!Number.isFinite(serialOpen)) continue;

    const openDate = new Date(Date.UTC(1899, 11, 30) + Math.round(serialOpen * 86400000));
    const closeDate = serialClose ? new Date(Date.UTC(1899, 11, 30) + Math.round(serialClose * 86400000)) : null;

    const symbol = String(r[2]).trim().toUpperCase();
    const directionRaw = String(r[3] || '').trim().toLowerCase();
    const direction = directionRaw === 'sell' || directionRaw === 'short' || directionRaw === 'ban' ? 'sell' : 'buy';
    const volume = Number(r[4]) || 0.1;

    const sessionRaw = String(r[5] || '').toLowerCase();
    let session = null;
    if (sessionRaw.includes('âu') || sessionRaw.includes('au') || sessionRaw.includes('london')) {
      session = 'London';
    } else if (sessionRaw.includes('mỹ') || sessionRaw.includes('my') || sessionRaw.includes('york')) {
      session = 'New York';
    } else if (sessionRaw.includes('á') || sessionRaw.includes('a') || sessionRaw.includes('asia')) {
      session = 'Asia';
    } else if (r[5]) {
      session = String(r[5]).trim();
    }

    const entryPrice = r[6] != null && r[6] !== '' ? Number(r[6]) : null;
    const slPrice = r[7] != null && r[7] !== '' ? Number(r[7]) : null;
    const tpPrice = r[8] != null && r[8] !== '' ? Number(r[8]) : null;
    const exitPrice = r[9] != null && r[9] !== '' ? Number(r[9]) : null;

    const profit = Number(r[10]) || 0;
    const fee = 0;

    let riskAmount = null;
    if (entryPrice != null && slPrice != null && volume > 0) {
      riskAmount = Math.round(Math.abs(entryPrice - slPrice) * volume * 100 * 100) / 100;
      if (riskAmount <= 0) riskAmount = null;
    }

    const tradingviewUrl = r[13] && /^https?:\/\//i.test(String(r[13]).trim()) ? String(r[13]).trim() : null;
    const correctChecklist = Boolean(r[14]);
    const violatedRule = r[15] && String(r[15]).trim() !== '' ? String(r[15]).trim() : null;
    const setupReason = r[16] ? String(r[16]).trim() : '';
    const psychology = r[17] ? String(r[17]).trim() : '';
    const review = r[18] ? String(r[18]).trim() : '';

    let setup = null;
    if (setupReason.toLowerCase().includes('fvg')) {
      setup = 'FVG Supply/Demand';
    } else if (setupReason.toLowerCase().includes('tam giác')) {
      setup = 'Mô hình tam giác';
    } else if (setupReason.toLowerCase().includes('vai đầu vai')) {
      setup = 'Vai đầu vai';
    } else if (setupReason.toLowerCase().includes('cản')) {
      setup = 'Kháng cự / Hỗ trợ';
    } else if (setupReason.toLowerCase().includes('sideway')) {
      setup = 'Breakout / Sideway';
    } else if (setupReason) {
      setup = 'Price Action + VSA';
    }

    const noteParts: string[] = [];
    if (setupReason) noteParts.push(`Lý do: ${setupReason}`);
    if (psychology) noteParts.push(`Tâm lý: ${psychology}`);
    if (review) noteParts.push(`Nhận định: ${review}`);
    if (violatedRule) noteParts.push(`Vi phạm: ${violatedRule}`);
    const note = noteParts.length > 0 ? noteParts.join('\n\n') : null;

    const evalBefore: string[] = [];
    if (correctChecklist) evalBefore.push('Đúng checklist');
    if (violatedRule) evalBefore.push(violatedRule);

    const theoreticalProfit = calcTheoreticalProfit({
      symbol,
      direction,
      entryPrice,
      tpPrice,
      volume,
      fee,
    });

    const evalErrors = violatedRule ? [violatedRule] : [];
    const mt5Key = `doc_excel_row_${i + 1}_${symbol}_${serialOpen}_${profit}`;

    trades.push({
      user_id: userId,
      account_id: accountId,
      date: openDate.toISOString(),
      close_time: closeDate ? closeDate.toISOString() : null,
      symbol,
      direction,
      volume,
      session,
      entry_price: entryPrice,
      sl_price: slPrice,
      tp_price: tpPrice,
      exit_price: exitPrice,
      profit,
      fee,
      theoretical_profit: theoreticalProfit,
      risk_amount: riskAmount,
      setup,
      timeframe: 'M15/H1/H4',
      tradingview_url: tradingviewUrl,
      note,
      mt5_key: mt5Key,
      incomplete: false,
      eval_before: evalBefore,
      eval_during: [],
      eval_after: review ? [review.slice(0, 100)] : [],
      eval_errors: evalErrors,
    });
  }
  return trades;
}

function parseMt5HtmlTrades(userId: string, accountId: string) {
  const filePath = path.join(process.cwd(), 'docs', 'ReportHistory-541431473.html');
  if (!fs.existsSync(filePath)) return [];

  const buf = fs.readFileSync(filePath);
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');

  const startIdx = text.indexOf('>Positions<');
  if (startIdx === -1) return [];
  const endIdx = text.indexOf('>Orders<', startIdx);
  const posHtml = endIdx !== -1 ? text.slice(startIdx, endIdx) : text.slice(startIdx);

  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi;

  const trades: DocTrade[] = [];
  let match;
  while ((match = trRegex.exec(posHtml)) !== null) {
    const rowContent = match[1];
    const cells: string[] = [];
    let cellMatch;
    while ((cellMatch = tdRegex.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      if (attrs.includes('hidden')) continue; // skip hidden column in MT5 report
      const cellText = cellMatch[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      cells.push(cellText);
    }

    if (cells.length >= 13 && /^\d+$/.test(cells[1])) {
      const openTimeRaw = cells[0];
      const positionId = cells[1];
      const symbol = cells[2].trim().toUpperCase();
      const direction = cells[3].trim().toLowerCase() === 'sell' ? 'sell' : 'buy';
      const volume = parseFloat(cells[4]) || 0.01;
      const entryPrice = parseFloat(cells[5]) || null;
      const slPrice = cells[6] && parseFloat(cells[6]) > 0 ? parseFloat(cells[6]) : null;
      const tpPrice = cells[7] && parseFloat(cells[7]) > 0 ? parseFloat(cells[7]) : null;
      const closeTimeRaw = cells[8];
      const exitPrice = parseFloat(cells[9]) || null;
      const commission = parseFloat(cells[10]) || 0;
      const swap = parseFloat(cells[11]) || 0;
      const profit = parseFloat(cells[12]) || 0;

      const fee = Math.round(-(commission + swap) * 100) / 100;

      const parseDate = (s: string) => {
        if (!s) return null;
        const m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
        if (!m) return null;
        const [, y, mo, d, h, mi, sec = '00'] = m;
        return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +sec)).toISOString();
      };

      const dateIso = parseDate(openTimeRaw);
      if (!dateIso) continue;
      const closeIso = parseDate(closeTimeRaw);

      const hour = parseInt(openTimeRaw.split(' ')[1]?.split(':')[0] || '12', 10);
      let session: string | null = null;
      if (hour >= 3 && hour < 11) session = 'Asia';
      else if (hour >= 11 && hour < 16) session = 'London';
      else if (hour >= 16 && hour < 24) session = 'New York';

      let riskAmount = null;
      if (entryPrice != null && slPrice != null && volume > 0) {
        riskAmount = Math.round(Math.abs(entryPrice - slPrice) * volume * 100 * 100) / 100;
        if (riskAmount <= 0) riskAmount = null;
      }

      const theoreticalProfit = calcTheoreticalProfit({
        symbol,
        direction,
        entryPrice,
        tpPrice,
        volume,
        fee,
      });

      const mt5Key = `mt5_541431473_${positionId}`;

      trades.push({
        user_id: userId,
        account_id: accountId,
        date: dateIso,
        close_time: closeIso,
        symbol,
        direction,
        volume,
        session,
        entry_price: entryPrice,
        sl_price: slPrice,
        tp_price: tpPrice,
        exit_price: exitPrice,
        profit,
        fee,
        theoretical_profit: theoreticalProfit,
        risk_amount: riskAmount,
        setup: 'MT5 Trade',
        timeframe: null,
        tradingview_url: null,
        note: `Lệnh MT5 #${positionId}`,
        mt5_key: mt5Key,
        incomplete: false,
        eval_before: [],
        eval_during: [],
        eval_after: [],
        eval_errors: [],
      });
    }
  }

  return trades;
}

async function insertTradesSafely(supabase: Awaited<ReturnType<typeof createClient>>, trades: DocTrade[], accountName: string, source: string): Promise<ImportDocsResult> {
  if (trades.length === 0) {
    return { success: false, count: 0, skipped: 0, error: 'Không tìm thấy dòng lệnh hợp lệ nào để nạp.' };
  }

  const keysToCheck = trades.map((t) => t.mt5_key).filter(Boolean);
  const existingByKey = new Map<string, { theoretical_profit: number | null; tradingview_url: string | null }>();

  for (let i = 0; i < keysToCheck.length; i += 100) {
    const chunk = keysToCheck.slice(i, i + 100);
    const { data: existingData, error: existingError } = await supabase
      .from('trades')
      .select('mt5_key,theoretical_profit,tradingview_url')
      .in('mt5_key', chunk);

    if (existingError) {
      return { success: false, count: 0, skipped: 0,
        error: `Không kiểm tra được lệnh đã tồn tại: ${existingError.message}` };
    }

    if (existingData) {
      existingData.forEach((row: { mt5_key: string | null; theoretical_profit: number | null; tradingview_url: string | null }) => {
        if (row.mt5_key) existingByKey.set(row.mt5_key, {
          theoretical_profit: row.theoretical_profit,
          tradingview_url: row.tradingview_url,
        });
      });
    }
  }

  // Fill only missing fields. Never overwrite a value edited by the user.
  const toUpdate = trades.filter((t) => existingByKey.has(t.mt5_key));
  let updatedExistingCount = 0;
  for (const t of toUpdate) {
    const updatePayload: Record<string, unknown> = {};
    const existing = existingByKey.get(t.mt5_key)!;
    if (existing.theoretical_profit == null && t.theoretical_profit != null) {
      updatePayload.theoretical_profit = t.theoretical_profit;
    }
    if (!existing.tradingview_url && t.tradingview_url) {
      updatePayload.tradingview_url = t.tradingview_url;
    }
    if (Object.keys(updatePayload).length > 0) {
      const { data: updated, error: updateError } = await supabase.from('trades')
        .update(updatePayload).eq('mt5_key', t.mt5_key).select('id');
      if (updateError || !updated?.length) {
        return { success: false, count: updatedExistingCount, skipped: 0,
          error: updateError?.message ?? 'Không cập nhật được lợi nhuận lý thuyết của lệnh đã có.' };
      }
      updatedExistingCount += updated.length;
    }
  }

  const toInsert = trades.filter((t) => !existingByKey.has(t.mt5_key));
  const skipped = trades.length - toInsert.length;

  if (toInsert.length === 0) {
    if (updatedExistingCount > 0) {
      revalidatePath('/history');
      revalidatePath('/');
      revalidatePath('/report');
      revalidatePath('/accounts');
    }
    return {
      success: true,
      count: updatedExistingCount,
      skipped,
      accountName,
      source,
    };
  }

  // Insert in batches of 100
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100);
    const { error: insertErr } = await supabase.from('trades').insert(batch);
    if (insertErr) {
      return {
        success: false,
        count: i,
        skipped,
        error: `Lỗi khi lưu vào cơ sở dữ liệu: ${insertErr.message}`,
      };
    }
  }

  revalidatePath('/history');
  revalidatePath('/');
  revalidatePath('/report');
  revalidatePath('/accounts');

  return {
    success: true,
    count: toInsert.length + updatedExistingCount,
    skipped,
    accountName,
    source,
  };
}


export async function importDocsJournalAction(targetAccountId?: string): Promise<ImportDocsResult> {
  try {
    const { supabase, user, accountId, accountName } = await getAuthenticatedUserAndAccount(
      targetAccountId,
      'Demo_strategy'
    );
    const trades = parseExcelTrades(user.id, accountId);
    if (trades.length === 0) {
      return {
        success: false,
        count: 0,
        skipped: 0,
        error: 'Không đọc được file docs/Nhật ký giao dịch.xlsx.',
      };
    }

    // Ensure all Excel trades belong to this Demo_strategy account
    const excelKeys = trades.map((t) => t.mt5_key);
    for (let i = 0; i < excelKeys.length; i += 100) {
      const chunk = excelKeys.slice(i, i + 100);
      await supabase
        .from('trades')
        .update({ account_id: accountId })
        .in('mt5_key', chunk);
    }

    const res = await insertTradesSafely(supabase, trades, accountName, `Nhật ký giao dịch.xlsx (26 lệnh vào ${accountName})`);
    await backfillAllTradesCalculationsAction(accountId);
    return res;
  } catch (err) {
    return {
      success: false,
      count: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : 'Lỗi không xác định khi nạp Excel.',
    };
  }
}

export async function importMt5ReportAction(targetAccountId?: string): Promise<ImportDocsResult> {
  try {
    const { supabase, user, accountId, accountName } = await getAuthenticatedUserAndAccount(targetAccountId, 'FTMO');
    const trades = parseMt5HtmlTrades(user.id, accountId);
    return await insertTradesSafely(supabase, trades, accountName, 'ReportHistory-541431473.html (59 lệnh)');
  } catch (err) {
    return {
      success: false,
      count: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : 'Lỗi không xác định khi nạp MT5 Report.',
    };
  }
}

export async function importAllDocsAction(targetAccountId?: string): Promise<ImportDocsResult> {
  try {
    // 1. Nạp 26 lệnh Excel trực tiếp vào tài khoản Demo_strategy
    const excelRes = await importDocsJournalAction();

    // Tự nạp dùng FTMO; lời gọi thủ công có thể chỉ định tài khoản đích.
    const mt5Res = await importMt5ReportAction(targetAccountId ?? 'FTMO');

    if (!excelRes.success || !mt5Res.success) {
      return { success: false, count: excelRes.count + mt5Res.count,
        skipped: excelRes.skipped + mt5Res.skipped,
        error: [excelRes.error, mt5Res.error].filter(Boolean).join(' | ') || 'Không nạp đủ dữ liệu từ tài liệu.' };
    }

    return {
      success: true,
      count: (excelRes.count || 0) + (mt5Res.count || 0),
      skipped: (excelRes.skipped || 0) + (mt5Res.skipped || 0),
      source: 'Excel (Demo_strategy) + MT5 (541431473)',
    };
  } catch (err) {
    return {
      success: false,
      count: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : 'Lỗi không xác định khi nạp dữ liệu.',
    };
  }
}


export async function backfillAllTradesCalculationsAction(targetAccountId?: string): Promise<{ success: boolean; updatedCount: number }> {
  try {
    const { supabase, user } = await getAuthenticatedUserAndAccount(targetAccountId);
    const { data: userTrades, error } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id);

    if (error || !userTrades) return { success: false, updatedCount: 0 };

    let updatedCount = 0;
    for (const t of userTrades) {
      let needsUpdate = false;
      const updatePayload: Record<string, unknown> = {};

      if (t.theoretical_profit == null && t.entry_price != null && t.tp_price != null) {
        const tpProfit = calcTheoreticalProfit({
          symbol: t.symbol,
          direction: t.direction,
          entryPrice: Number(t.entry_price),
          tpPrice: Number(t.tp_price),
          volume: Number(t.volume),
          fee: Number(t.fee) || 0,
        });
        if (tpProfit != null) {
          updatePayload.theoretical_profit = tpProfit;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        await supabase.from('trades').update(updatePayload).eq('id', t.id);
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      revalidatePath('/history');
      revalidatePath('/');
      revalidatePath('/report');
    }

    return { success: true, updatedCount };
  } catch {
    return { success: false, updatedCount: 0 };
  }
}
