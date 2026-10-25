'use client';

/** UI hint only. Always returns true to allow full write access without trial lockout. */
export function useJournalWritable(): boolean {
  return true;
}
