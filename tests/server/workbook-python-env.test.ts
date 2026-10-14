import { describe, expect, it } from 'vitest';
import { buildPythonEnv } from '@/lib/server/workbook-python';

describe('buildPythonEnv', () => {
  it('ne transmet que la liste blanche, jamais les secrets', () => {
    const env = buildPythonEnv({
      PATH: '/usr/bin',
      LANG: 'fr_FR.UTF-8',
      PYTHONPATH: '/opt/py',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      OPENAI_API_KEY: 'secret',
      MCP_API_KEY: 'secret',
    });
    expect(env).toEqual({
      PATH: '/usr/bin',
      LANG: 'fr_FR.UTF-8',
      PYTHONPATH: '/opt/py',
      PYTHONUTF8: '1',
      PYTHONIOENCODING: 'utf-8',
    });
  });

  it('ne duplique pas PATH/Path', () => {
    const env = buildPythonEnv({ PATH: 'a', Path: 'a' });
    expect(Object.keys(env).filter((k) => k.toUpperCase() === 'PATH')).toHaveLength(1);
  });
});
