'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BarChart3,
  Download,
  FileText,
  GraduationCap,
  Layers,
  Percent,
  Target,
  Users,
} from 'lucide-react';
import type { OrgMemberRole } from '@/lib/supabase/types';

// --- Types ---

interface Metrics {
  totalLearners: number;
  activeClassrooms: number;
  avgScore: number;
  completionRate: number;
}

interface LearnerRow {
  user_id: string;
  nickname: string;
  classrooms_completed: number;
  avg_score: number;
  time_spent: number;
  last_active: string;
}

interface FormationRow {
  stage_id: string;
  name: string;
  learner_count: number;
  avg_score: number;
  completion_rate: number;
}

type DatePreset = '7d' | '30d' | '90d' | 'custom';

function getDateRange(preset: DatePreset): { from: string; to: string } {
  const to = new Date().toISOString();
  const from = new Date();
  switch (preset) {
    case '7d':
      from.setDate(from.getDate() - 7);
      break;
    case '30d':
      from.setDate(from.getDate() - 30);
      break;
    case '90d':
      from.setDate(from.getDate() - 90);
      break;
    case 'custom':
      from.setFullYear(from.getFullYear() - 1);
      break;
  }
  return { from: from.toISOString(), to };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

// --- Component ---

export default function ReportsPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [learners, setLearners] = useState<LearnerRow[]>([]);
  const [formations, setFormations] = useState<FormationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [userRole, setUserRole] = useState<OrgMemberRole | null>(null);

  const fetchReport = useCallback(
    async (preset: DatePreset) => {
      setIsLoading(true);

      // Check membership
      if (user) {
        const supabase = createClient();
        const { data: membership } = await supabase
          .from('org_members')
          .select('role')
          .eq('org_id', orgId)
          .eq('user_id', user.id)
          .single();
        if (membership) {
          setUserRole(membership.role as OrgMemberRole);
        }
      }

      let dateFrom: string;
      let dateTo: string;
      if (preset === 'custom' && customFrom && customTo) {
        dateFrom = new Date(customFrom).toISOString();
        dateTo = new Date(customTo).toISOString();
      } else {
        const range = getDateRange(preset);
        dateFrom = range.from;
        dateTo = range.to;
      }

      const params = new URLSearchParams({ dateFrom, dateTo });
      const res = await fetch(
        `/api/organizations/${orgId}/reports?${params.toString()}`,
      );

      if (!res.ok) {
        toast.error('Failed to load report');
        setIsLoading(false);
        return;
      }

      const json = await res.json();
      setMetrics(json.metrics ?? null);
      setLearners(json.learners ?? []);
      setFormations(json.formations ?? []);
      setIsLoading(false);
    },
    [orgId, user, customFrom, customTo],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- Async data loading on mount */
  useEffect(() => {
    fetchReport(datePreset);
  }, [datePreset, fetchReport]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleExportCsv = useCallback(async () => {
    const range = datePreset === 'custom' && customFrom && customTo
      ? { from: new Date(customFrom).toISOString(), to: new Date(customTo).toISOString() }
      : getDateRange(datePreset);

    const params = new URLSearchParams({
      dateFrom: range.from,
      dateTo: range.to,
      format: 'csv',
    });

    const res = await fetch(
      `/api/organizations/${orgId}/reports?${params.toString()}`,
    );

    if (!res.ok) {
      toast.error('Export failed');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${orgId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [orgId, datePreset, customFrom, customTo]);

  const handleExportPdf = useCallback(() => {
    window.print();
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 print:px-0">
      {/* Header */}
      <div className="mb-8 flex items-center gap-4 print:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/org/${orgId}/admin`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
        </div>
      </div>

      {/* Print-only header */}
      <h1 className="mb-6 hidden text-2xl font-bold print:block">
        {t('reports.title')}
      </h1>

      {/* Date Range Controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <span className="text-sm font-medium text-muted-foreground">
          {t('reports.dateRange')} :
        </span>
        <Select
          value={datePreset}
          onValueChange={(v) => setDatePreset(v as DatePreset)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">{t('reports.last7d')}</SelectItem>
            <SelectItem value="30d">{t('reports.last30d')}</SelectItem>
            <SelectItem value="90d">{t('reports.last90d')}</SelectItem>
            <SelectItem value="custom">{t('reports.custom')}</SelectItem>
          </SelectContent>
        </Select>

        {datePreset === 'custom' && (
          <>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-40"
            />
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <FileText className="mr-2 h-4 w-4" />
            {t('reports.exportPdf')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv}>
            <Download className="mr-2 h-4 w-4" />
            {t('reports.exportCsv')}
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      {metrics && (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            icon={<Users className="h-5 w-5" />}
            label={t('reports.totalLearners')}
            value={metrics.totalLearners.toString()}
          />
          <MetricCard
            icon={<Layers className="h-5 w-5" />}
            label={t('reports.activeClassrooms')}
            value={metrics.activeClassrooms.toString()}
          />
          <MetricCard
            icon={<Target className="h-5 w-5" />}
            label={t('reports.avgScore')}
            value={`${metrics.avgScore}%`}
          />
          <MetricCard
            icon={<Percent className="h-5 w-5" />}
            label={t('reports.completionRate')}
            value={`${metrics.completionRate}%`}
          />
        </div>
      )}

      {/* Learners Table */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <GraduationCap className="h-5 w-5" />
          {t('reports.totalLearners')}
        </h2>
        {learners.length === 0 ? (
          <p className="text-muted-foreground">{t('reports.noData')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">
                    {t('reports.learnerName')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('reports.completed')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('reports.avgScoreCol')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('reports.timeSpent')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('reports.lastActive')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {learners.map((l) => (
                  <tr
                    key={l.user_id}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">{l.nickname}</td>
                    <td className="px-4 py-3 text-right">
                      {l.classrooms_completed}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {l.avg_score.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatDuration(l.time_spent)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatDate(l.last_active)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Formations Table */}
      <div className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Layers className="h-5 w-5" />
          {t('reports.activeClassrooms')}
        </h2>
        {formations.length === 0 ? (
          <p className="text-muted-foreground">{t('reports.noData')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">
                    Formation
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('reports.totalLearners')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('reports.avgScoreCol')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('reports.completionRate')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {formations.map((f) => (
                  <tr
                    key={f.stage_id}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 font-medium">{f.name}</td>
                    <td className="px-4 py-3 text-right">
                      {f.learner_count}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.avg_score.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      {f.completion_rate.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
