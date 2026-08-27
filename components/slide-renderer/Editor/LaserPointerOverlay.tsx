'use client';

import { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { useSceneSelector } from '@/lib/contexts/scene-context';
import { useCanvasStore } from '@/lib/store/canvas';
import type { SlideContent } from '@/lib/types/stage';
import type { PPTElement } from '@openmaic/dsl';
import { LaserOverlay } from './LaserOverlay';

interface LaserPointerOverlayProps {
  /**
   * DOM id prefix used to locate the target element. Playback screens render
   * elements as `screen-element-<id>` (default); the editor canvas renders
   * them as `editable-element-<id>` and passes that prefix so a `laser` cue
   * replays as the real laser pointer in Pro mode.
   */
  domIdPrefix?: string;
}

/**
 * Store-driven laser pointer overlay.
 *
 * The laser sibling of {@link SpotlightOverlay}: reads `laserElementId` /
 * `laserOptions` from the canvas store and measures the rendered DOM element
 * (`getBoundingClientRect`) to place the laser dot at its center. Without this,
 * the edit canvas had no laser surface, so laser cues had nowhere to render and
 * were collapsed into a spotlight instead.
 */
export function LaserPointerOverlay({
  domIdPrefix = 'screen-element-',
}: LaserPointerOverlayProps = {}) {
  const laserElementId = useCanvasStore.use.laserElementId();
  const laserOptions = useCanvasStore.use.laserOptions();
  const containerRef = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  const elements = useSceneSelector<SlideContent, PPTElement[]>(
    (content) => content.canvas.elements,
  );

  // Compute the target element center as a percentage of the overlay container.
  const measure = useCallback(() => {
    if (!laserElementId || !containerRef.current) {
      setGeometry(null);
      return;
    }

    const domElement = document.getElementById(`${domIdPrefix}${laserElementId}`);
    if (!domElement) {
      setGeometry(null);
      return;
    }

    // Measure the union of the authored box and its rendered content. Text can
    // grow beyond an auto-height box, while grouped/table elements can occupy
    // the full outer box. Picking either rectangle alone loses part of a target.
    const contentEl = domElement.querySelector<HTMLElement>('.element-content');
    const authoredEl =
      contentEl?.closest<HTMLElement>('[class*="base-element-"], [class*="editable-element-"]') ??
      contentEl ??
      domElement;
    const containerRect = containerRef.current.getBoundingClientRect();
    const outerRect = authoredEl.getBoundingClientRect();
    const contentRect = contentEl?.getBoundingClientRect();
    const targetRect = contentRect
      ? {
          left: Math.min(outerRect.left, contentRect.left),
          top: Math.min(outerRect.top, contentRect.top),
          right: Math.max(outerRect.right, contentRect.right),
          bottom: Math.max(outerRect.bottom, contentRect.bottom),
          width:
            Math.max(outerRect.right, contentRect.right) -
            Math.min(outerRect.left, contentRect.left),
          height:
            Math.max(outerRect.bottom, contentRect.bottom) -
            Math.min(outerRect.top, contentRect.top),
        }
      : outerRect;

    if (containerRect.width === 0 || containerRect.height === 0) {
      setGeometry(null);
      return;
    }

    const x = ((targetRect.left - containerRect.left) / containerRect.width) * 100;
    const y = ((targetRect.top - containerRect.top) / containerRect.height) * 100;
    const w = (targetRect.width / containerRect.width) * 100;
    const h = (targetRect.height / containerRect.height) * 100;
    setGeometry({
      x,
      y,
      w,
      h,
      centerX: x + w / 2,
      centerY: y + h / 2,
    });
  }, [laserElementId, domIdPrefix]);

  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- DOM measurement requires effect
    measure();
  }, [measure, elements]);

  return (
    // No overflow-hidden: the laser flies in from just outside the frame.
    <div
      ref={containerRef}
      data-testid="laser-guidance-surface"
      className="absolute inset-0 z-[101] pointer-events-none"
    >
      <AnimatePresence>
        {laserElementId && geometry && (
          <LaserOverlay
            key={`laser-${laserElementId}`}
            geometry={geometry}
            color={laserOptions?.color}
            duration={laserOptions?.duration}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
