import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Simple in-memory Prometheus metrics (no prom-client dependency)
// ---------------------------------------------------------------------------

type CounterLabels = Record<string, string>;

interface CounterEntry {
  labels: CounterLabels;
  value: number;
}

const counters: Map<string, CounterEntry[]> = new Map();
const histograms: Map<string, { sum: number; count: number; buckets: Map<number, number> }> =
  new Map();
const gauges: Map<string, number> = new Map();

// Default histogram buckets (seconds)
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

// ---------------------------------------------------------------------------
// Public helpers — import these from other modules to record metrics
// ---------------------------------------------------------------------------

export function incrementCounter(name: string, labels: CounterLabels = {}): void {
  if (!counters.has(name)) counters.set(name, []);
  const entries = counters.get(name)!;
  const existing = entries.find((e) =>
    Object.keys(labels).every((k) => e.labels[k] === labels[k]) &&
    Object.keys(e.labels).length === Object.keys(labels).length,
  );
  if (existing) {
    existing.value += 1;
  } else {
    entries.push({ labels: { ...labels }, value: 1 });
  }
}

export function observeHistogram(name: string, value: number): void {
  if (!histograms.has(name)) {
    const buckets = new Map<number, number>();
    for (const b of DEFAULT_BUCKETS) buckets.set(b, 0);
    histograms.set(name, { sum: 0, count: 0, buckets });
  }
  const h = histograms.get(name)!;
  h.sum += value;
  h.count += 1;
  for (const [bound] of h.buckets) {
    if (value <= bound) h.buckets.set(bound, (h.buckets.get(bound) ?? 0) + 1);
  }
}

export function setGauge(name: string, value: number): void {
  gauges.set(name, value);
}

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

function labelsToString(labels: CounterLabels): string {
  const parts = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  return parts.length > 0 ? `{${parts.join(',')}}` : '';
}

function serialize(): string {
  const lines: string[] = [];

  // Counters
  for (const [name, entries] of counters) {
    lines.push(`# HELP ${name} Counter`);
    lines.push(`# TYPE ${name} counter`);
    for (const e of entries) {
      lines.push(`${name}${labelsToString(e.labels)} ${e.value}`);
    }
  }

  // Histograms
  for (const [name, h] of histograms) {
    lines.push(`# HELP ${name} Histogram`);
    lines.push(`# TYPE ${name} histogram`);
    const sortedBounds = [...h.buckets.keys()].sort((a, b) => a - b);
    let cumulative = 0;
    for (const bound of sortedBounds) {
      cumulative += h.buckets.get(bound) ?? 0;
      lines.push(`${name}_bucket{le="${bound}"} ${cumulative}`);
    }
    lines.push(`${name}_bucket{le="+Inf"} ${h.count}`);
    lines.push(`${name}_sum ${h.sum}`);
    lines.push(`${name}_count ${h.count}`);
  }

  // Gauges
  for (const [name, value] of gauges) {
    lines.push(`# HELP ${name} Gauge`);
    lines.push(`# TYPE ${name} gauge`);
    lines.push(`${name} ${value}`);
  }

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Seed default metrics so they always appear even if value is 0
// ---------------------------------------------------------------------------

if (!counters.has('qalem_api_requests_total')) counters.set('qalem_api_requests_total', []);
if (!counters.has('qalem_classrooms_generated_total'))
  counters.set('qalem_classrooms_generated_total', []);
if (!histograms.has('qalem_tts_generation_seconds')) {
  const buckets = new Map<number, number>();
  for (const b of DEFAULT_BUCKETS) buckets.set(b, 0);
  histograms.set('qalem_tts_generation_seconds', { sum: 0, count: 0, buckets });
}
if (!gauges.has('qalem_active_users')) gauges.set('qalem_active_users', 0);

// ---------------------------------------------------------------------------
// GET /api/metrics
// ---------------------------------------------------------------------------

export function GET(): NextResponse {
  return new NextResponse(serialize(), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
  });
}
