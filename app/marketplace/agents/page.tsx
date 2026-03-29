'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { createAgentFromTemplate } from '@/lib/orchestration/registry/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Download,
  Search,
  Star,
  Trophy,
  User,
  Users,
  Store,
  Filter,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from 'lucide-react';
import type { RankedAgent } from '@/lib/marketplace/ranking';

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ReviewData {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  authorNickname: string | null;
}

const SORT_OPTIONS = ['score', 'rating', 'usage', 'recent'] as const;

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' }) {
  const starSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4.5 w-4.5';
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${starSize} ${
            star <= Math.round(rating)
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground/30'
          }`}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">
        {rating > 0 ? rating.toFixed(1) : '--'}
      </span>
    </div>
  );
}

export default function MarketplacePage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const addAgent = useAgentRegistry((s) => s.addAgent);

  const [agents, setAgents] = useState<RankedAgent[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterTag, setFilterTag] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterLanguage, setFilterLanguage] = useState('all');
  const [sortBy, setSortBy] = useState<(typeof SORT_OPTIONS)[number]>('score');
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  // Review modal state
  const [reviewAgentId, setReviewAgentId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchAgents = useCallback(async (page = 1) => {
    setIsLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    params.set('sort', sortBy);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (filterTag !== 'all') params.set('tag', filterTag);
    if (filterLevel !== 'all') params.set('level', filterLevel);
    if (filterLanguage !== 'all') params.set('language', filterLanguage);

    try {
      const res = await fetch(`/api/marketplace/agents?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setAgents(json.agents);
        setPagination(json.pagination);
      }
    } catch {
      toast.error('Failed to load marketplace');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, filterTag, filterLevel, filterLanguage, sortBy]);

  /* eslint-disable react-hooks/set-state-in-effect -- Async data loading on filter change */
  useEffect(() => {
    fetchAgents(1);
  }, [fetchAgents]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleImport = useCallback(async (agent: RankedAgent) => {
    // Fetch full agent details to get persona
    try {
      const res = await fetch(`/api/marketplace/agents/${agent.id}`);
      const json = await res.json();
      if (!json.success) {
        toast.error('Failed to import agent');
        return;
      }

      const detail = json.agent;
      const importedId = `imported-${agent.id}-${Date.now()}`;
      const newAgent = createAgentFromTemplate(
        {
          name: detail.name,
          role: detail.role,
          persona: detail.persona ?? '',
          avatar: detail.avatar ?? '/avatars/teacher.png',
          color: detail.color ?? '#6366f1',
          allowedActions: [],
          priority: 5,
        },
        importedId,
      );
      addAgent(newAgent);

      // Increment usage count (fire-and-forget)
      fetch(`/api/marketplace/agents/${agent.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: undefined, _incrementUsage: true }),
      }).catch(() => { /* best effort */ });

      setImportedIds((prev) => new Set(prev).add(agent.id));
      toast.success(t('marketplace.imported'));
    } catch {
      toast.error('Failed to import agent');
    }
  }, [addAgent, t]);

  const openReviews = useCallback(async (agentId: string) => {
    setReviewAgentId(agentId);
    setReviewRating(5);
    setReviewComment('');
    try {
      const res = await fetch(`/api/marketplace/agents/${agentId}`);
      const json = await res.json();
      if (json.success) {
        setReviews(json.reviews ?? []);
      }
    } catch {
      setReviews([]);
    }
  }, []);

  const submitReview = useCallback(async () => {
    if (!reviewAgentId || !user) return;
    setIsSubmittingReview(true);
    try {
      const res = await fetch(`/api/marketplace/agents/${reviewAgentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment || null }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(t('marketplace.reviews'));
        setReviewAgentId(null);
        // Refresh list
        await fetchAgents(pagination.page);
      } else {
        toast.error(json.error ?? 'Failed to submit review');
      }
    } catch {
      toast.error('Failed to submit review');
    } finally {
      setIsSubmittingReview(false);
    }
  }, [reviewAgentId, reviewRating, reviewComment, user, t, fetchAgents, pagination.page]);

  const TAGS = useMemo(() => [
    'all', 'math', 'science', 'languages', 'history', 'programming', 'arts',
  ], []);
  const LEVELS = useMemo(() => ['all', 'beginner', 'intermediate', 'advanced'], []);
  const LANGUAGES = useMemo(() => ['all', 'fr', 'ar', 'en', 'zh'], []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Store className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold">{t('marketplace.title')}</h1>
      </div>

      {/* Search & Filters */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t('marketplace.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {t(`marketplace.sort.${opt}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filterTag} onValueChange={setFilterTag}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder={t('marketplace.filter')} />
            </SelectTrigger>
            <SelectContent>
              {TAGS.map((tag) => (
                <SelectItem key={tag} value={tag}>
                  {tag === 'all' ? t('marketplace.filter') : tag}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterLevel} onValueChange={setFilterLevel}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder={t('marketplace.level')} />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((lvl) => (
                <SelectItem key={lvl} value={lvl}>
                  {lvl === 'all' ? t('marketplace.level') : lvl}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterLanguage} onValueChange={setFilterLanguage}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue placeholder={t('marketplace.language')} />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang === 'all' ? t('marketplace.language') : lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      )}

      {/* No results */}
      {!isLoading && agents.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Store className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <p className="text-muted-foreground">{t('marketplace.noResults')}</p>
        </div>
      )}

      {/* Agent Grid */}
      {!isLoading && agents.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="group relative rounded-lg border bg-card p-4 transition-shadow hover:shadow-md"
            >
              {/* Top Agent Badge */}
              {agent.isTopAgent && (
                <div className="absolute -top-2 -right-2 z-10">
                  <Badge className="bg-amber-500 text-white shadow-sm">
                    <Trophy className="mr-1 h-3 w-3" />
                    Top Agent
                  </Badge>
                </div>
              )}

              {/* Header: avatar + name + role */}
              <div className="mb-3 flex items-start gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                  style={{ backgroundColor: agent.color ?? '#6366f1', color: '#fff' }}
                >
                  {agent.avatar ? (
                    agent.avatar.startsWith('/') || agent.avatar.startsWith('http') ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={agent.avatar} alt={agent.name} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <span>{agent.avatar}</span>
                    )
                  ) : (
                    <User className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold leading-tight">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground">{agent.role}</p>
                </div>
              </div>

              {/* Description */}
              {agent.description && (
                <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                  {agent.description}
                </p>
              )}

              {/* Tags */}
              {agent.tags && agent.tags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {agent.tags.slice(0, 4).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Stats row */}
              <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                <StarRating rating={agent.avgRating} />
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {t('marketplace.usageCount')}: {agent.usageCount}
                </span>
              </div>

              {/* Author + date */}
              <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                {agent.ownerNickname ? (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {t('marketplace.byAuthor')} {agent.ownerNickname}
                  </span>
                ) : (
                  <span />
                )}
                <span>{new Date(agent.createdAt).toLocaleDateString()}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="flex-1 gap-1"
                  onClick={() => handleImport(agent)}
                  disabled={importedIds.has(agent.id)}
                >
                  <Download className="h-3.5 w-3.5" />
                  {importedIds.has(agent.id) ? t('marketplace.imported') : t('marketplace.import')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => openReviews(agent.id)}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {t('marketplace.reviews')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page <= 1}
            onClick={() => fetchAgents(pagination.page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {pagination.page} / {pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => fetchAgents(pagination.page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Review Panel (overlay) */}
      {reviewAgentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-card p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold">{t('marketplace.reviews')}</h2>

            {/* Existing reviews */}
            <div className="mb-4 max-h-60 space-y-3 overflow-y-auto">
              {reviews.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('marketplace.noResults')}</p>
              )}
              {reviews.map((review) => (
                <div key={review.id} className="rounded border p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <StarRating rating={review.rating} />
                    <span className="text-xs text-muted-foreground">
                      {review.authorNickname ?? '???'}
                    </span>
                  </div>
                  {review.comment && (
                    <p className="text-sm">{review.comment}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Submit review form */}
            {user && (
              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{t('marketplace.rating')} :</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className="p-0.5"
                      >
                        <Star
                          className={`h-5 w-5 ${
                            star <= reviewRating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-muted-foreground/30'
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                </div>
                <Input
                  placeholder={t('marketplace.reviewPlaceholder')}
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={submitReview}
                    disabled={isSubmittingReview}
                  >
                    {t('common.confirm')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReviewAgentId(null)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}

            {!user && (
              <div className="border-t pt-4">
                <Button variant="outline" size="sm" onClick={() => setReviewAgentId(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
