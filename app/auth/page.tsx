'use client';

import { useState, Suspense, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { tryCreateClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { resolveAuthReturnPath } from '@/lib/auth/return-path';

function AuthPageContent(): React.ReactElement {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const returnPath = resolveAuthReturnPath(searchParams.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(
    inviteToken ? 'signup' : 'login',
  );

  const isRTL = locale === 'ar-MA';

  const supabaseAvailable = tryCreateClient() !== null;

  async function consumeInvitation(token: string): Promise<boolean> {
    const res = await fetch('/api/invitations/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    return res.ok;
  }

  async function handleEmailAuth(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const supabase = tryCreateClient();
      if (!supabase) return;

      if (activeTab === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) {
          setError(authError.message);
          return;
        }
        if (inviteToken && !(await consumeInvitation(inviteToken))) {
          setError(t('auth.invitationUnavailable'));
          return;
        }
      } else {
        if (!inviteToken) {
          setError(t('auth.invitationRequired'));
          return;
        }
        const signupResponse = await fetch('/api/invitations/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inviteToken, email, password }),
        });
        if (!signupResponse.ok) {
          setError(
            signupResponse.status === 409
              ? t('auth.accountAlreadyExists')
              : t('auth.invitationUnavailable'),
          );
          return;
        }
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) {
          setError(authError.message);
          return;
        }
      }

      router.push(returnPath);
    } catch {
      setError(t('auth.unexpectedError'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background px-4 py-12"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Qalem</h1>
          <p className="text-sm text-muted-foreground" dir={isRTL ? 'rtl' : 'ltr'}>
            {t('home.slogan')}
          </p>
        </div>

        {/* Auth Card */}
        {!supabaseAvailable ? (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm text-center space-y-4">
            <p className="text-muted-foreground">{t('auth.unavailable')}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v as 'login' | 'signup');
                setError('');
              }}
            >
              <TabsList className="w-full">
                <TabsTrigger value="login" className="flex-1">
                  {t('auth.login')}
                </TabsTrigger>
                {inviteToken && (
                  <TabsTrigger value="signup" className="flex-1">
                    {t('auth.signup')}
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="login" className="mt-6">
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t('auth.email')}</Label>
                    <Input
                      id="login-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">{t('auth.password')}</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="current-password"
                      dir="ltr"
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? t('auth.loggingIn') : t('auth.loginButton')}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">{t('auth.email')}</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoComplete="email"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">{t('auth.password')}</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                      minLength={6}
                      dir="ltr"
                    />
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? t('auth.signingUp') : t('auth.signupButton')}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            {!inviteToken && (
              <p className="text-center text-sm text-muted-foreground">
                {t('auth.invitationRequired')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AuthPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      }
    >
      <AuthPageContent />
    </Suspense>
  );
}
