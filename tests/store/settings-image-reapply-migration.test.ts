import { describe, expect, it } from 'vitest';
import { migrateSettingsState } from '@/lib/store/settings';

describe('settings-storage migration v9', () => {
  it('re-runs the managed-provider selection for a browser stuck without images', () => {
    // État réel d'un navigateur bloqué : images coupées, fournisseur périmé, défaut déjà « consommé ».
    const migrated = migrateSettingsState(
      {
        autoConfigApplied: true,
        appliedImageDefaultProviderId: 'dgx',
        imageGenerationEnabled: false,
        imageProviderId: 'seedream',
        imageModelId: '',
      },
      8,
    ) as Record<string, unknown>;

    expect(migrated.autoConfigApplied).toBe(false);
    expect(migrated.appliedImageDefaultProviderId).toBe('');
  });

  it('leaves a browser already on v9 untouched', () => {
    const migrated = migrateSettingsState(
      { autoConfigApplied: true, appliedImageDefaultProviderId: 'dgx' },
      9,
    ) as Record<string, unknown>;

    expect(migrated.autoConfigApplied).toBe(true);
    expect(migrated.appliedImageDefaultProviderId).toBe('dgx');
  });
});
