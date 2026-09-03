'use client';

import { useMemo, useState } from 'react';
import {
  evaluateWidgetComposition,
  parseWidgetComposition,
  type WidgetComposition,
  type WidgetEvaluation,
} from '@/lib/plugins/widget-composition';

interface PublishedWidgetRendererProps {
  readonly data: Record<string, unknown>;
}

function initialValues(composition: WidgetComposition): Record<string, number> {
  return Object.fromEntries(composition.inputs.map((input) => [input.id, input.initial]));
}

export function PublishedWidgetRenderer({
  data,
}: PublishedWidgetRendererProps): React.ReactElement | null {
  const composition = useMemo(() => {
    try {
      return parseWidgetComposition(data.composition);
    } catch {
      return null;
    }
  }, [data.composition]);

  if (!composition) return null;
  return <PublishedWidgetSurface key={JSON.stringify(composition)} composition={composition} />;
}

function PublishedWidgetSurface({
  composition,
}: {
  composition: WidgetComposition;
}): React.ReactElement | null {
  const [values, setValues] = useState<Record<string, number>>(() => initialValues(composition));

  const evaluation = useMemo(() => {
    try {
      return evaluateWidgetComposition(composition, values);
    } catch {
      return null;
    }
  }, [composition, values]);

  if (!evaluation) return null;
  return (
    <section
      aria-label={composition.title}
      className="h-full overflow-auto p-5"
      dir={composition.direction}
      lang={composition.locale}
    >
      <h2 className="mb-5 text-xl font-semibold">{composition.title}</h2>
      <WidgetNodes
        composition={composition}
        evaluation={evaluation}
        onInput={(id, value) => setValues((current) => ({ ...current, [id]: value }))}
      />
    </section>
  );
}

function WidgetNodes({
  composition,
  evaluation,
  onInput,
}: {
  composition: WidgetComposition;
  evaluation: WidgetEvaluation;
  onInput: (id: string, value: number) => void;
}): React.ReactElement {
  const nodes = new Map(composition.nodes.map((node) => [node.id, node]));
  const inputs = new Map(composition.inputs.map((input) => [input.id, input]));
  const computations = new Map(composition.computations.map((item) => [item.id, item]));

  const renderNode = (nodeId: string): React.ReactNode => {
    const node = nodes.get(nodeId);
    if (!node) return null;
    switch (node.type) {
      case 'text':
        return <p key={node.id}>{node.text}</p>;
      case 'number_input': {
        const input = inputs.get(node.inputId);
        return input ? (
          <label key={node.id} className="block space-y-1 text-sm">
            <span>{input.label}</span>
            <span className="flex items-center gap-2">
              <input
                aria-label={input.label}
                type="number"
                min={input.min}
                max={input.max}
                step={input.step}
                value={evaluation.values[input.id] ?? input.initial}
                onChange={(event) => {
                  const value = event.currentTarget.valueAsNumber;
                  if (Number.isFinite(value) && value >= input.min && value <= input.max) {
                    onInput(input.id, value);
                  }
                }}
                className="w-32 rounded-md border bg-background px-3 py-2"
              />
              {input.unit && <span className="text-muted-foreground">{input.unit}</span>}
            </span>
          </label>
        ) : null;
      }
      case 'computed_value': {
        const computation = computations.get(node.computationId);
        return computation ? (
          <div key={node.id} className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{computation.label}</p>
            <p className="text-lg font-semibold">
              {evaluation.values[computation.id]}
              {computation.unit ? ` ${computation.unit}` : ''}
            </p>
          </div>
        ) : null;
      }
      case 'condition':
        return (
          <p key={node.id} className="rounded-lg border p-3">
            {evaluation.conditions[node.id] ? node.whenTrue : node.whenFalse}
          </p>
        );
      case 'table':
        return (
          <div key={node.id} className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {node.columns.map((column) => (
                    <th key={column} className="border p-2 text-start">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {node.rows.map((row, rowIndex) => (
                  <tr key={`${node.id}-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`${node.id}-${rowIndex}-${cellIndex}`} className="border p-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'bar_chart': {
        const chartValues = evaluation.charts[node.id] ?? [];
        const maximum = Math.max(...chartValues.map(Math.abs), 1);
        return (
          <div key={node.id} className="space-y-2">
            {node.bars.map((bar, index) => (
              <div
                key={`${node.id}-${bar.label}`}
                className="grid grid-cols-[8rem_1fr_auto] items-center gap-2 text-sm"
              >
                <span className="truncate">{bar.label}</span>
                <span className="h-3 rounded bg-muted">
                  <span
                    className="block h-3 rounded bg-primary"
                    style={{ width: `${(Math.abs(chartValues[index] ?? 0) / maximum) * 100}%` }}
                  />
                </span>
                <span>{chartValues[index] ?? 0}</span>
              </div>
            ))}
          </div>
        );
      }
      case 'layout':
        return (
          <div
            key={node.id}
            className={node.columns === 2 ? 'grid gap-4 md:grid-cols-2' : 'grid gap-4'}
          >
            {node.children.map(renderNode)}
          </div>
        );
    }
  };

  return <div className="space-y-4">{composition.rootNodeIds.map(renderNode)}</div>;
}
