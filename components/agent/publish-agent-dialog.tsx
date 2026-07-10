/**
 * Publish Agent Dialog
 * Allows users to publish a custom agent to the marketplace
 * with tags and a public description.
 */

'use client';

import { useState, useCallback } from 'react';
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
}

export function PublishAgentDialog({ agent }: PublishAgentDialogProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const [description, setDescription] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  const handleSubmit = useCallback(async () => {
    setIsPublishing(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const res = await fetch('/api/marketplace/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agent.id,
          tags,
          description: description.trim() || null,
        }),
      });

      const json = await res.json();

      if (json.success || json.published) {
        toast.success(t('marketplace.published'));
        setOpen(false);
        setTagsInput('');
        setDescription('');
      } else {
        toast.error(json.error ?? t('payment.failed'));
      }
    } catch {
      toast.error(t('payment.failed'));
    } finally {
      setIsPublishing(false);
    }
  }, [agent.id, tagsInput, description, t]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <Label htmlFor="publish-tags">{t('marketplace.tags')}</Label>
            <Input
              id="publish-tags"
              placeholder={t('marketplace.tagsPlaceholder')}
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="publish-description">{t('marketplace.publicDescription')}</Label>
            <Textarea
              id="publish-description"
              placeholder={t('marketplace.publicDescriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
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
