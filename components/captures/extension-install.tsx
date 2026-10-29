'use client';

import { Download, EyeOff, ListChecks, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { ExtensionStatus } from '@/lib/capture/bridge-client';
import { EXTENSION_DOWNLOAD_PATH, EXTENSION_RELEASE } from '@/lib/capture/extension-release';

const STEPS = ['download', 'open', 'load', 'back'] as const;
const BENEFITS = [
  { key: 'faithful', Icon: ListChecks },
  { key: 'control', Icon: ShieldCheck },
  { key: 'discreet', Icon: EyeOff },
] as const;

/**
 * Guide d'installation de l'extension de capture. Déplié tant que l'extension est absente ou trop
 * ancienne ; replié derrière « Réinstaller ou mettre à jour » une fois détectée.
 */
export function ExtensionInstall({
  status,
}: {
  status: ExtensionStatus | null;
}): React.ReactElement | null {
  const { t, locale } = useI18n();
  if (!status) return null;

  const installed = status.state === 'present';
  const sizeMb = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    EXTENSION_RELEASE.sizeBytes / 1_000_000,
  );
  const vars = {
    version: EXTENSION_RELEASE.version,
    minChrome: String(EXTENSION_RELEASE.minChrome),
  };

  const content = (
    <div className="space-y-6">
      {!installed && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {status.state === 'outdated'
              ? t('captures.install.titleOutdated', vars)
              : t('captures.install.title')}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
            {t('captures.install.lead')}
          </p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-3">
        {BENEFITS.map(({ key, Icon }) => (
          <li key={key} className="flex gap-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-purple-600" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {t(`captures.install.benefit.${key}.title`)}
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                {t(`captures.install.benefit.${key}.body`)}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-4">
        <a
          href={EXTENSION_DOWNLOAD_PATH}
          download
          className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        >
          <Download className="size-4" aria-hidden />
          {t('captures.install.download', vars)}
        </a>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('captures.install.size', { size: sizeMb })}
        </p>
      </div>

      <ol className="space-y-3">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-semibold text-purple-700 dark:bg-purple-950 dark:text-purple-300"
            >
              {index + 1}
            </span>
            <div className="text-sm">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {t(`captures.install.step.${step}.title`)}
              </p>
              <p className="mt-0.5 text-gray-600 dark:text-gray-300">
                {t(`captures.install.step.${step}.body`)}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <div className="space-y-2 rounded-lg bg-gray-50 p-4 text-xs text-gray-600 dark:bg-gray-950 dark:text-gray-300">
        <p>{t('captures.install.compat', vars)}</p>
        <p>{t('captures.install.sending')}</p>
        <p>
          {t('captures.install.checksum')}{' '}
          <code dir="ltr" className="break-all font-mono">
            {EXTENSION_RELEASE.sha256}
          </code>
        </p>
      </div>
    </div>
  );

  return installed ? (
    <details className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <summary className="cursor-pointer text-sm font-medium text-gray-900 dark:text-gray-100">
        {t('captures.install.reinstall')}
      </summary>
      <div className="mt-4">{content}</div>
    </details>
  ) : (
    <section
      aria-label={t('captures.install.title')}
      className="rounded-xl border border-purple-200 bg-white p-6 dark:border-purple-900 dark:bg-gray-900"
    >
      {content}
    </section>
  );
}
