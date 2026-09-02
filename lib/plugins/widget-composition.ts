export interface WidgetComposition {
  direction: 'ltr' | 'rtl';
}

export function parseWidgetComposition(_value: unknown): WidgetComposition {
  throw new Error('Widget composition grammar is not implemented');
}

export function evaluateWidgetComposition(
  _composition: WidgetComposition,
  _inputs: Record<string, number> = {},
): unknown {
  throw new Error('Widget composition evaluator is not implemented');
}
