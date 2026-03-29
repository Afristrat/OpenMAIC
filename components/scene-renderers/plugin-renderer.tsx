'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import type { PluginContent } from '@/lib/types/stage';

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
  readonly mode: 'autonomous' | 'playback';
  readonly sceneId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PluginRenderer({ content, mode: _mode, sceneId }: PluginRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState<number | undefined>(undefined);
  const [ready, setReady] = useState(false);

  // Plugins are served via the API route /api/plugins/scenes/<id>
  const pluginSrc = useMemo(
    () => `/api/plugins/scenes/${content.pluginType}`,
    [content.pluginType],
  );

  // ------------------------------------------------------------------
  // Send initial data once the iframe signals readiness
  // ------------------------------------------------------------------
  const sendToPlugin = useCallback(
    (msg: PluginInboundMessage) => {
      iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
    },
    [],
  );

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
    <div className="w-full h-full relative">
      <iframe
        ref={iframeRef}
        src={pluginSrc}
        className="absolute inset-0 w-full border-0"
        style={{ height: iframeHeight ? `${iframeHeight}px` : '100%' }}
        title={`Plugin Scene ${sceneId} (${content.pluginType})`}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHostTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}
