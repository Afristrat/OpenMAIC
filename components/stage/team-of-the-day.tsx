'use client';

import { Users } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/lib/hooks/use-i18n';
import type { GeneratedAgentConfig } from '@/lib/types/stage';

export function TeamOfTheDay({
  agents,
}: {
  agents?: GeneratedAgentConfig[];
}): React.ReactElement | null {
  const { t } = useI18n();
  if (!agents?.length) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="hidden items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-2 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted sm:flex"
          aria-label={t('stage.teamOfTheDay')}
        >
          <Users className="size-4 text-primary" />
          {t('stage.teamOfTheDay')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <p className="mb-3 text-sm font-semibold">{t('stage.teamOfTheDay')}</p>
        <ul className="space-y-2" aria-label={t('stage.teamOfTheDay')}>
          {agents.map((agent) => (
            <li key={agent.id} className="flex items-center gap-2">
              <img src={agent.avatar} alt="" className="size-8 rounded-full object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{agent.name}</span>
              <span className="text-xs text-muted-foreground">{agent.role}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
