'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  type Connection,
  type EdgeMouseHandler,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, GitBranch, Route } from 'lucide-react';
import type {
  OrgMemberRole,
  CurriculumRelationType,
  CurriculumLink,
} from '@/lib/supabase/types';

// --- Constants ---

const RELATION_COLORS: Record<CurriculumRelationType, string> = {
  prerequisite: '#ef4444',
  follows: '#3b82f6',
  deepens: '#22c55e',
  reviews: '#f97316',
};

interface StageNode {
  id: string;
  name: string;
  scene_count: number;
  type_badges: string[];
}

interface EnrichedLink extends CurriculumLink {
  from_stage_name: string;
  to_stage_name: string;
}

// --- Topological sort for recommended path ---

function topologicalSort(stageIds: string[], links: EnrichedLink[]): string[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of stageIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  // Only use prerequisite and follows edges for ordering
  const orderingLinks = links.filter(
    (l) => l.relation_type === 'prerequisite' || l.relation_type === 'follows',
  );

  for (const link of orderingLinks) {
    adjacency.get(link.from_stage_id)?.push(link.to_stage_id);
    inDegree.set(
      link.to_stage_id,
      (inDegree.get(link.to_stage_id) ?? 0) + 1,
    );
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const result: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  // Add any remaining stages that weren't reachable (cycles or disconnected)
  for (const id of stageIds) {
    if (!result.includes(id)) result.push(id);
  }

  return result;
}

// --- Component ---

export default function CurriculumPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuth();

  const [stages, setStages] = useState<StageNode[]>([]);
  const [links, setLinks] = useState<EnrichedLink[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<OrgMemberRole | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(
    null,
  );
  const [selectedRelationType, setSelectedRelationType] =
    useState<CurriculumRelationType>('follows');
  const [showRecommendedPath, setShowRecommendedPath] = useState(false);
  const [recommendedPath, setRecommendedPath] = useState<string[]>([]);

  const canManage =
    userRole === 'admin' ||
    userRole === 'manager' ||
    userRole === 'formateur';

  const stageNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stages) {
      map.set(s.id, s.name);
    }
    return map;
  }, [stages]);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    // Check membership
    if (user) {
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

    // Fetch org stages (from shared_classrooms + owned)
    const { data: sharedClassrooms } = await supabase
      .from('shared_classrooms')
      .select('stage_id')
      .eq('org_id', orgId);

    const { data: ownedStages } = await supabase
      .from('stages')
      .select('id')
      .eq('org_id', orgId);

    const stageIds = [
      ...new Set([
        ...(sharedClassrooms ?? []).map((sc) => sc.stage_id),
        ...(ownedStages ?? []).map((s) => s.id),
      ]),
    ];

    if (stageIds.length === 0) {
      setIsLoading(false);
      return;
    }

    // Fetch stage details
    const { data: stagesData } = await supabase
      .from('stages')
      .select('id, name')
      .in('id', stageIds);

    // Fetch scene counts and types
    const { data: scenes } = await supabase
      .from('scenes')
      .select('stage_id, type')
      .in('stage_id', stageIds);

    const sceneCounts = new Map<string, number>();
    const sceneTypes = new Map<string, Set<string>>();
    for (const scene of scenes ?? []) {
      sceneCounts.set(
        scene.stage_id,
        (sceneCounts.get(scene.stage_id) ?? 0) + 1,
      );
      if (!sceneTypes.has(scene.stage_id)) {
        sceneTypes.set(scene.stage_id, new Set());
      }
      sceneTypes.get(scene.stage_id)?.add(scene.type);
    }

    const stageNodes: StageNode[] = (stagesData ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      scene_count: sceneCounts.get(s.id) ?? 0,
      type_badges: [...(sceneTypes.get(s.id) ?? [])],
    }));

    setStages(stageNodes);

    // Fetch curriculum links
    const res = await fetch(`/api/organizations/${orgId}/curriculum`);
    if (res.ok) {
      const json = await res.json();
      setLinks(json.links ?? []);
    }

    // Build ReactFlow nodes — grid layout
    const cols = Math.max(3, Math.ceil(Math.sqrt(stageNodes.length)));
    const flowNodes: Node[] = stageNodes.map((s, i) => ({
      id: s.id,
      position: {
        x: (i % cols) * 280 + 50,
        y: Math.floor(i / cols) * 150 + 50,
      },
      data: {
        label: s.name,
        sceneCount: s.scene_count,
        badges: s.type_badges,
      },
      style: {
        padding: 12,
        borderRadius: 8,
        border: '1px solid hsl(var(--border))',
        background: 'hsl(var(--card))',
        color: 'hsl(var(--card-foreground))',
        fontSize: 13,
        minWidth: 180,
      },
    }));

    setNodes(flowNodes);
    setIsLoading(false);
  }, [orgId, user, setNodes]);

  // Build edges whenever links change
  useEffect(() => {
    const flowEdges: Edge[] = links.map((link) => ({
      id: link.id,
      source: link.from_stage_id,
      target: link.to_stage_id,
      label: t(`curriculum.${link.relation_type}`),
      style: {
        stroke: RELATION_COLORS[link.relation_type as CurriculumRelationType],
        strokeWidth: 2,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color:
          RELATION_COLORS[link.relation_type as CurriculumRelationType],
      },
      labelStyle: {
        fontSize: 11,
        fill: RELATION_COLORS[link.relation_type as CurriculumRelationType],
        fontWeight: 600,
      },
    }));
    setEdges(flowEdges);
  }, [links, setEdges, t]);

  /* eslint-disable react-hooks/set-state-in-effect -- Async data loading on mount */
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canManage) return;
      setPendingConnection(connection);
      setShowLinkDialog(true);
    },
    [canManage],
  );

  const handleCreateLink = useCallback(async () => {
    if (!pendingConnection?.source || !pendingConnection?.target) return;

    const res = await fetch(`/api/organizations/${orgId}/curriculum`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_stage_id: pendingConnection.source,
        to_stage_id: pendingConnection.target,
        relation_type: selectedRelationType,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? 'Error');
      setShowLinkDialog(false);
      setPendingConnection(null);
      return;
    }

    const { link } = await res.json();
    const enrichedLink: EnrichedLink = {
      ...link,
      from_stage_name:
        stageNameMap.get(link.from_stage_id) ?? link.from_stage_id,
      to_stage_name:
        stageNameMap.get(link.to_stage_id) ?? link.to_stage_id,
    };

    setLinks((prev) => [enrichedLink, ...prev]);
    toast.success(t('curriculum.addLink'));
    setShowLinkDialog(false);
    setPendingConnection(null);
  }, [
    pendingConnection,
    orgId,
    selectedRelationType,
    stageNameMap,
    t,
  ]);

  const onEdgeContextMenu: EdgeMouseHandler = useCallback(
    async (event, edge) => {
      if (!canManage) return;
      event.preventDefault();

      const confirmed = window.confirm(t('curriculum.deleteLink') + '?');
      if (!confirmed) return;

      const res = await fetch(`/api/organizations/${orgId}/curriculum`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: edge.id }),
      });

      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.id !== edge.id));
        toast.success(t('curriculum.deleteLink'));
      } else {
        const err = await res.json();
        toast.error(err.error ?? 'Error');
      }
    },
    [canManage, orgId, t],
  );

  const handleRecommendedPath = useCallback(() => {
    const stageIds = stages.map((s) => s.id);
    const sorted = topologicalSort(stageIds, links);
    setRecommendedPath(sorted);
    setShowRecommendedPath(true);
  }, [stages, links]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (stages.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/org/${orgId}/admin`)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <GitBranch className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">{t('curriculum.title')}</h1>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <p className="text-muted-foreground">{t('curriculum.noClassrooms')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push(`/org/${orgId}/admin`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <GitBranch className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold">{t('curriculum.title')}</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleRecommendedPath}>
            <Route className="mr-2 h-4 w-4" />
            {t('curriculum.recommendedPath')}
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 border-b px-4 py-2 text-xs">
        {canManage && (
          <span className="text-muted-foreground italic">
            {t('curriculum.dragToLink')}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {(
            Object.entries(RELATION_COLORS) as [CurriculumRelationType, string][]
          ).map(([rel, color]) => (
            <span key={rel} className="flex items-center gap-1">
              <span
                className="inline-block h-2.5 w-5 rounded-sm"
                style={{ backgroundColor: color }}
              />
              {t(`curriculum.${rel}`)}
            </span>
          ))}
        </div>
      </div>

      {/* Graph */}
      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeContextMenu={onEdgeContextMenu}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {/* Add Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('curriculum.addLink')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-sm text-muted-foreground">
              {pendingConnection?.source &&
                stageNameMap.get(pendingConnection.source)}{' '}
              →{' '}
              {pendingConnection?.target &&
                stageNameMap.get(pendingConnection.target)}
            </div>
            <Select
              value={selectedRelationType}
              onValueChange={(v) =>
                setSelectedRelationType(v as CurriculumRelationType)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  ['prerequisite', 'follows', 'deepens', 'reviews'] as const
                ).map((rel) => (
                  <SelectItem key={rel} value={rel}>
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: RELATION_COLORS[rel] }}
                      />
                      {t(`curriculum.${rel}`)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowLinkDialog(false);
                  setPendingConnection(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button onClick={handleCreateLink}>
                {t('common.confirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recommended Path Dialog */}
      <Dialog open={showRecommendedPath} onOpenChange={setShowRecommendedPath}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('curriculum.recommendedPath')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {recommendedPath.map((stageId, i) => (
              <div
                key={stageId}
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">
                  {stageNameMap.get(stageId) ?? stageId}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
