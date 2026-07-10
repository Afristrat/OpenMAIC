/**
 * Agent Detail Page — Marketplace
 *
 * Full detail view for a single marketplace agent:
 * - Large avatar, name, role, full persona, tags, avg rating, usage count
 * - Reviews section with list + form to submit/edit review
 * - Import button
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useAuth } from '@/lib/hooks/use-auth';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { createAgentFromTemplate } from '@/lib/orchestration/registry/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Download,
  Star,
  User,
  Users,
} from 'lucide-react';

interface AgentDetail {
  id: string;
  name: string;
  role: string;
  description: string | null;
  avatar: string | null;
  color: string | null;
  tags: string[] | null;
  avgRating: number;
  usageCount: number;
  persona: string | null;
  ownerNickname: string | null;
  createdAt: string;
}

interface ReviewData {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  authorNickname: string | null;
}

function StarRatingDisplay({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizeMap = { sm: 'h-3.5 w-3.5', md: 'h-5 w-5', lg: 'h-6 w-6' };
  const starSize = sizeMap[size];
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
      <span className="ml-2 text-sm text-muted-foreground">
        {rating > 0 ? rating.toFixed(1) : '--'}
      </span>
    </div>
  );
}

function ClickableStars({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          className="p-0.5"
        >
          <Star
            className={`h-6 w-6 transition-colors ${
              star <= value
                ? 'fill-amber-400 text-amber-400'
                : 'text-muted-foreground/30 hover:text-amber-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;
  const { t } = useI18n();
  const { user } = useAuth();
  const addAgent = useAgentRegistry((s) => s.addAgent);

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [imported, setImported] = useState(false);

  // Review form
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [hasExistingReview, setHasExistingReview] = useState(false);

  const fetchAgent = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/marketplace/agents/${agentId}`);
      const json = await res.json();
      if (json.success) {
        setAgent(json.agent);
        setReviews(json.reviews ?? []);
      }
    } catch {
      toast.error('Failed to load agent');
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  // Detect if user already has a review
  useEffect(() => {
    if (!user || reviews.length === 0) {
      setHasExistingReview(false);
      return;
    }
    // The API returns authorNickname, but we compare by checking if the user's
    // profile nickname matches. Since we can't reliably match, we'll check
    // after submit by seeing if the review count changes. For now, we just
    // offer the form.
    setHasExistingReview(false);
  }, [user, reviews]);

  const handleImport = useCallback(async () => {
    if (!agent) return;
    const importedId = `imported-${agent.id}-${Date.now()}`;
    const newAgent = createAgentFromTemplate(
      {
        name: agent.name,
        role: agent.role,
        persona: agent.persona ?? '',
        avatar: agent.avatar ?? '/avatars/teacher.png',
        color: agent.color ?? '#6366f1',
        allowedActions: [],
        priority: 5,
      },
      importedId,
    );
    addAgent(newAgent);

    // Increment usage (fire-and-forget)
    fetch(`/api/marketplace/agents/${agent.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: undefined, _incrementUsage: true }),
    }).catch(() => { /* best effort */ });

    setImported(true);
    toast.success(t('marketplace.imported'));
  }, [agent, addAgent, t]);

  const submitReview = useCallback(async () => {
    if (!user) return;
    setIsSubmittingReview(true);
    try {
      const res = await fetch(`/api/marketplace/agents/${agentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment || null }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(t('marketplace.reviewSubmitted'));
        setHasExistingReview(true);
        await fetchAgent();
      } else {
        toast.error(json.error ?? 'Failed to submit review');
      }
    } catch {
      toast.error('Failed to submit review');
    } finally {
      setIsSubmittingReview(false);
    }
  }, [agentId, reviewRating, reviewComment, user, t, fetchAgent]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-muted-foreground">{t('marketplace.noResults')}</p>
        <Link href="/marketplace/agents">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('marketplace.backToMarketplace')}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Back link */}
      <Link href="/marketplace/agents" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        {t('marketplace.backToMarketplace')}
      </Link>

      {/* Agent header */}
      <div className="mb-8 flex items-start gap-5">
        <div
          className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-3xl"
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
            <User className="h-10 w-10" />
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{agent.name}</h1>
          <p className="text-muted-foreground">{agent.role}</p>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <StarRatingDisplay rating={agent.avgRating} size="md" />
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {t('marketplace.usageCount')}: {agent.usageCount}
            </span>
          </div>

          {agent.ownerNickname && (
            <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              {t('marketplace.byAuthor')} {agent.ownerNickname}
            </p>
          )}
        </div>
      </div>

      {/* Tags */}
      {agent.tags && agent.tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {agent.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Description */}
      {agent.description && (
        <div className="mb-6">
          <p className="text-sm leading-relaxed">{agent.description}</p>
        </div>
      )}

      {/* Persona */}
      {agent.persona && (
        <div className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">{t('marketplace.persona')}</h2>
          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{agent.persona}</p>
          </div>
        </div>
      )}

      {/* Import button */}
      <div className="mb-10">
        <Button
          size="lg"
          onClick={handleImport}
          disabled={imported}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          {imported ? t('marketplace.imported') : t('marketplace.importAgent')}
        </Button>
      </div>

      {/* Reviews section */}
      <div className="border-t pt-8">
        <h2 className="mb-6 text-lg font-semibold">{t('marketplace.reviews')}</h2>

        {/* Review list */}
        {reviews.length === 0 ? (
          <p className="mb-6 text-sm text-muted-foreground">{t('marketplace.noReviews')}</p>
        ) : (
          <div className="mb-8 space-y-4">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StarRatingDisplay rating={review.rating} size="sm" />
                    <span className="text-sm font-medium">
                      {review.authorNickname ?? '???'}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(review.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {review.comment && (
                  <p className="text-sm leading-relaxed">{review.comment}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Review form */}
        {user && (
          <div className="rounded-lg border bg-muted/30 p-5">
            <h3 className="mb-4 font-medium">
              {hasExistingReview ? t('marketplace.editReview') : t('marketplace.writeReview')}
            </h3>

            <div className="mb-4">
              <span className="mb-2 block text-sm font-medium">{t('marketplace.rating')}</span>
              <ClickableStars value={reviewRating} onChange={setReviewRating} />
            </div>

            <Textarea
              placeholder={t('marketplace.reviewPlaceholder')}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={3}
              className="mb-4"
            />

            <Button onClick={submitReview} disabled={isSubmittingReview}>
              {isSubmittingReview ? t('common.loading') : t('common.confirm')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
