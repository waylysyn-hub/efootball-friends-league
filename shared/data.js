// Whole-table snapshots must not silently stop at PostgREST's row cap.
// The factory supplies a stable, unique ordering and a fresh builder per page.
// Request the total once, so even projects with a cap below 1,000 are supported.
export async function readAllRows(query, pageSize = 1000) {
  const rows = [];
  let total = null;
  for (;;) {
    const result = await query(rows.length ? {} : { count: 'exact' })
      .range(rows.length, rows.length + pageSize - 1);
    if (result.error) return { ...result, data: null };
    const page = result.data || [];
    total ??= result.count;
    rows.push(...page);
    if (total !== null && total !== undefined && rows.length < total && !page.length) {
      // Concurrent deletion or an incomplete response: keep the previous snapshot.
      throw new Error('Incomplete league snapshot');
    }
    if (total != null ? rows.length >= total : page.length < pageSize) {
      return { data: rows, error: null };
    }
  }
}
