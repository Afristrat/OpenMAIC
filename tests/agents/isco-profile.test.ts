import { describe, expect, it } from 'vitest';
import {
  buildOccupationalProfile,
  buildSpecialistPersona,
  parseIscoTasks,
} from '@/lib/agents/isco-profile';

const unitGroupDescription = `Accountants plan and administer accounting systems.
Tasks include -
(a) advising on and installing budgetary systems;
(b) preparing and certifying financial statements;
(c) preparing tax returns and advising on taxation problems.
Examples of the occupations classified here:
- Accountant
- Auditor`;

describe('ISCO-08 occupational grounding', () => {
  it('extracts only the official task list from an ISCO unit-group description', () => {
    expect(parseIscoTasks(unitGroupDescription)).toEqual([
      'advising on and installing budgetary systems',
      'preparing and certifying financial statements',
      'preparing tax returns and advising on taxation problems',
    ]);
  });

  it('builds a bounded immutable profile from occupation and unit-group resources', () => {
    const profile = buildOccupationalProfile({
      iscoCode: '2411',
      iscoUri: 'http://data.europa.eu/esco/isco/C2411',
      unitGroup: {
        title: 'Accountants',
        description: { en: { literal: unitGroupDescription } },
      },
      occupation: {
        uri: 'http://data.europa.eu/esco/occupation/accountant',
        title: 'accountant',
        description: { en: { literal: 'Reviews financial statements and budgets.' } },
        _links: {
          hasEssentialSkill: [
            { title: 'prepare financial statements' },
            { title: 'prepare financial statements' },
            { title: 'analyse financial risk' },
          ],
          hasEssentialKnowledge: [{ title: 'accounting techniques' }],
        },
      },
    });

    expect(profile).toMatchObject({
      standard: 'ISCO-08',
      unitGroupCode: '2411',
      unitGroupTitle: 'Accountants',
      essentialSkills: ['prepare financial statements', 'analyse financial risk'],
      knowledge: ['accounting techniques'],
    });
    expect(profile?.tasks).toHaveLength(3);
    expect(profile?.sourceUrl).toBe('https://isco.ilo.org/en/isco-08/');
  });

  it('refuses a decorative specialist when no official ISCO tasks are available', () => {
    expect(
      buildOccupationalProfile({
        iscoCode: '2411',
        iscoUri: 'http://data.europa.eu/esco/isco/C2411',
        unitGroup: { title: 'Accountants', description: { en: { literal: 'No tasks.' } } },
        occupation: {
          uri: 'http://data.europa.eu/esco/occupation/accountant',
          description: { en: { literal: 'Reviews financial statements.' } },
        },
      }),
    ).toBeNull();
  });

  it('keeps the pedagogical role separate from the verified occupational scope', () => {
    const persona = buildSpecialistPersona({
      name: 'Nadia',
      occupationTitle: 'comptable',
      reason: 'Relier le budget aux décisions de trésorerie',
      profile: {
        standard: 'ISCO-08',
        unitGroupCode: '2411',
        unitGroupTitle: 'Cadres comptables',
        occupationDescription: 'Analyse les documents financiers.',
        tasks: ['préparer des états financiers'],
        essentialSkills: ['analyser le risque financier'],
        knowledge: ['techniques comptables'],
        iscoUri: 'http://data.europa.eu/esco/isco/C2411',
        occupationUri: 'http://data.europa.eu/esco/occupation/accountant',
        sourceUrl: 'https://isco.ilo.org/en/isco-08/',
      },
    });

    expect(persona).toContain('ISCO-08 unit group 2411');
    expect(persona).toContain('Do not imitate the permanent pedagogical personas');
    expect(persona).toContain('Never turn the training exchange into personalized consulting');
  });
});
