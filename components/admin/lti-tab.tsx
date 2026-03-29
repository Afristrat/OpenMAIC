'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/hooks/use-i18n';
import { KeyRound, Copy, Check, Plus, X, Info, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

interface LTIPlatform {
  id: string;
  clientId: string;
  issuer: string;
  jwksUrl: string;
  authUrl: string;
  tokenUrl: string;
  deploymentId: string;
}

const EMPTY_PLATFORM: Omit<LTIPlatform, 'id'> = {
  clientId: '',
  issuer: '',
  jwksUrl: '',
  authUrl: '',
  tokenUrl: '',
  deploymentId: '',
};

export function LTITab(): React.ReactElement {
  const { t } = useI18n();
  const [ltiConfig, setLtiConfig] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<LTIPlatform[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY_PLATFORM);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const jwksUrl = `${baseUrl}/api/lti/jwks`;
  const launchUrl = `${baseUrl}/api/lti/launch`;

  // Fetch LTI config
  useEffect(() => {
    fetch('/api/lti/config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setLtiConfig(JSON.stringify(data, null, 2));
      })
      .catch(() => {
        // Config endpoint not available yet
        setLtiConfig(JSON.stringify({ tool_name: 'Qalem', description: 'AI Interactive Classroom' }, null, 2));
      });
  }, []);

  // Fetch registered platforms
  useEffect(() => {
    fetch('/api/lti/platforms')
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setPlatforms(data);
      })
      .catch(() => {
        // Endpoint not available yet
      });
  }, []);

  const handleCopy = async (text: string, field: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(t('admin.lti.copied'));
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const handleAddPlatform = (): void => {
    if (!formData.clientId.trim() || !formData.issuer.trim()) return;
    const newPlatform: LTIPlatform = {
      id: `platform-${Date.now()}`,
      ...formData,
    };
    setPlatforms((prev) => [...prev, newPlatform]);
    setFormData(EMPTY_PLATFORM);
    setShowForm(false);
    // In production, this would POST to /api/lti/platforms
  };

  const renderCopyButton = (text: string, field: string): React.ReactElement => (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 shrink-0"
      onClick={() => void handleCopy(text, field)}
    >
      {copiedField === field ? (
        <Check className="size-3.5 text-emerald-500" />
      ) : (
        <Copy className="size-3.5" />
      )}
      <span className="ml-1 text-xs">{copiedField === field ? t('admin.lti.copied') : t('admin.lti.copy')}</span>
    </Button>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <KeyRound className="size-5" />
          {t('admin.lti.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Info className="size-3.5 shrink-0" />
          {t('admin.lti.instructions')}
        </p>
      </div>

      {/* URLs */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">{t('admin.lti.jwksUrl')}</p>
            <code className="text-sm font-mono break-all">{jwksUrl}</code>
          </div>
          {renderCopyButton(jwksUrl, 'jwks')}
        </div>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30 border">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground mb-0.5">{t('admin.lti.launchUrl')}</p>
            <code className="text-sm font-mono break-all">{launchUrl}</code>
          </div>
          {renderCopyButton(launchUrl, 'launch')}
        </div>
      </div>

      {/* Configuration JSON */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">{t('admin.lti.configuration')}</h3>
          {ltiConfig && renderCopyButton(ltiConfig, 'config')}
        </div>
        <pre className="rounded-lg bg-muted/50 border p-4 text-xs font-mono overflow-x-auto max-h-60">
          {ltiConfig ?? '...'}
        </pre>
      </div>

      {/* Registered Platforms */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">{t('admin.lti.platforms')}</h3>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? (
              <>
                <X className="size-3 mr-1" />
                {t('admin.lti.cancel')}
              </>
            ) : (
              <>
                <Plus className="size-3 mr-1" />
                {t('admin.lti.addPlatform')}
              </>
            )}
          </Button>
        </div>

        {/* Add Platform Form */}
        {showForm && (
          <div className="rounded-lg border p-4 mb-4 space-y-3 bg-muted/10">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('admin.lti.clientId')}</label>
                <Input
                  value={formData.clientId}
                  onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                  className="h-8 mt-1 text-sm"
                  placeholder="e.g. 10000000000001"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('admin.lti.issuer')}</label>
                <Input
                  value={formData.issuer}
                  onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
                  className="h-8 mt-1 text-sm"
                  placeholder="e.g. https://canvas.instructure.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('admin.lti.jwksUrlField')}</label>
                <Input
                  value={formData.jwksUrl}
                  onChange={(e) => setFormData({ ...formData, jwksUrl: e.target.value })}
                  className="h-8 mt-1 text-sm"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('admin.lti.authUrl')}</label>
                <Input
                  value={formData.authUrl}
                  onChange={(e) => setFormData({ ...formData, authUrl: e.target.value })}
                  className="h-8 mt-1 text-sm"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('admin.lti.tokenUrl')}</label>
                <Input
                  value={formData.tokenUrl}
                  onChange={(e) => setFormData({ ...formData, tokenUrl: e.target.value })}
                  className="h-8 mt-1 text-sm"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">{t('admin.lti.deploymentId')}</label>
                <Input
                  value={formData.deploymentId}
                  onChange={(e) => setFormData({ ...formData, deploymentId: e.target.value })}
                  className="h-8 mt-1 text-sm"
                  placeholder="e.g. 1"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" className="h-7 text-xs" onClick={handleAddPlatform}>
                {t('admin.lti.save')}
              </Button>
            </div>
          </div>
        )}

        {/* Platform List */}
        {platforms.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t('admin.lti.noPlatforms')}
          </div>
        ) : (
          <div className="rounded-lg border divide-y">
            {platforms.map((platform) => (
              <div key={platform.id} className="p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                  <span className="font-medium text-sm">{platform.issuer}</span>
                  <span className="text-xs text-muted-foreground">({platform.clientId})</span>
                </div>
                <p className="text-xs text-muted-foreground pl-5.5">
                  Deployment: {platform.deploymentId}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
