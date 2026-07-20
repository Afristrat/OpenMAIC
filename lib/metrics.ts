type CounterLabels = Record<string, string>;
interface CounterEntry { labels: CounterLabels; value: number }
interface Histogram { sum: number; count: number; buckets: Map<number, number> }

const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const counters = new Map<string, CounterEntry[]>();
const histograms = new Map<string, Histogram>();
const gauges = new Map<string, number>();

function emptyHistogram(): Histogram {
  return { sum: 0, count: 0, buckets: new Map(DEFAULT_BUCKETS.map((bucket) => [bucket, 0])) };
}

export function incrementCounter(name: string, labels: CounterLabels = {}): void {
  const entries = counters.get(name) ?? [];
  if (!counters.has(name)) counters.set(name, entries);
  const existing = entries.find(
    (entry) =>
      Object.keys(labels).every((key) => entry.labels[key] === labels[key]) &&
      Object.keys(entry.labels).length === Object.keys(labels).length,
  );
  if (existing) existing.value += 1;
  else entries.push({ labels: { ...labels }, value: 1 });
}

export function observeHistogram(name: string, value: number): void {
  const histogram = histograms.get(name) ?? emptyHistogram();
  if (!histograms.has(name)) histograms.set(name, histogram);
  histogram.sum += value;
  histogram.count += 1;
  for (const [bound] of histogram.buckets) {
    if (value <= bound) histogram.buckets.set(bound, (histogram.buckets.get(bound) ?? 0) + 1);
  }
}

export function setGauge(name: string, value: number): void {
  gauges.set(name, value);
}

function labelsToString(labels: CounterLabels): string {
  const parts = Object.entries(labels).map(([key, value]) => `${key}="${value}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
}

export function serializeMetrics(): string {
  const lines: string[] = [];
  for (const [name, entries] of counters) {
    lines.push(`# HELP ${name} Counter`, `# TYPE ${name} counter`);
    for (const entry of entries) lines.push(`${name}${labelsToString(entry.labels)} ${entry.value}`);
  }
  for (const [name, histogram] of histograms) {
    lines.push(`# HELP ${name} Histogram`, `# TYPE ${name} histogram`);
    for (const bound of [...histogram.buckets.keys()].sort((a, b) => a - b)) {
      lines.push(`${name}_bucket{le="${bound}"} ${histogram.buckets.get(bound) ?? 0}`);
    }
    lines.push(`${name}_bucket{le="+Inf"} ${histogram.count}`);
    lines.push(`${name}_sum ${histogram.sum}`, `${name}_count ${histogram.count}`);
  }
  for (const [name, value] of gauges) {
    lines.push(`# HELP ${name} Gauge`, `# TYPE ${name} gauge`, `${name} ${value}`);
  }
  return `${lines.join('\n')}\n`;
}

counters.set('qalem_api_requests_total', []);
counters.set('qalem_classrooms_generated_total', []);
histograms.set('qalem_tts_generation_seconds', emptyHistogram());
gauges.set('qalem_active_users', 0);
