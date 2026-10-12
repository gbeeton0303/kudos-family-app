export async function readAllPages<T>(
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown; count?: number | null }>,
  pageSize = 500,
): Promise<{ data: T[]; error: null }> {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('Invalid page size.');
  const rows: T[] = [];
  for (;;) {
    const page = await readPage(rows.length, rows.length + pageSize - 1);
    if (page.error) throw page.error;
    const batch = page.data ?? [];
    if (!batch.length) {
      if (page.count != null && rows.length < page.count) throw new Error('Cloud history changed while loading. Please retry.');
      return { data: rows, error: null };
    }
    rows.push(...batch);
    // Exact counts also handle servers configured with a smaller row cap.
    if (page.count != null ? rows.length >= page.count : batch.length < pageSize) return { data: rows, error: null };
  }
}
