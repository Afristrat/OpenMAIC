'use client';

import { motion } from 'motion/react';
import type { PercentageGeometry } from '@/lib/types/action';

interface LaserOverlayProps {
  geometry: PercentageGeometry;
  color?: string;
  duration?: number;
}

export interface LaserPath {
  x: number[];
  y: number[];
  times: number[];
}

const clamp = (value: number) => Math.min(99, Math.max(1, value));

/**
 * Visit the useful extent of a target instead of pinning a dot to its centre.
 * Small targets keep a steady point; wider/taller targets receive a readable
 * serpentine sweep that remains inside the measured DOM bounds.
 */
export function buildLaserPath(geometry: PercentageGeometry): LaserPath {
  const { x, y, w, h, centerX, centerY } = geometry;
  if (w < 4 && h < 4) {
    return { x: [centerX, centerX], y: [centerY, centerY], times: [0, 1] };
  }

  const insetX = Math.min(Math.max(w * 0.12, 0.8), w / 2);
  const insetY = Math.min(Math.max(h * 0.18, 0.8), h / 2);
  const left = clamp(x + insetX);
  const right = clamp(x + w - insetX);
  const top = clamp(y + insetY);
  const bottom = clamp(y + h - insetY);

  return {
    x: [clamp(centerX), left, right, left, right, clamp(centerX)],
    y: [clamp(centerY), top, top, bottom, bottom, clamp(centerY)],
    times: [0, 0.12, 0.34, 0.56, 0.78, 1],
  };
}

/**
 * Laser pointer overlay component
 *
 * Features:
 * - Smoothly flies in from the nearest corner to the element center
 * - Elegant light dot with soft breathing glow
 * - Uses percentage positioning (0-100)
 */
export function LaserOverlay({ geometry, color = '#ff3b30', duration = 8000 }: LaserOverlayProps) {
  const { centerX, centerY } = geometry;
  const path = buildLaserPath(geometry);

  const startPos = {
    x: centerX > 50 ? 105 : -5,
    y: centerY > 50 ? 105 : -5,
  };

  return (
    <motion.div
      data-testid="laser-guidance"
      data-duration-ms={duration}
      data-geometry-x={geometry.x}
      data-geometry-y={geometry.y}
      data-geometry-width={geometry.w}
      data-geometry-height={geometry.h}
      initial={{
        opacity: 0,
        left: `${startPos.x}%`,
        top: `${startPos.y}%`,
      }}
      animate={{
        opacity: 1,
        left: path.x.map((value) => `${value}%`),
        top: path.y.map((value) => `${value}%`),
      }}
      exit={{
        opacity: 0,
        left: `${startPos.x}%`,
        top: `${startPos.y}%`,
        transition: { duration: 0.25, ease: [0.4, 0, 1, 1] },
      }}
      transition={{
        left: { duration: duration / 1000, times: path.times, ease: 'easeInOut' },
        top: { duration: duration / 1000, times: path.times, ease: 'easeInOut' },
        opacity: { duration: 0.15 },
      }}
      className="absolute z-[101] pointer-events-none"
    >
      <div className="relative -translate-x-1/2 -translate-y-1/2">
        {/* Ring pulse */}
        <motion.div
          animate={{ scale: [1, 2.8], opacity: [0.6, 0] }}
          transition={{
            repeat: Infinity,
            duration: 1.5,
            ease: 'easeOut',
            repeatDelay: 0.3,
          }}
          className="absolute inset-0 rounded-full"
          style={{ border: `1.5px solid ${color}` }}
        />

        {/* Light core */}
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: `0 0 8px 2px ${color}60`,
          }}
        />
      </div>
    </motion.div>
  );
}
