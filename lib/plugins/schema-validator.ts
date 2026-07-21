export interface PluginDataValidation {
  valid: boolean;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaTypeMatches(value: unknown, type: unknown): boolean {
  switch (type) {
    case 'object':
      return isRecord(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

function validateNode(
  value: unknown,
  schema: Record<string, unknown>,
  path: string,
): string | null {
  if (!schemaTypeMatches(value, schema.type)) {
    return `${path} must be ${String(schema.type)}`;
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => candidate === value)) {
    return `${path} must be one of the declared enum values`;
  }

  if (schema.type === 'object' && isRecord(value)) {
    const required = Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === 'string')
      : [];
    for (const key of required) {
      if (!(key in value)) return `${path}.${key} is required`;
    }

    const properties = isRecord(schema.properties) ? schema.properties : {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (!(key in value) || !isRecord(childSchema)) continue;
      const error = validateNode(value[key], childSchema, `${path}.${key}`);
      if (error) return error;
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && isRecord(schema.items)) {
    for (let index = 0; index < value.length; index += 1) {
      const error = validateNode(value[index], schema.items, `${path}[${index}]`);
      if (error) return error;
    }
  }

  return null;
}

export function validatePluginData(
  value: unknown,
  schema: Record<string, unknown>,
): PluginDataValidation {
  const error = validateNode(value, schema, '$');
  return error ? { valid: false, error } : { valid: true };
}
