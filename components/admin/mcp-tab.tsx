'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Server, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';

const healthSchema = z.object({
  success: z.literal(true),
  servers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    status: z.enum(['connected', 'error']),
    toolCount: z.number().int().nonnegative(),
  })),
});

export function MCPTab(): React.ReactElement {
  const { t } = useI18n();
  const [servers, setServers] = useState<z.infer<typeof healthSchema>['servers']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'forbidden' | 'testFailed' | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load(): Promise<void> {
      try {
        const response = await fetch('/api/admin/mcp', {
          cache: 'no-store', signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          setError('forbidden');
          return;
        }
        if (!response.ok) throw new Error('MCP health unavailable');
        const data = healthSchema.parse(await response.json());
        if (!controller.signal.aborted) setServers(data.servers);
      } catch {
        if (!controller.signal.aborted) setError('testFailed');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  return (
    <div className="space-y-6 max-w-3xl" aria-busy={loading}>
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Server className="size-5" />{t('admin.mcp.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Info className="size-3.5 shrink-0" />{t('admin.mcp.configNote')}
        </p>
      </div>
      <Button variant="outline" disabled={loading} onClick={() => {
        setLoading(true);
        setError(null);
        setServers([]);
        setRevision((value) => value + 1);
      }}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        {t(loading ? 'admin.mcp.testing' : 'admin.mcp.testConnection')}
      </Button>
      {error ? <p role="alert">{t(`admin.mcp.${error}`)}</p> : loading ? (
        <p role="status">{t('admin.mcp.testing')}</p>
      ) : servers.length === 0 ? (
        <p role="status" className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {t('admin.mcp.noServers')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm text-start">
            <caption className="sr-only">{t('admin.mcp.title')}</caption>
            <thead className="bg-muted/30"><tr>
              <th scope="col" className="p-3 text-start">{t('admin.mcp.serverName')}</th>
              <th scope="col" className="p-3 text-start">{t('admin.mcp.status')}</th>
              <th scope="col" className="p-3 text-start">{t('admin.mcp.toolCount')}</th>
            </tr></thead>
            <tbody>{servers.map((server) => (
              <tr key={server.id} className="border-t">
                <th scope="row" className="p-3 text-start font-medium">{server.name}</th>
                <td className="p-3">{t(`admin.mcp.${server.status}`)}</td>
                <td className="p-3">{server.toolCount}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
