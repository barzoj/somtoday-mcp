/** ISO weeks fetched at the same time, so long ranges stay polite. */
export const WEEKS_PER_BATCH = 6;

/** `Promise.all` over `items`, at most `size` at a time, results in input order. */
export async function mapInBatches<T, R>(
  items: T[],
  size: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    out.push(...(await Promise.all(items.slice(start, start + size).map(run))));
  }
  return out;
}
