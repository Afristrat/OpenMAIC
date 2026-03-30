/**
 * Payment Page
 *
 * Step 1: Select plan (Professionnel monthly / annual)
 * Step 2: Select payment provider (Orange Money, Wave, CinetPay)
 * Step 3: Phone number input (for Orange Money / Wave)
 * Submit: POST /api/payments/initiate -> redirect
 */

'use client';

import { useState, useCallback } from 'react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { CreditCard, Phone, Loader2, CheckCircle2 } from 'lucide-react';

type BillingPeriod = 'monthly' | 'annual';
type Provider = 'orange-money' | 'wave' | 'cinetpay' | 'stripe';

const PLANS: Record<BillingPeriod, { priceXOF: number; labelKey: string }> = {
  monthly: { priceXOF: 9900, labelKey: 'payment.monthly' },
  annual: { priceXOF: 99000, labelKey: 'payment.annual' },
};

const PROVIDERS: { id: Provider; labelKey: string; needsPhone: boolean; color: string }[] = [
  { id: 'stripe', labelKey: 'payment.stripe', needsPhone: false, color: '#635bff' },
  { id: 'orange-money', labelKey: 'payment.orangeMoney', needsPhone: true, color: '#ff6600' },
  { id: 'wave', labelKey: 'payment.wave', needsPhone: true, color: '#1dc1ec' },
  { id: 'cinetpay', labelKey: 'payment.cinetpay', needsPhone: false, color: '#00a651' },
];

export default function PayPage() {
  const { t } = useI18n();

  const [step, setStep] = useState(1);
  const [billing, setBilling] = useState<BillingPeriod>('monthly');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const selectedProvider = PROVIDERS.find((p) => p.id === provider);
  const plan = PLANS[billing];

  const handleSelectPlan = useCallback((period: BillingPeriod) => {
    setBilling(period);
    setStep(2);
  }, []);

  const handleSelectProvider = useCallback((prov: Provider) => {
    setProvider(prov);
    const provDef = PROVIDERS.find((p) => p.id === prov);
    if (provDef?.needsPhone) {
      setStep(3);
    } else {
      // Skip phone step, go directly to submit
      setStep(3);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!provider) return;
    if (selectedProvider?.needsPhone && !phone.trim()) {
      toast.error(t('payment.phonePlaceholder'));
      return;
    }

    setIsLoading(true);
    try {
      // Stripe: redirect via billing checkout session
      if (provider === 'stripe') {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: 'default', // TODO: use actual org ID from session
            plan: 'pro',
            interval: billing === 'monthly' ? 'month' : 'year',
          }),
        });
        const json = await res.json();
        if (json.url) {
          window.location.href = json.url;
        } else if (json.error) {
          toast.error(json.error);
        }
        return;
      }

      // Mobile money / CinetPay: use existing payments flow
      const res = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          amount: plan.priceXOF,
          currency: 'XOF',
          description: `Qalem ${t('payment.planProfessional')} — ${t(plan.labelKey)}`,
          customerPhone: phone.trim() || undefined,
          metadata: { plan: 'professional', billing },
        }),
      });

      const json = await res.json();

      if (json.redirectUrl) {
        window.location.href = json.redirectUrl;
      } else if (json.error) {
        toast.error(json.error);
      } else {
        // No redirect URL — go to success page
        window.location.href = '/pay/success';
      }
    } catch {
      toast.error(t('payment.failed'));
    } finally {
      setIsLoading(false);
    }
  }, [provider, selectedProvider, phone, plan, billing, t]);

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="mb-8 text-center">
        <CreditCard className="mx-auto mb-3 h-8 w-8 text-primary" />
        <h1 className="text-2xl font-bold">{t('payment.title')}</h1>
      </div>

      {/* Step indicators */}
      <div className="mb-10 flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
              s <= step
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
          </div>
        ))}
      </div>

      {/* Step 1: Select plan */}
      {step >= 1 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">
            1. {t('payment.selectPlan')}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Monthly */}
            <button
              type="button"
              className={`rounded-lg border-2 p-5 text-left transition-colors ${
                billing === 'monthly' && step > 1
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
              onClick={() => handleSelectPlan('monthly')}
            >
              <div className="mb-2 font-semibold">{t('payment.planProfessional')}</div>
              <div className="text-2xl font-bold">
                9 900 XOF
                <span className="text-sm font-normal text-muted-foreground">
                  {t('payment.perMonth')}
                </span>
              </div>
              <Badge variant="secondary" className="mt-2">
                {t('payment.monthly')}
              </Badge>
            </button>

            {/* Annual */}
            <button
              type="button"
              className={`rounded-lg border-2 p-5 text-left transition-colors ${
                billing === 'annual' && step > 1
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
              onClick={() => handleSelectPlan('annual')}
            >
              <div className="mb-2 font-semibold">{t('payment.planProfessional')}</div>
              <div className="text-2xl font-bold">
                99 000 XOF
                <span className="text-sm font-normal text-muted-foreground">
                  {t('payment.perYear')}
                </span>
              </div>
              <Badge variant="secondary" className="mt-2">
                {t('payment.annual')}
              </Badge>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Select provider */}
      {step >= 2 && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">
            2. {t('payment.selectProvider')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {PROVIDERS.map((prov) => (
              <button
                key={prov.id}
                type="button"
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-5 transition-colors ${
                  provider === prov.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => handleSelectProvider(prov.id)}
              >
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-white text-lg font-bold"
                  style={{ backgroundColor: prov.color }}
                >
                  {prov.id === 'stripe' ? '💳' : prov.id === 'orange-money' ? 'OM' : prov.id === 'wave' ? 'W' : 'CP'}
                </div>
                <span className="text-sm font-medium">{t(prov.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Phone number (if needed) + submit */}
      {step >= 3 && provider && (
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold">
            3. {t('payment.pay')}
          </h2>

          {selectedProvider?.needsPhone && (
            <div className="mb-4 space-y-2">
              <Label htmlFor="pay-phone" className="flex items-center gap-1">
                <Phone className="h-4 w-4" />
                {t('payment.phoneNumber')}
              </Label>
              <Input
                id="pay-phone"
                type="tel"
                placeholder={t('payment.phonePlaceholder')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          )}

          <div className="mb-4 rounded-lg bg-muted/50 p-4 text-sm">
            <div className="flex justify-between">
              <span>{t('payment.planProfessional')} ({t(plan.labelKey)})</span>
              <span className="font-semibold">
                {plan.priceXOF.toLocaleString()} XOF
              </span>
            </div>
          </div>

          <Button
            size="lg"
            className="w-full gap-2"
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('payment.initiating')}
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                {t('payment.pay')} — {plan.priceXOF.toLocaleString()} XOF
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
