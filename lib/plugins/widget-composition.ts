import { z } from 'zod';

const MAX_EXPRESSION_DEPTH = 8;
const MAX_EXPRESSION_NODES = 256;
const identifierSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const finiteNumberSchema = z.number().finite();

export type NumericExpression =
  | { op: 'literal'; value: number }
  | { op: 'ref'; id: string }
  | { op: 'add' | 'multiply' | 'min' | 'max'; args: NumericExpression[] }
  | { op: 'subtract' | 'divide'; left: NumericExpression; right: NumericExpression }
  | { op: 'round'; value: NumericExpression; digits: number };

export const numericExpressionSchema: z.ZodType<NumericExpression> = z.lazy(() =>
  z.discriminatedUnion('op', [
    z.object({ op: z.literal('literal'), value: finiteNumberSchema }).strict(),
    z.object({ op: z.literal('ref'), id: identifierSchema }).strict(),
    z
      .object({
        op: z.enum(['add', 'multiply', 'min', 'max']),
        args: z.array(numericExpressionSchema).min(1).max(12),
      })
      .strict(),
    z
      .object({
        op: z.enum(['subtract', 'divide']),
        left: numericExpressionSchema,
        right: numericExpressionSchema,
      })
      .strict(),
    z
      .object({
        op: z.literal('round'),
        value: numericExpressionSchema,
        digits: z.number().int().min(0).max(6),
      })
      .strict(),
  ]),
);

const inputSchema = z
  .object({
    id: identifierSchema,
    label: z.string().trim().min(1).max(160),
    initial: finiteNumberSchema,
    min: finiteNumberSchema,
    max: finiteNumberSchema,
    step: finiteNumberSchema.positive(),
    unit: z.string().trim().max(32).optional(),
  })
  .strict();

const computationSchema = z
  .object({
    id: identifierSchema,
    label: z.string().trim().min(1).max(160),
    expression: numericExpressionSchema,
    unit: z.string().trim().max(32).optional(),
  })
  .strict();

const widgetNodeSchema = z.discriminatedUnion('type', [
  z
    .object({
      id: identifierSchema,
      type: z.literal('text'),
      text: z.string().trim().min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      id: identifierSchema,
      type: z.literal('number_input'),
      inputId: identifierSchema,
    })
    .strict(),
  z
    .object({
      id: identifierSchema,
      type: z.literal('computed_value'),
      computationId: identifierSchema,
    })
    .strict(),
  z
    .object({
      id: identifierSchema,
      type: z.literal('condition'),
      left: numericExpressionSchema,
      comparator: z.enum(['gt', 'gte', 'lt', 'lte', 'eq', 'neq']),
      right: numericExpressionSchema,
      whenTrue: z.string().trim().min(1).max(500),
      whenFalse: z.string().trim().min(1).max(500),
    })
    .strict(),
  z
    .object({
      id: identifierSchema,
      type: z.literal('table'),
      columns: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
      rows: z.array(z.array(z.string().trim().max(300)).max(8)).max(30),
    })
    .strict(),
  z
    .object({
      id: identifierSchema,
      type: z.literal('bar_chart'),
      bars: z
        .array(
          z
            .object({
              label: z.string().trim().min(1).max(120),
              value: numericExpressionSchema,
            })
            .strict(),
        )
        .min(1)
        .max(12),
    })
    .strict(),
  z
    .object({
      id: identifierSchema,
      type: z.literal('layout'),
      columns: z.union([z.literal(1), z.literal(2)]),
      children: z.array(identifierSchema).min(1).max(40),
    })
    .strict(),
]);

export const widgetCompositionSchema = z
  .object({
    version: z.literal(1),
    locale: z.enum(['fr-FR', 'ar-MA', 'en-US']),
    direction: z.enum(['ltr', 'rtl']),
    title: z.string().trim().min(1).max(200),
    inputs: z.array(inputSchema).max(20),
    computations: z.array(computationSchema).max(30),
    nodes: z.array(widgetNodeSchema).min(1).max(80),
    rootNodeIds: z.array(identifierSchema).min(1).max(20),
    goldenCases: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            inputs: z.record(identifierSchema, finiteNumberSchema),
            expected: z.record(identifierSchema, finiteNumberSchema),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export type WidgetComposition = z.infer<typeof widgetCompositionSchema>;

export interface WidgetEvaluation {
  values: Record<string, number>;
  conditions: Record<string, boolean>;
  charts: Record<string, number[]>;
}

export class WidgetCompositionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WidgetCompositionError';
  }
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new WidgetCompositionError(`Duplicate ${label} id: ${value}`);
    seen.add(value);
  }
}

function inspectExpression(
  expression: NumericExpression,
  validReferences: ReadonlySet<string>,
  state: { nodes: number },
  depth = 1,
): void {
  if (depth > MAX_EXPRESSION_DEPTH) {
    throw new WidgetCompositionError(`Expression depth exceeds ${MAX_EXPRESSION_DEPTH}`);
  }
  state.nodes += 1;
  if (state.nodes > MAX_EXPRESSION_NODES) {
    throw new WidgetCompositionError(`Expression node count exceeds ${MAX_EXPRESSION_NODES}`);
  }
  if (expression.op === 'ref') {
    if (!validReferences.has(expression.id)) {
      throw new WidgetCompositionError(`Unknown expression reference: ${expression.id}`);
    }
    return;
  }
  if (expression.op === 'literal') return;
  if (expression.op === 'round') {
    inspectExpression(expression.value, validReferences, state, depth + 1);
    return;
  }
  if ('left' in expression) {
    inspectExpression(expression.left, validReferences, state, depth + 1);
    inspectExpression(expression.right, validReferences, state, depth + 1);
    return;
  }
  for (const argument of expression.args) {
    inspectExpression(argument, validReferences, state, depth + 1);
  }
}

function assertLayoutAcyclic(
  nodeId: string,
  layouts: ReadonlyMap<string, string[]>,
  visiting: Set<string>,
  visited: Set<string>,
): void {
  if (visiting.has(nodeId)) throw new WidgetCompositionError(`Layout cycle detected at ${nodeId}`);
  if (visited.has(nodeId)) return;
  const children = layouts.get(nodeId);
  if (!children) return;
  visiting.add(nodeId);
  for (const child of children) assertLayoutAcyclic(child, layouts, visiting, visited);
  visiting.delete(nodeId);
  visited.add(nodeId);
}

function compare(left: number, comparator: string, right: number): boolean {
  switch (comparator) {
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    default:
      throw new WidgetCompositionError(`Unknown comparator: ${comparator}`);
  }
}

function evaluate(
  composition: WidgetComposition,
  overrides: Record<string, number>,
): WidgetEvaluation {
  const inputs = new Map(composition.inputs.map((input) => [input.id, input]));
  for (const id of Object.keys(overrides)) {
    if (!inputs.has(id)) throw new WidgetCompositionError(`Unknown input override: ${id}`);
  }

  const values: Record<string, number> = {};
  for (const input of composition.inputs) {
    const value = overrides[input.id] ?? input.initial;
    if (!Number.isFinite(value) || value < input.min || value > input.max) {
      throw new WidgetCompositionError(`Input ${input.id} is outside its declared bounds`);
    }
    values[input.id] = value;
  }

  const computations = new Map(
    composition.computations.map((computation) => [computation.id, computation]),
  );
  const visiting = new Set<string>();

  const resolve = (id: string): number => {
    if (Object.hasOwn(values, id)) return values[id];
    const computation = computations.get(id);
    if (!computation) throw new WidgetCompositionError(`Unknown expression reference: ${id}`);
    if (visiting.has(id)) throw new WidgetCompositionError(`Computation cycle detected at ${id}`);
    visiting.add(id);
    const value = evaluateExpression(computation.expression, resolve);
    visiting.delete(id);
    values[id] = value;
    return value;
  };

  for (const computation of composition.computations) resolve(computation.id);

  const conditions: Record<string, boolean> = {};
  const charts: Record<string, number[]> = {};
  for (const node of composition.nodes) {
    if (node.type === 'condition') {
      conditions[node.id] = compare(
        evaluateExpression(node.left, resolve),
        node.comparator,
        evaluateExpression(node.right, resolve),
      );
    } else if (node.type === 'bar_chart') {
      charts[node.id] = node.bars.map((bar) => evaluateExpression(bar.value, resolve));
    }
  }
  return { values, conditions, charts };
}

function evaluateExpression(
  expression: NumericExpression,
  resolve: (id: string) => number,
): number {
  let result: number;
  switch (expression.op) {
    case 'literal':
      result = expression.value;
      break;
    case 'ref':
      result = resolve(expression.id);
      break;
    case 'add':
      result = expression.args.reduce(
        (sum, argument) => sum + evaluateExpression(argument, resolve),
        0,
      );
      break;
    case 'multiply':
      result = expression.args.reduce(
        (product, argument) => product * evaluateExpression(argument, resolve),
        1,
      );
      break;
    case 'min':
      result = Math.min(
        ...expression.args.map((argument) => evaluateExpression(argument, resolve)),
      );
      break;
    case 'max':
      result = Math.max(
        ...expression.args.map((argument) => evaluateExpression(argument, resolve)),
      );
      break;
    case 'subtract':
      result =
        evaluateExpression(expression.left, resolve) -
        evaluateExpression(expression.right, resolve);
      break;
    case 'divide': {
      const divisor = evaluateExpression(expression.right, resolve);
      if (divisor === 0) throw new WidgetCompositionError('Division by zero');
      result = evaluateExpression(expression.left, resolve) / divisor;
      break;
    }
    case 'round': {
      const factor = 10 ** expression.digits;
      result = Math.round(evaluateExpression(expression.value, resolve) * factor) / factor;
      break;
    }
  }
  if (!Number.isFinite(result)) throw new WidgetCompositionError('Expression result is not finite');
  return result;
}

function validateSemantics(composition: WidgetComposition): void {
  assertUnique(
    [...composition.inputs, ...composition.computations].map((item) => item.id),
    'value',
  );
  assertUnique(
    composition.nodes.map((node) => node.id),
    'node',
  );

  for (const input of composition.inputs) {
    if (input.min > input.max || input.initial < input.min || input.initial > input.max) {
      throw new WidgetCompositionError(`Input ${input.id} has inconsistent bounds`);
    }
  }

  const valueIds = new Set(
    [...composition.inputs, ...composition.computations].map((item) => item.id),
  );
  const expressionState = { nodes: 0 };
  for (const computation of composition.computations) {
    inspectExpression(computation.expression, valueIds, expressionState);
  }

  const nodeIds = new Set(composition.nodes.map((node) => node.id));
  const inputIds = new Set(composition.inputs.map((input) => input.id));
  const computationIds = new Set(composition.computations.map((computation) => computation.id));
  const layouts = new Map<string, string[]>();
  for (const node of composition.nodes) {
    if (node.type === 'number_input' && !inputIds.has(node.inputId)) {
      throw new WidgetCompositionError(`Unknown input reference: ${node.inputId}`);
    }
    if (node.type === 'computed_value' && !computationIds.has(node.computationId)) {
      throw new WidgetCompositionError(`Unknown computation reference: ${node.computationId}`);
    }
    if (node.type === 'condition') {
      inspectExpression(node.left, valueIds, expressionState);
      inspectExpression(node.right, valueIds, expressionState);
    }
    if (node.type === 'bar_chart') {
      for (const bar of node.bars) inspectExpression(bar.value, valueIds, expressionState);
    }
    if (node.type === 'table') {
      for (const row of node.rows) {
        if (row.length !== node.columns.length) {
          throw new WidgetCompositionError(`Table ${node.id} row width does not match its columns`);
        }
      }
    }
    if (node.type === 'layout') {
      for (const child of node.children) {
        if (!nodeIds.has(child)) throw new WidgetCompositionError(`Unknown layout child: ${child}`);
      }
      layouts.set(node.id, node.children);
    }
  }
  for (const root of composition.rootNodeIds) {
    if (!nodeIds.has(root)) throw new WidgetCompositionError(`Unknown root node: ${root}`);
  }
  for (const layout of layouts.keys()) {
    assertLayoutAcyclic(layout, layouts, new Set(), new Set());
  }

  // Resolving defaults proves computation acyclicity before a draft can be previewed.
  evaluate(composition, {});
}

function validateGoldenCases(composition: WidgetComposition): void {
  for (const goldenCase of composition.goldenCases) {
    const result = evaluate(composition, goldenCase.inputs);
    for (const [id, expected] of Object.entries(goldenCase.expected)) {
      const actual = result.values[id];
      if (actual === undefined || Math.abs(actual - expected) > 1e-9) {
        throw new WidgetCompositionError(
          `Golden case "${goldenCase.name}" failed for ${id}: expected ${expected}, received ${String(actual)}`,
        );
      }
    }
  }
}

export function parseWidgetComposition(value: unknown): WidgetComposition {
  const result = widgetCompositionSchema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`)
      .join('; ');
    throw new WidgetCompositionError(`Invalid widget composition: ${details}`);
  }
  const composition = result.data;
  const expectedDirection = composition.locale === 'ar-MA' ? 'rtl' : 'ltr';
  if (composition.direction !== expectedDirection) {
    throw new WidgetCompositionError(
      `Direction ${composition.direction} contradicts locale ${composition.locale}`,
    );
  }
  validateSemantics(composition);
  validateGoldenCases(composition);
  return composition;
}

export function evaluateWidgetComposition(
  composition: WidgetComposition,
  inputs: Record<string, number> = {},
): WidgetEvaluation {
  return evaluate(composition, inputs);
}
