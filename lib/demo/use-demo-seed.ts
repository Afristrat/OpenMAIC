'use client';

/**
 * Hook that seeds demo classrooms into IndexedDB on first load.
 *
 * Uses a localStorage flag ('qalem-demo-seeded') to avoid re-inserting.
 * Safe to call on every mount — it no-ops if demos already exist.
 */

import { useEffect, useRef } from 'react';
import { db } from '@/lib/utils/database';
import { demoStages, demoScenes, DEMO_STAGE_IDS } from './seed-classrooms';
import { createLogger } from '@/lib/logger';

const log = createLogger('DemoSeed');

const DEMO_SEEDED_KEY = 'qalem-demo-seeded';

/**
 * Check if demo classrooms have already been seeded.
 */
function isAlreadySeeded(): boolean {
  try {
    return localStorage.getItem(DEMO_SEEDED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark demos as seeded in localStorage.
 */
function markSeeded(): void {
  try {
    localStorage.setItem(DEMO_SEEDED_KEY, 'true');
  } catch {
    // localStorage unavailable — demos may be re-inserted on next load
  }
}

/**
 * Insert all demo stages and scenes into IndexedDB.
 */
async function seedDemos(): Promise<void> {
  if (isAlreadySeeded()) return;

  try {
    // Double-check: if one of the demo stages already exists in DB, skip
    const existing = await db.stages.get(DEMO_STAGE_IDS[0]);
    if (existing) {
      markSeeded();
      return;
    }

    await db.transaction('rw', [db.stages, db.scenes], async () => {
      await db.stages.bulkPut(demoStages);
      await db.scenes.bulkPut(demoScenes);
    });

    markSeeded();
    log.info(`Seeded ${demoStages.length} demo classrooms with ${demoScenes.length} scenes`);
  } catch (error) {
    log.error('Failed to seed demo classrooms:', error);
  }
}

/**
 * Hook: call from app/page.tsx to seed demo classrooms on first load.
 * Returns void — seeding happens silently in the background.
 * Calls `onSeeded` callback when demos are freshly inserted (so the
 * classroom list can be refreshed).
 */
export function useDemoSeed(onSeeded?: () => void): void {
  const onSeededRef = useRef(onSeeded);

  useEffect(() => {
    onSeededRef.current = onSeeded;
  });

  useEffect(() => {
    if (isAlreadySeeded()) return;

    seedDemos().then(() => {
      onSeededRef.current?.();
    });
  }, []);
}

/**
 * Check if a stage ID belongs to a demo classroom.
 */
export function isDemoStage(stageId: string): boolean {
  return (DEMO_STAGE_IDS as readonly string[]).includes(stageId);
}
