import { describe, expect, it } from 'vitest';
import { planSceneSync } from '@/lib/storage/plan-scene-sync';

const copies = (entries: Record<string, number>) =>
  new Map(Object.entries(entries).map(([id, updatedAt]) => [id, { updatedAt }]));

describe('planSceneSync', () => {
  it("renvoie au serveur une scène créée hors ligne quand la copie locale n'est pas plus ancienne", () => {
    const plan = planSceneSync({
      local: copies({ a: 10, neuve: 20 }),
      remote: copies({ a: 10 }),
      remoteStageIsNewer: false,
    });
    expect(plan.pushToRemote).toEqual(['neuve']);
    expect(plan.deleteFromLocal).toEqual([]);
  });

  it('ne ressuscite jamais une scène supprimée ou remplacée sur le serveur plus récent', () => {
    const plan = planSceneSync({
      local: copies({ ancienne: 10, gardee: 10 }),
      remote: copies({ gardee: 10, remplacante: 50 }),
      remoteStageIsNewer: true,
    });
    expect(plan.pushToRemote).toEqual([]);
    expect(plan.deleteFromLocal).toEqual(['ancienne']);
    expect(plan.pullToLocal).toEqual(['remplacante']);
  });

  it('garde la règle de la dernière écriture pour une scène présente des deux côtés', () => {
    const plan = planSceneSync({
      local: copies({ x: 30, y: 10, z: 5 }),
      remote: copies({ x: 20, y: 40, z: 5 }),
      remoteStageIsNewer: true,
    });
    expect(plan.pushToRemote).toEqual(['x']);
    expect(plan.pullToLocal).toEqual(['y']);
  });
});
