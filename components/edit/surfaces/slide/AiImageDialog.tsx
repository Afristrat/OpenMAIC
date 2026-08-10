'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { buildEditorImagePrompt } from '@/lib/edit/editor-image-prompt';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useCanvasStore } from '@/lib/store/canvas';
import { useSettingsStore } from '@/lib/store/settings';
import { useStageStore } from '@/lib/store/stage';
import { applyGeneratedImage } from './use-slide-surface';

export function AiImageDialog() {
  const { t } = useI18n();
  const target = useCanvasStore.use.aiImageTarget();
  const stage = useStageStore.use.stage();
  const currentSceneId = useStageStore.use.currentSceneId();
  const scenes = useStageStore.use.scenes();
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const scene = scenes.find((candidate) => candidate.id === currentSceneId);
  const selectedElement = useMemo(() => {
    if (target?.kind !== 'element' || scene?.content.type !== 'slide') return undefined;
    return scene.content.canvas.elements.find((element) => element.id === target.elementId);
  }, [scene, target]);

  useEffect(() => {
    if (!target || !scene) return;
    setPrompt(
      buildEditorImagePrompt({
        sceneTitle: scene.title,
        actions: scene.actions,
        element: selectedElement,
      }),
    );
  }, [scene, selectedElement, target]);

  const close = () => {
    if (!generating) useCanvasStore.getState().setAiImageTarget(null);
  };

  const generate = async () => {
    if (!target || !prompt.trim() || !stage?.id) return;
    const settings = useSettingsStore.getState();
    const provider = settings.imageProvidersConfig?.[settings.imageProviderId];
    setGenerating(true);
    try {
      const response = await fetch('/api/generate/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-image-provider': settings.imageProviderId || '',
          'x-image-model': settings.imageModelId || '',
          'x-api-key': provider?.apiKey || '',
          'x-base-url': provider?.baseUrl || '',
        },
        body: JSON.stringify({ prompt: prompt.trim(), aspectRatio: '16:9', classroomId: stage.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || t('edit.image.aiFailed'));
      }
      const src = payload.result?.url;
      if (!src) throw new Error(t('edit.image.aiFailed'));
      applyGeneratedImage(src, {
        element: target.kind === 'element' ? selectedElement : undefined,
        rect: target.kind === 'zone' ? target.rect : undefined,
      });
      useCanvasStore.getState().setAiImageTarget(null);
      toast.success(t('edit.image.aiInserted'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('edit.image.aiFailed'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('edit.image.aiTitle')}</DialogTitle>
          <DialogDescription>{t('edit.image.aiDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="editor-image-prompt" className="text-sm font-medium">
            {t('edit.image.aiPrompt')}
          </label>
          <Textarea
            id="editor-image-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={12}
            disabled={generating}
          />
          <p className="text-xs text-muted-foreground">{t('edit.image.aiTranscriptHint')}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={generating}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={generate} disabled={generating || !prompt.trim()}>
            {generating ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="me-2 h-4 w-4" />
            )}
            {generating ? t('edit.image.aiGenerating') : t('edit.image.aiGenerate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
