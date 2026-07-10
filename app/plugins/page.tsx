'use client';

import { useState, useEffect, useCallback } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Puzzle, X, Code, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ───────────────────────────────────────────────────────────

interface PluginData {
  id: string;
  type: string;
  name: string;
  description: string;
  version: string;
  author: string;
  icon: string;
  displayType: string;
  renderUrl: string;
  width?: number;
  height?: number;
  supportedActions: string[];
}

// ── Icon helper ─────────────────────────────────────────────────────

function PluginIcon({ icon, className }: { icon: string; className?: string }): React.ReactElement {
  if (icon === 'Code') return <Code className={className} />;
  if (icon === 'FlaskConical') return <FlaskConical className={className} />;
  return <Puzzle className={className} />;
}

// ── Component ───────────────────────────────────────────────────────

export default function PluginsPage(): React.ReactElement {
  const { t, locale } = useI18n();

  const [plugins, setPlugins] = useState<PluginData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePlugin, setActivePlugin] = useState<PluginData | null>(null);

  const fetchPlugins = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/plugins?locale=${locale}`);
      const json = (await res.json()) as { success: boolean; plugins: PluginData[] };
      if (json.success) {
        setPlugins(json.plugins);
      }
    } catch {
      // silent fail
    } finally {
      setIsLoading(false);
    }
  }, [locale]);

  /* eslint-disable react-hooks/set-state-in-effect -- Async data loading on locale change */
  useEffect(() => {
    void fetchPlugins();
  }, [fetchPlugins]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const openPlugin = (plugin: PluginData): void => {
    setActivePlugin(plugin);
  };

  const closePlugin = (): void => {
    setActivePlugin(null);
  };

  // Close overlay on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && activePlugin) {
        closePlugin();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [activePlugin]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Puzzle className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold">{t('plugins.title')}</h1>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && plugins.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Puzzle className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">Aucun plugin disponible</p>
        </div>
      )}

      {/* Plugin Grid */}
      {!isLoading && plugins.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2">
          {plugins.map((plugin) => {
            const isCode = plugin.type.includes('code');

            return (
              <div
                key={plugin.id}
                className="group rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
              >
                {/* Top: icon + name */}
                <div className="mb-3 flex items-start gap-3">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                      isCode
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                        : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
                    )}
                  >
                    <PluginIcon icon={plugin.icon} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold leading-tight">{plugin.name}</h2>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge
                        className={cn(
                          'text-[10px]',
                          isCode
                            ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300'
                            : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
                        )}
                      >
                        {plugin.displayType}
                      </Badge>
                      <span className="text-xs text-muted-foreground">v{plugin.version}</span>
                      <span className="text-xs text-muted-foreground">
                        &mdash; {plugin.author}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="mb-4 text-sm text-muted-foreground">{plugin.description}</p>

                {/* Actions list */}
                {plugin.supportedActions.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1">
                    {plugin.supportedActions.map((action) => (
                      <Badge key={action} variant="outline" className="text-[10px]">
                        {action}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Preview area */}
                <div className="mb-4 overflow-hidden rounded-lg border bg-muted/30">
                  <div className="flex h-[200px] items-center justify-center">
                    <div className="text-center">
                      <PluginIcon
                        icon={plugin.icon}
                        className="mx-auto mb-2 h-10 w-10 text-muted-foreground/30"
                      />
                      <p className="text-xs text-muted-foreground/50">{plugin.name}</p>
                    </div>
                  </div>
                </div>

                {/* Try button */}
                <Button
                  variant="default"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => openPlugin(plugin)}
                >
                  <PluginIcon icon={plugin.icon} className="h-4 w-4" />
                  {t('plugins.try')}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Full-page plugin overlay */}
      {activePlugin && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {/* Overlay header */}
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-3">
              <PluginIcon icon={activePlugin.icon} className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{activePlugin.name}</h2>
              <Badge variant="secondary" className="text-xs">
                {activePlugin.displayType}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="gap-1" onClick={closePlugin}>
              <X className="h-4 w-4" />
              {t('plugins.close')}
            </Button>
          </div>

          {/* Iframe */}
          <div className="flex-1">
            <iframe
              src={activePlugin.renderUrl}
              title={activePlugin.name}
              className="h-full w-full border-0"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}
    </div>
  );
}
