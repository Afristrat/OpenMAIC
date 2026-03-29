'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/hooks/use-i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  LayoutTemplate,
  Stethoscope,
  Scale,
  Cpu,
  Landmark,
  GraduationCap,
  Factory,
} from 'lucide-react';
import type { ClassroomTemplate, OrgSector } from '@/lib/supabase/types';

// NOTE: We import Dialog* above — ensure your ui/dialog exports DialogContent, DialogHeader, DialogTitle, DialogTrigger.
// If not, the component uses a simpler overlay fallback.

interface TemplateSelectorProps {
  onSelect: (requirement: string, language: string) => void;
  sectorFilter?: OrgSector | null;
}

const SECTOR_ICONS: Record<string, typeof Stethoscope> = {
  healthcare: Stethoscope,
  legal: Scale,
  tech: Cpu,
  finance: Landmark,
  education: GraduationCap,
  industry: Factory,
};

const SECTOR_COLORS: Record<string, string> = {
  healthcare: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  legal: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  tech: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  finance: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  education: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  industry: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
};

export function TemplateSelector({ onSelect, sectorFilter }: TemplateSelectorProps) {
  const { t } = useI18n();
  const [templates, setTemplates] = useState<ClassroomTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchTemplates = useCallback(async () => {
    const supabase = createClient();
    let query = supabase.from('classroom_templates').select('*').order('sector').order('name');

    if (sectorFilter) {
      query = query.eq('sector', sectorFilter);
    }

    const { data, error } = await query;
    if (!error && data) {
      setTemplates(data);
    }
    setIsLoading(false);
  }, [sectorFilter]);

  /* eslint-disable react-hooks/set-state-in-effect -- Async data loading */
  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open, fetchTemplates]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSelect = (template: ClassroomTemplate) => {
    const reqs = template.requirements as Record<string, unknown>;
    const requirement = typeof reqs.requirement === 'string' ? reqs.requirement : '';
    onSelect(requirement, template.language);
    setOpen(false);
  };

  // Group templates by sector
  const grouped = templates.reduce<Record<string, ClassroomTemplate[]>>((acc, tpl) => {
    const key = tpl.sector;
    if (!acc[key]) acc[key] = [];
    acc[key].push(tpl);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <LayoutTemplate className="h-4 w-4" />
          {t('org.templates')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('org.templates')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('org.templates')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">{t('common.loading')}</p>
        ) : templates.length === 0 ? (
          <p className="py-8 text-center text-muted-foreground">{t('org.noTemplates')}</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([sector, sectorTemplates]) => {
              const SectorIcon = SECTOR_ICONS[sector] ?? LayoutTemplate;
              return (
                <div key={sector}>
                  <div className="mb-3 flex items-center gap-2">
                    <SectorIcon className="h-4 w-4" />
                    <h3 className="font-semibold">{t(`org.sectors.${sector}`)}</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sectorTemplates.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className="group rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-primary/5"
                        onClick={() => handleSelect(tpl)}
                      >
                        <div className="mb-2 flex items-start justify-between">
                          <h4 className="font-medium leading-tight">{tpl.name}</h4>
                          <Badge
                            className={`ml-2 shrink-0 text-xs ${SECTOR_COLORS[sector] ?? ''}`}
                          >
                            {tpl.language}
                          </Badge>
                        </div>
                        {tpl.description && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {tpl.description}
                          </p>
                        )}
                        <span className="mt-2 inline-block text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                          {t('org.useTemplate')}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
