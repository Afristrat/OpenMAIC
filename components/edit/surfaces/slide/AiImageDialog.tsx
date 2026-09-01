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
import {
  editorImageTargetContext,
  pickEditorImageAspectRatio,
  sceneTranscript,
} from '@/lib/edit/editor-image-prompt';
import { useI18n } from '@/lib/hooks/use-i18n';
import { getCurrentModelConfig } from '@/lib/utils/model-config';
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
  const [negativePrompt, setNegativePrompt] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const scene = scenes.find((candidate) => candidate.id === currentSceneId);
  const selectedElement = useMemo(() => {
    if (target?.kind !== 'element' || scene?.content.type !== 'slide') return undefined;
    return scene.content.canvas.elements.find((element) => element.id === target.elementId);
  }, [scene, target]);
  const targetGeometry = useMemo(() => {
    if (selectedElement) {
      const width = 'width' in selectedElement ? selectedElement.width : undefined;
      const height = 'height' in selectedElement ? selectedElement.height : undefined;
      if (typeof width === 'number' && typeof height === 'number') return { width, height };
    }
    return target?.kind === 'zone' && target.rect
      ? { width: target.rect.width, height: target.rect.height }
      : { width: 16, height: 9 };
  }, [selectedElement, target]);

  useEffect(() => {
    if (!target || !scene) return;
    const controller = new AbortController();
    const prepare = async () => {
      setPreparing(true);
      setPrompt('');
      setNegativePrompt('');
      try {
        const model = getCurrentModelConfig();
        const response = await fetch('/api/generate/editor-image-brief', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
            'x-model': model.modelString || '',
            'x-api-key': model.apiKey || '',
            'x-base-url': model.baseUrl || '',
            'x-provider-type': model.providerType || '',
          },
          body: JSON.stringify({
            classroomId: stage?.id,
            sceneTitle: scene.title,
            transcript: sceneTranscript(scene.actions),
            targetContext: editorImageTargetContext(selectedElement),
            target: targetGeometry,
            thinkingConfig: model.thinkingConfig,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success || typeof payload.prompt !== 'string') {
          throw new Error(payload.error || t('edit.image.aiFailed'));
        }
        setPrompt(payload.prompt);
        setNegativePrompt(typeof payload.negativePrompt === 'string' ? payload.negativePrompt : '');
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error(error instanceof Error ? error.message : t('edit.image.aiFailed'));
        }
      } finally {
        if (!controller.signal.aborted) setPreparing(false);
      }
    };
    void prepare();
    return () => controller.abort();
  }, [scene, selectedElement, stage?.id, t, target, targetGeometry]);

  const close = () => {
    if (!generating && !preparing) useCanvasStore.getState().setAiImageTarget(null);
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
          'Idempotency-Key': crypto.randomUUID(),
          'x-image-provider': settings.imageProviderId || '',
          'x-image-model': settings.imageModelId || '',
          'x-api-key': provider?.apiKey || '',
          'x-base-url': provider?.baseUrl || '',
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          negativePrompt,
          aspectRatio: pickEditorImageAspectRatio(targetGeometry),
          classroomId: stage.id,
        }),
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('edit.image.aiTitle')}</DialogTitle>
          <DialogDescription>{t('edit.image.aiDescription')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-2 overflow-y-auto pe-1">
          <label htmlFor="editor-image-prompt" className="text-sm font-medium">
            {t('edit.image.aiPrompt')}
          </label>
          <Textarea
            id="editor-image-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={12}
            disabled={generating || preparing}
            className="min-h-40 max-h-[45dvh] resize-y"
          />
          <p className="text-xs text-muted-foreground">{t('edit.image.aiTranscriptHint')}</p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={generating || preparing}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={generate}
            disabled={generating || preparing || !prompt.trim()}
          >
            {generating || preparing ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="me-2 h-4 w-4" />
            )}
            {generating || preparing ? t('edit.image.aiGenerating') : t('edit.image.aiGenerate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
