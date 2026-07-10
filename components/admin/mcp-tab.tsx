'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Server, Wifi, WifiOff, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';

// Mock data based on mcp-servers.yml.example
const EXAMPLE_SERVERS = [
  {
    id: 'notebooklm',
    name: 'NotebookLM',
    url: 'http://localhost:3001/mcp',
    enabled: false,
    status: 'disabled' as const,
  },
  {
    id: 'notion',
    name: 'Notion',
    url: 'http://localhost:3002/mcp',
    enabled: false,
    status: 'disabled' as const,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    url: 'http://localhost:3003/mcp',
    enabled: false,
    status: 'disabled' as const,
  },
];

type ServerStatus = 'connected' | 'error' | 'disabled';

interface MCPServer {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  status: ServerStatus;
}

function StatusBadge({ status, t }: { status: ServerStatus; t: (key: string) => string }): React.ReactElement {
  const variants: Record<ServerStatus, { className: string; label: string }> = {
    connected: {
      className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      label: t('admin.mcp.connected'),
    },
    error: {
      className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      label: t('admin.mcp.error'),
    },
    disabled: {
      className: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
      label: t('admin.mcp.disabled'),
    },
  };

  const v = variants[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${v.className}`}>
      {status === 'connected' && <Wifi className="size-3" />}
      {status === 'error' && <WifiOff className="size-3" />}
      {v.label}
    </span>
  );
}

export function MCPTab(): React.ReactElement {
  const { t } = useI18n();
  const [servers] = useState<MCPServer[]>(EXAMPLE_SERVERS);
  const [testingId, setTestingId] = useState<string | null>(null);

  const handleTestConnection = async (serverId: string): Promise<void> => {
    setTestingId(serverId);
    // Simulate a connection test
    await new Promise((resolve) => setTimeout(resolve, 1500));
    toast.error(t('admin.mcp.testFailed'));
    setTestingId(null);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Server className="size-5" />
          {t('admin.mcp.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Info className="size-3.5 shrink-0" />
          {t('admin.mcp.configNote')}
        </p>
      </div>

      {servers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          {t('admin.mcp.noServers')}
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1.5fr_auto_auto] gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30">
            <span>{t('admin.mcp.serverName')}</span>
            <span>{t('admin.mcp.serverUrl')}</span>
            <span>{t('admin.mcp.status')}</span>
            <span className="w-32" />
          </div>

          {/* Rows */}
          {servers.map((server) => (
            <div
              key={server.id}
              className="grid grid-cols-[1fr_1.5fr_auto_auto] gap-4 px-4 py-3 items-center"
            >
              <span className="font-medium text-sm">{server.name}</span>
              <code className="text-xs text-muted-foreground font-mono truncate">
                {server.url}
              </code>
              <StatusBadge status={server.status} t={t} />
              <div className="w-32 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={testingId !== null}
                  onClick={() => void handleTestConnection(server.id)}
                >
                  {testingId === server.id ? (
                    <>
                      <Loader2 className="size-3 mr-1 animate-spin" />
                      {t('admin.mcp.testing')}
                    </>
                  ) : (
                    t('admin.mcp.testConnection')
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
