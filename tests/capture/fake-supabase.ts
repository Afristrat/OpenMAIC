/**
 * Faux client Supabase en mémoire pour les tests des routes de capture.
 *
 * Il exécute vraiment les filtres utilisés par les routes (eq, neq, is, gt), les insertions, les
 * mises à jour et la contrainte d'unicité (session_id, position) : un test échoue si la route
 * oublie un filtre, au lieu de passer sur un mock qui répond toujours pareil.
 */

import { randomUUID } from 'node:crypto';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type Result = {
  data: Row | Row[] | null;
  error: { code?: string; message: string } | null;
  count?: number | null;
};

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

/** Valeurs par défaut posées par la base (migration 00060) quand la route ne les fournit pas. */
const DEFAULTS: Record<string, Row> = {
  capture_sessions: { status: 'receiving', step_count: 0 },
  capture_steps: { review: 'pending' },
};

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables = new Map<string, Row[]>(
    Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))]),
  );
  const uploads: Array<{ path: string; size: number; contentType?: string }> = [];
  const removed: string[] = [];

  const rows = (name: string): Row[] => {
    let table = tables.get(name);
    if (!table) {
      table = [];
      tables.set(name, table);
    }
    return table;
  };

  function builder(name: string) {
    const filters: Filter[] = [];
    let op: 'select' | 'insert' | 'update' = 'select';
    let payload: Row = {};
    let head = false;
    let wantCount = false;
    let single: 'none' | 'maybe' | 'one' = 'none';
    let returning = false;

    const run = (): Result => {
      const table = rows(name);
      const matches = () => table.filter((row) => filters.every((f) => f(row)));
      if (op === 'insert') {
        if (
          name === 'capture_steps' &&
          table.some(
            (row) => row.session_id === payload.session_id && row.position === payload.position,
          )
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        const row: Row = {
          id: randomUUID(),
          created_at: new Date().toISOString(),
          ...DEFAULTS[name],
          ...payload,
        };
        table.push(row);
        return finish([row]);
      }
      if (op === 'update') {
        const hit = matches();
        for (const row of hit) Object.assign(row, payload);
        return returning ? finish(hit) : { data: null, error: null };
      }
      return finish(matches());
    };

    const finish = (hit: Row[]): Result => {
      if (wantCount && head) return { data: null, error: null, count: hit.length };
      if (single === 'none') return { data: hit, error: null, count: hit.length };
      if (single === 'one' && hit.length !== 1) {
        return { data: null, error: { message: 'expected exactly one row' } };
      }
      return { data: hit[0] ?? null, error: null };
    };

    const api = {
      select(_columns?: string, options?: { count?: string; head?: boolean }) {
        if (op !== 'select') returning = true;
        wantCount = options?.count === 'exact';
        head = options?.head === true;
        return api;
      },
      insert(value: Row) {
        op = 'insert';
        payload = value;
        return api;
      },
      update(value: Row) {
        op = 'update';
        payload = value;
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return api;
      },
      neq(column: string, value: unknown) {
        filters.push((row) => row[column] !== value);
        return api;
      },
      is(column: string, value: null) {
        filters.push((row) => (row[column] ?? null) === value);
        return api;
      },
      gt(column: string, value: string) {
        filters.push((row) => String(row[column] ?? '') > value);
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      maybeSingle() {
        single = 'maybe';
        return api;
      },
      single() {
        single = 'one';
        return api;
      },
      then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
        try {
          return Promise.resolve(run()).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    };
    return api;
  }

  return {
    from: (name: string) => builder(name),
    storage: {
      from: (_bucket: string) => ({
        upload: async (path: string, body: Buffer, options?: { contentType?: string }) => {
          uploads.push({ path, size: body.length, contentType: options?.contentType });
          return { data: { path }, error: null };
        },
        remove: async (paths: string[]) => {
          removed.push(...paths);
          return { data: null, error: null };
        },
      }),
    },
    table: (name: string): Row[] => rows(name),
    uploads,
    removed,
  };
}
