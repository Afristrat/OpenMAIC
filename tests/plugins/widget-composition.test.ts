import { describe, expect, it } from 'vitest';
import {
  evaluateWidgetComposition,
  parseWidgetComposition,
} from '@/lib/plugins/widget-composition';

const marginComposition = {
  version: 1,
  locale: 'fr-FR',
  direction: 'ltr',
  title: 'Simulateur de marge',
  inputs: [
    {
      id: 'revenue',
      label: 'Revenus',
      initial: 100,
      min: 0,
      max: 1_000,
      step: 10,
      unit: 'MAD',
    },
    {
      id: 'costs',
      label: 'Charges',
      initial: 60,
      min: 0,
      max: 1_000,
      step: 10,
      unit: 'MAD',
    },
  ],
  computations: [
    {
      id: 'profit',
      label: 'Marge',
      expression: {
        op: 'subtract',
        left: { op: 'ref', id: 'revenue' },
        right: { op: 'ref', id: 'costs' },
      },
      unit: 'MAD',
    },
  ],
  nodes: [
    { id: 'intro', type: 'text', text: 'Faites varier les hypothèses.' },
    { id: 'revenue-control', type: 'number_input', inputId: 'revenue' },
    { id: 'costs-control', type: 'number_input', inputId: 'costs' },
    { id: 'profit-value', type: 'computed_value', computationId: 'profit' },
    {
      id: 'profit-alert',
      type: 'condition',
      left: { op: 'ref', id: 'profit' },
      comparator: 'gte',
      right: { op: 'literal', value: 0 },
      whenTrue: 'Marge positive',
      whenFalse: 'Marge négative',
    },
    {
      id: 'assumptions',
      type: 'table',
      columns: ['Hypothèse', 'Unité'],
      rows: [
        ['Revenus', 'MAD'],
        ['Charges', 'MAD'],
      ],
    },
    {
      id: 'margin-bars',
      type: 'bar_chart',
      bars: [
        { label: 'Marge', value: { op: 'ref', id: 'profit' } },
        { label: 'Charges', value: { op: 'ref', id: 'costs' } },
      ],
    },
    {
      id: 'main-layout',
      type: 'layout',
      columns: 2,
      children: [
        'intro',
        'revenue-control',
        'costs-control',
        'profit-value',
        'profit-alert',
        'assumptions',
        'margin-bars',
      ],
    },
  ],
  rootNodeIds: ['main-layout'],
  goldenCases: [
    {
      name: 'marge nominale',
      inputs: { revenue: 100, costs: 60 },
      expected: { profit: 40 },
    },
  ],
};

describe('widget composition grammar', () => {
  it('parses every v1 brick and evaluates a French literal reference case', () => {
    const composition = parseWidgetComposition(marginComposition);

    expect(evaluateWidgetComposition(composition, { revenue: 120, costs: 70 })).toEqual({
      values: { revenue: 120, costs: 70, profit: 50 },
      conditions: { 'profit-alert': true },
      charts: { 'margin-bars': [50, 70] },
    });
  });

  it('accepts an Arabic RTL composition and rejects a contradictory direction', () => {
    const arabic = {
      ...marginComposition,
      locale: 'ar-MA',
      direction: 'rtl',
      title: 'محاكي الهامش',
      nodes: [{ id: 'intro-ar', type: 'text', text: 'غيّر الفرضيات.' }],
      rootNodeIds: ['intro-ar'],
    };

    expect(parseWidgetComposition(arabic).direction).toBe('rtl');
    expect(() => parseWidgetComposition({ ...arabic, direction: 'ltr' })).toThrow();
  });

  it('rejects executable payloads and undeclared bricks instead of preserving them', () => {
    expect(() =>
      parseWidgetComposition({
        ...marginComposition,
        html: '<script>alert(1)</script>',
      }),
    ).toThrow();
    expect(() =>
      parseWidgetComposition({
        ...marginComposition,
        nodes: [{ id: 'video', type: 'video', src: 'javascript:alert(1)' }],
        rootNodeIds: ['video'],
      }),
    ).toThrow();
  });

  it('rejects dangling references and cyclic computations', () => {
    expect(() =>
      parseWidgetComposition({
        ...marginComposition,
        computations: [
          {
            id: 'profit',
            label: 'Marge',
            expression: { op: 'ref', id: 'missing' },
          },
        ],
      }),
    ).toThrow(/missing/);

    expect(() =>
      parseWidgetComposition({
        ...marginComposition,
        computations: [
          { id: 'a', label: 'A', expression: { op: 'ref', id: 'b' } },
          { id: 'b', label: 'B', expression: { op: 'ref', id: 'a' } },
        ],
        nodes: [{ id: 'cycle-label', type: 'text', text: 'Cycle' }],
        rootNodeIds: ['cycle-label'],
      }),
    ).toThrow(/cycle/i);
  });

  it('rejects expressions deeper than eight levels and more than eighty nodes', () => {
    let expression: Record<string, unknown> = { op: 'literal', value: 1 };
    for (let level = 0; level < 9; level += 1) {
      expression = { op: 'round', value: expression, digits: 0 };
    }
    expect(() =>
      parseWidgetComposition({
        ...marginComposition,
        computations: [{ id: 'too-deep', label: 'Trop profond', expression }],
      }),
    ).toThrow(/depth/i);

    const nodes = Array.from({ length: 81 }, (_, index) => ({
      id: `text-${index}`,
      type: 'text',
      text: String(index),
    }));
    expect(() =>
      parseWidgetComposition({
        ...marginComposition,
        nodes,
        rootNodeIds: nodes.map((node) => node.id),
      }),
    ).toThrow();
  });

  it('refuses publication data whose literal golden result is false', () => {
    expect(() =>
      parseWidgetComposition({
        ...marginComposition,
        goldenCases: [
          {
            name: 'résultat falsifié',
            inputs: { revenue: 100, costs: 60 },
            expected: { profit: 41 },
          },
        ],
      }),
    ).toThrow(/golden/i);
  });
});
