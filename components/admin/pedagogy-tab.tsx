'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Progress } from '@/components/ui/progress';
import { Brain, Info, BarChart3 } from 'lucide-react';

// Mock data — real data comes from pedagogy_telemetry table
const MOCK_METRICS = {
  sessionsCollected: 42,
  subjectsCovered: 8,
  languages: 3,
  activationThreshold: 42,
};

const MOCK_TOP_SEQUENCES = [
  { sequence: 'intro → quiz → explanation → practice', efficiency: 87, sessions: 15 },
  { sequence: 'video → discussion → quiz', efficiency: 82, sessions: 12 },
  { sequence: 'reading → highlight → quiz → review', efficiency: 78, sessions: 9 },
  { sequence: 'brainstorm → research → present', efficiency: 74, sessions: 4 },
  { sequence: 'case-study → discussion → synthesis', efficiency: 71, sessions: 2 },
];

export function PedagogyTab(): React.ReactElement {
  const { t } = useI18n();
  const [collectionEnabled, setCollectionEnabled] = useState(true);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="size-5" />
          {t('admin.pedagogy.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <Info className="size-3.5 shrink-0" />
          {t('admin.pedagogy.dataNote')}
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4 bg-muted/10">
          <p className="text-xs font-medium text-muted-foreground">
            {t('admin.pedagogy.sessionsCollected')}
          </p>
          <p className="text-2xl font-bold mt-1">{MOCK_METRICS.sessionsCollected}</p>
        </div>
        <div className="rounded-lg border p-4 bg-muted/10">
          <p className="text-xs font-medium text-muted-foreground">
            {t('admin.pedagogy.subjectsCovered')}
          </p>
          <p className="text-2xl font-bold mt-1">{MOCK_METRICS.subjectsCovered}</p>
        </div>
        <div className="rounded-lg border p-4 bg-muted/10">
          <p className="text-xs font-medium text-muted-foreground">
            {t('admin.pedagogy.languages')}
          </p>
          <p className="text-2xl font-bold mt-1">{MOCK_METRICS.languages}</p>
        </div>
      </div>

      {/* Activation Threshold */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">{t('admin.pedagogy.activationThreshold')}</p>
          <span className="text-sm text-muted-foreground">
            {MOCK_METRICS.activationThreshold} {t('admin.pedagogy.sessionsOf')}
          </span>
        </div>
        <Progress value={MOCK_METRICS.activationThreshold} className="h-2" />
      </div>

      {/* Collection Toggle (informational only) */}
      <div className="rounded-lg border p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">
            {collectionEnabled
              ? t('admin.pedagogy.collectionEnabled')
              : t('admin.pedagogy.collectionDisabled')}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('admin.pedagogy.envNote')}
          </p>
        </div>
        <button
          onClick={() => setCollectionEnabled((prev) => !prev)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            collectionEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
        >
          <span
            className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
              collectionEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* Top Sequences Table */}
      <div>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="size-4" />
          {t('admin.pedagogy.topSequences')}
        </h3>
        <div className="rounded-lg border divide-y">
          {/* Header */}
          <div className="grid grid-cols-[2fr_auto_auto] gap-4 px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-muted/30">
            <span>{t('admin.pedagogy.sequence')}</span>
            <span className="w-20 text-right">{t('admin.pedagogy.efficiency')}</span>
            <span className="w-20 text-right">{t('admin.pedagogy.sessions')}</span>
          </div>

          {/* Rows */}
          {MOCK_TOP_SEQUENCES.map((seq, i) => (
            <div
              key={i}
              className="grid grid-cols-[2fr_auto_auto] gap-4 px-4 py-3 items-center"
            >
              <code className="text-xs font-mono text-muted-foreground">{seq.sequence}</code>
              <span className="w-20 text-right text-sm font-medium">{seq.efficiency}%</span>
              <span className="w-20 text-right text-sm text-muted-foreground">{seq.sessions}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
