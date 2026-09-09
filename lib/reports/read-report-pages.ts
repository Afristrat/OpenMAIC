/** Consume ordered pages without treating a server row cap as the end of a report. */
export async function* readReportPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: unknown;
    count: number | null;
  }>,
): AsyncGenerator<T> {
  let offset = 0;
  let expected: number | undefined;
  while (true) {
    const { data, error, count } = await fetchPage(offset, offset + 99);
    if (
      error ||
      !Array.isArray(data) ||
      count === null ||
      !Number.isSafeInteger(count) ||
      count < 0
    )
      throw new Error('Report page unavailable');
    if (expected !== undefined && count !== expected) throw new Error('Report changed during read');
    expected = count;
    if (data.length > 100 || offset + data.length > count || (!data.length && offset < count))
      throw new Error('Incomplete report page');
    yield* data;
    offset += data.length;
    if (offset === count) return;
  }
}
