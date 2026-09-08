/**
 * Publish Agent Dialog
 * Allows users to publish a custom agent to the marketplace
 * with tags and a public description.
 */

'use client';

import { useState, useCallback, useRef, useId } from 'react';
import { marketplaceDraftSchema } from '@/lib/marketplace/draft-schema';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import type { AgentConfig } from '@/lib/orchestration/registry/types';

interface PublishAgentDialogProps {
  agent: AgentConfig;
  orgId: string;
  onPublished: () => void;
}

export function PublishAgentDialog({ agent, orgId, onPublished }: PublishAgentDialogProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [description, setDescription] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const attempt = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const fieldId = useId();

  const handleSubmit = useCallback(async () => {
    setIsPublishing(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      // Strip local metadata, but validate every shared field including nested voice data.
      const configuration = marketplaceDraftSchema.shape.agent.strip().parse(agent);
      const fingerprint = JSON.stringify({ orgId, configuration });
      if (attempt.current?.fingerprint !== fingerprint) {
        attempt.current = { fingerprint, requestId: crypto.randomUUID() };
      }
      const draftResponse = await fetch('/api/marketplace/agents/drafts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, requestId: attempt.current.requestId, agent: configuration }),
      });
      const draft = await draftResponse.json();
      if (!draftResponse.ok || draft.success !== true || typeof draft.agentId !== 'string') {
        throw new Error('Private snapshot not confirmed');
      }

      const res = await fetch('/api/marketplace/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: draft.agentId,
          isPublished: true,
          tags,
          description: description.trim() || null,
        }),
      });

      const json = await res.json();

      if (res.ok && json.success === true && json.published === true && json.agentId === draft.agentId) {
        toast.success(t('marketplace.published'));
        setOpen(false);
        setTagsInput('');
        setDescription('');
        attempt.current = null;
        onPublished();
      } else {
        toast.error(t('marketplace.ownedError'));
      }
    } catch {
      toast.error(t('marketplace.ownedError'));
    } finally {
      setIsPublishing(false);
    }
  }, [agent, orgId, onPublished, tagsInput, description, t]);

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!isPublishing) setOpen(value); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Upload className="h-3 w-3" />
          {t('marketplace.publish')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('marketplace.publishDialog')}</DialogTitle>
          <DialogDescription>{t('marketplace.publishDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-tags`}>{t('marketplace.tags')}</Label>
            <Input
              id={`${fieldId}-tags`}
              placeholder={t('marketplace.tagsPlaceholder')}
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${fieldId}-description`}>{t('marketplace.publicDescription')}</Label>
            <Textarea
              id={`${fieldId}-description`}
              maxLength={4000}
              placeholder={t('marketplace.publicDescriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={isPublishing} onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPublishing}>
            {isPublishing ? t('marketplace.publishing') : t('marketplace.submitPublish')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
