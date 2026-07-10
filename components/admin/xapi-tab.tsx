'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Activity, CheckCircle2, XCircle, Loader2, Info, Send } from 'lucide-react';
import { toast } from 'sonner';

interface XAPIStatus {
  configured: boolean;
  endpoint: string | null;
}

export function XAPITab(): React.ReactElement {
  const { t } = useI18n();
  const [status, setStatus] = useState<XAPIStatus>({ configured: false, endpoint: null });
  const [sending, setSending] = useState(false);

  // Fetch xAPI status from server
  useEffect(() => {
    fetch('/api/xapi/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setStatus({
            configured: data.configured ?? false,
            endpoint: data.endpoint ?? null,
          });
        }
      })
      .catch(() => {
        // Endpoint not available yet — show as not configured
      });
  }, []);

  const handleSendTestStatement = async (): Promise<void> => {
    setSending(true);
    try {
      const res = await fetch('/api/xapi/test', { method: 'POST' });
      if (res.ok) {
        toast.success(t('admin.xapi.testSuccess'));
      } else {
        toast.error(t('admin.xapi.testFailed'));
      }
    } catch {
      toast.error(t('admin.xapi.testFailed'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Activity className="size-5" />
          {t('admin.xapi.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Info className="size-3.5 shrink-0" />
          {t('admin.xapi.configNote')}
        </p>
      </div>

      {/* Status Card */}
      <div className="rounded-lg border p-5">
        <div className="flex items-center gap-3 mb-4">
          {status.configured ? (
            <>
              <CheckCircle2 className="size-5 text-emerald-500" />
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {t('admin.xapi.configured')}
              </span>
            </>
          ) : (
            <>
              <XCircle className="size-5 text-muted-foreground" />
              <span className="font-medium text-muted-foreground">
                {t('admin.xapi.notConfigured')}
              </span>
            </>
          )}
        </div>

        {status.endpoint && (
          <div className="mb-4 p-3 rounded-lg bg-muted/30 border">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">
              {t('admin.xapi.endpoint')}
            </p>
            <code className="text-sm font-mono break-all">{status.endpoint}</code>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={!status.configured || sending}
          onClick={() => void handleSendTestStatement()}
        >
          {sending ? (
            <>
              <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              {t('admin.xapi.sending')}
            </>
          ) : (
            <>
              <Send className="size-3.5 mr-1.5" />
              {t('admin.xapi.sendTestStatement')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
