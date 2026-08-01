'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
// The central scene dispatcher routes persisted `plugin` scenes here.
import type { PluginSceneContent as PluginContent } from '@/lib/plugins/scene-sdk';
import type { StageMode } from '@/lib/types/stage';

// ---------------------------------------------------------------------------
// PostMessage protocol between parent and plugin iframe
// ---------------------------------------------------------------------------

/** Messages sent FROM parent TO plugin iframe. */
interface PluginInboundMessage {
  source: 'qalem-host';
  type: 'init' | 'update' | 'theme';
  payload: Record<string, unknown>;
}

/** Messages sent FROM plugin iframe TO parent. */
interface PluginOutboundMessage {
  source: 'qalem-plugin';
  type: 'ready' | 'resize' | 'complete' | 'score' | 'event';
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PluginRendererProps {
  readonly content: PluginContent;
  readonly mode: StageMode;
  readonly sceneId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PluginRenderer({ content, mode: _mode, sceneId }: PluginRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState<number | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const title = typeof content.data.title === 'string' ? content.data.title : content.pluginType;

  // Plugins are served via the API route /api/plugins/scenes/<id>
  const pluginSrc = useMemo(
    () => `/api/plugins/scenes/${content.pluginType}`,
    [content.pluginType],
  );

  // ------------------------------------------------------------------
  // Send initial data once the iframe signals readiness
  // ------------------------------------------------------------------
  const sendToPlugin = useCallback((msg: PluginInboundMessage) => {
    iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  const sendInitData = useCallback(() => {
    sendToPlugin({
      source: 'qalem-host',
      type: 'init',
      payload: {
        sceneId,
        pluginType: content.pluginType,
        data: content.data,
        theme: getHostTheme(),
      },
    });
  }, [sendToPlugin, sceneId, content]);

  // ------------------------------------------------------------------
  // Listen for messages from the iframe
  // ------------------------------------------------------------------
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;

      const msg = event.data as PluginOutboundMessage | undefined;
      if (!msg || msg.source !== 'qalem-plugin') return;

      switch (msg.type) {
        case 'ready':
          setReady(true);
          sendInitData();
          break;

        case 'resize':
          if (typeof msg.payload?.height === 'number') {
            setIframeHeight(msg.payload.height as number);
          }
          break;

        case 'score':
          // Future: forward to scoring engine
          break;

        case 'complete':
          // Future: notify orchestration
          break;

        case 'event':
          // Future: generic plugin events
          break;
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sendInitData]);

  // ------------------------------------------------------------------
  // Re-send data when content changes (e.g. hot-reloaded in dev)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;
    sendToPlugin({
      source: 'qalem-host',
      type: 'update',
      payload: { data: content.data },
    });
  }, [ready, content.data, sendToPlugin]);

  // ------------------------------------------------------------------
  // Forward theme changes
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!ready) return;

    const observer = new MutationObserver(() => {
      sendToPlugin({
        source: 'qalem-host',
        type: 'theme',
        payload: { theme: getHostTheme() },
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });

    return () => observer.disconnect();
  }, [ready, sendToPlugin]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <section className="flex h-full w-full flex-col" aria-label={title}>
      <h2 className="shrink-0 border-b px-5 py-3 text-lg font-semibold">{title}</h2>
      <iframe
        ref={iframeRef}
        src={pluginSrc}
        className="min-h-0 flex-1 w-full border-0"
        style={iframeHeight ? { height: `${iframeHeight}px`, flex: 'none' } : undefined}
        title={`Plugin Scene ${sceneId} (${content.pluginType})`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHostTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}
