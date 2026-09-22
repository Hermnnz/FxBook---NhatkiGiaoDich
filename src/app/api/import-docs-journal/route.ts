import { NextResponse } from 'next/server';
import {
  importDocsJournalAction,
  importMt5ReportAction,
  importAllDocsAction,
} from '@/lib/actions/docs-excel-import';

export async function POST(request: Request) {
  try {
    let accountId: string | undefined;
    let type = 'all';
    try {
      const body = await request.json();
      accountId = body.accountId;
      if (body.type) type = body.type;
    } catch {
      // no json body
    }

    let result;
    if (type === 'excel') {
      result = await importDocsJournalAction(accountId);
    } else if (type === 'mt5') {
      result = await importMt5ReportAction(accountId);
    } else {
      result = await importAllDocsAction(accountId);
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'all';
  const accountId = url.searchParams.get('accountId') || undefined;

  let result;
  if (type === 'excel') {
    result = await importDocsJournalAction(accountId);
  } else if (type === 'mt5') {
    result = await importMt5ReportAction(accountId);
  } else {
    result = await importAllDocsAction(accountId);
  }

  return NextResponse.json(result);
}
