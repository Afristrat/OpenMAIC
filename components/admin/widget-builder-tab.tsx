'use client';

import { useState } from 'react';
import { CheckCircle2, Eye, Loader2, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/hooks/use-i18n';
import {
  parseWidgetComposition,
  type WidgetComposition,
  type WidgetEvaluation,
} from '@/lib/plugins/widget-composition';

type Action = 'generate' | 'preview' | 'publish' | null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireResponseIds(payload: unknown): { templateId: string; versionId: string } {
  if (
    !isRecord(payload) ||
    typeof payload.id !== 'string' ||
    typeof payload.template_id !== 'string'
  ) {
    throw new Error('invalid-draft-response');
  }
  return { templateId: payload.template_id, versionId: payload.id };
}

function requireEvaluation(payload: unknown): WidgetEvaluation {
  if (!isRecord(payload) || !isRecord(payload.evaluation))
    throw new Error('invalid-preview-response');
  const { values, conditions, charts } = payload.evaluation;
  if (!isRecord(values) || !isRecord(conditions) || !isRecord(charts)) {
    throw new Error('invalid-preview-response');
  }
  for (const value of Object.values(values)) {
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error('invalid-preview-value');
  }
  for (const value of Object.values(conditions)) {
    if (typeof value !== 'boolean') throw new Error('invalid-preview-condition');
  }
  for (const value of Object.values(charts)) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'number')) {
      throw new Error('invalid-preview-chart');
    }
  }
  return {
    values: values as Record<string, number>,
    conditions: conditions as Record<string, boolean>,
    charts: charts as Record<string, number[]>,
  };
}

function slugFor(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${base || 'widget'}-${crypto.randomUUID().slice(0, 8)}`;
}

function WidgetPreview({
  composition,
  evaluation,
}: {
  composition: WidgetComposition;
  evaluation: WidgetEvaluation;
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
                readOnly
                value={evaluation.values[input.id] ?? input.initial}
                className="w-32 rounded-md border bg-muted px-3 py-2"
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
        const values = evaluation.charts[node.id] ?? [];
        const maximum = Math.max(...values.map(Math.abs), 1);
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
                    style={{ width: `${(Math.abs(values[index] ?? 0) / maximum) * 100}%` }}
                  />
                </span>
                <span>{values[index] ?? 0}</span>
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

  return (
    <div className="space-y-4" dir={composition.direction}>
      {composition.rootNodeIds.map(renderNode)}
    </div>
  );
}

export function WidgetBuilderTab(): React.ReactElement {
  const { locale, t } = useI18n();
  const [request, setRequest] = useState('');
  const [composition, setComposition] = useState<WidgetComposition | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<WidgetEvaluation | null>(null);
  const [published, setPublished] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setAction('generate');
    setError(null);
    try {
      const response = await fetch('/api/admin/widget-templates/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ request, locale }),
      });
      if (!response.ok) throw new Error('generation-failed');
      const payload: unknown = await response.json();
      if (!isRecord(payload)) throw new Error('invalid-generation-response');
      setComposition(parseWidgetComposition(payload.composition));
      setVersionId(null);
      setEvaluation(null);
      setPublished(false);
    } catch {
      setError(t('admin.widgets.generationFailed'));
    } finally {
      setAction(null);
    }
  };

  const preview = async () => {
    if (!composition) return;
    setAction('preview');
    setError(null);
    try {
      const draftResponse = await fetch(
        templateId ? `/api/admin/widget-templates/${templateId}` : '/api/admin/widget-templates',
        {
          method: templateId ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...(templateId ? {} : { slug: slugFor(composition.title) }),
            title: composition.title,
            composition,
          }),
        },
      );
      if (!draftResponse.ok) throw new Error('draft-failed');
      const ids = requireResponseIds(await draftResponse.json());
      const previewResponse = await fetch(`/api/admin/widget-templates/${ids.templateId}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionId: ids.versionId }),
      });
      if (!previewResponse.ok) throw new Error('preview-failed');
      const nextEvaluation = requireEvaluation(await previewResponse.json());
      setTemplateId(ids.templateId);
      setVersionId(ids.versionId);
      setEvaluation(nextEvaluation);
      setPublished(false);
    } catch {
      setVersionId(null);
      setEvaluation(null);
      setError(t('admin.widgets.previewFailed'));
    } finally {
      setAction(null);
    }
  };

  const publish = async () => {
    if (!templateId || !versionId || !evaluation) return;
    setAction('publish');
    setError(null);
    try {
      const response = await fetch(`/api/admin/widget-templates/${templateId}/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionId }),
      });
      if (!response.ok) throw new Error('publication-failed');
      setPublished(true);
    } catch {
      setError(t('admin.widgets.publishFailed'));
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>{t('admin.widgets.builderTitle')}</h3>
          </CardTitle>
          <CardDescription>{t('admin.widgets.hint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-medium">{t('admin.widgets.description')}</span>
            <Textarea
              value={request}
              onChange={(event) => setRequest(event.target.value)}
              minLength={20}
              maxLength={4_000}
              rows={6}
              placeholder={t('admin.widgets.placeholder')}
            />
          </label>
          <Button onClick={generate} disabled={request.trim().length < 20 || action !== null}>
            {action === 'generate' ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {composition ? t('admin.widgets.regenerate') : t('admin.widgets.generate')}
          </Button>
        </CardContent>
      </Card>

      {composition && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h3>{composition.title}</h3>
            </CardTitle>
            <CardDescription>
              {t('admin.widgets.summary')
                .replace('{inputs}', String(composition.inputs.length))
                .replace('{computations}', String(composition.computations.length))
                .replace('{blocks}', String(composition.nodes.length))}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {evaluation ? (
              <WidgetPreview composition={composition} evaluation={evaluation} />
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                {t('admin.widgets.validationReady')}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={preview} disabled={action !== null}>
                {action === 'preview' ? <Loader2 className="animate-spin" /> : <Eye />}
                {t('admin.widgets.preview')}
              </Button>
              <Button
                onClick={publish}
                disabled={!evaluation || !versionId || action !== null || published}
              >
                {action === 'publish' ? <Loader2 className="animate-spin" /> : <Upload />}
                {t('admin.widgets.publish')}
              </Button>
            </div>
            {published && (
              <p
                className="flex items-center gap-2 text-sm font-medium text-emerald-700"
                role="status"
              >
                <CheckCircle2 className="h-4 w-4" />
                {t('admin.widgets.published')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
