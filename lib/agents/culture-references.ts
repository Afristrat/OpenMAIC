/**
 * Versioned cultural-reference registry.
 *
 * These proposals are deliberately inert until an organization administrator
 * approves this exact version. Arabic labels preserve the native spelling and
 * retain a Moroccan-friendly Latin rendering for review and accessibility.
 */
export const CULTURE_REFERENCE_VERSION = '2026-07-27';

export type CultureReferenceCode = 'ma-fr' | 'ma-ar' | 'en';
export type CultureReferenceGender = 'female' | 'male';

export interface CulturalFirstName {
  display: string;
  romanized?: string;
  gender: CultureReferenceGender;
}

export interface CultureReference {
  code: CultureReferenceCode;
  status: 'pending-human-approval';
  names: readonly CulturalFirstName[];
}

const maFrMale = [
  'Adam',
  'Amine',
  'Anas',
  'Ayoub',
  'Hamza',
  'Ilyas',
  'Ismaïl',
  'Karim',
  'Mehdi',
  'Nabil',
  'Omar',
  'Rayan',
  'Reda',
  'Saad',
  'Sami',
  'Soufiane',
  'Yassine',
  'Younes',
  'Zakaria',
  'Zayd',
] as const;
const maFrFemale = [
  'Aïcha',
  'Amal',
  'Asma',
  'Aya',
  'Chaïma',
  'Dounia',
  'Farah',
  'Hajar',
  'Hanae',
  'Imane',
  'Kenza',
  'Lamia',
  'Lina',
  'Malak',
  'Maryam',
  'Marwa',
  'Nada',
  'Salma',
  'Sara',
  'Yasmine',
] as const;
const enMale = [
  'Oliver',
  'George',
  'Arthur',
  'Noah',
  'Leo',
  'Theodore',
  'Oscar',
  'Archie',
  'Henry',
  'Freddie',
  'Jack',
  'Charlie',
  'Thomas',
  'William',
  'Finley',
  'Alfie',
  'Lucas',
  'Alexander',
  'James',
  'Isaac',
] as const;
const enFemale = [
  'Olivia',
  'Amelia',
  'Isla',
  'Lily',
  'Freya',
  'Ivy',
  'Ava',
  'Mia',
  'Grace',
  'Sophia',
  'Ella',
  'Charlotte',
  'Rosie',
  'Sophie',
  'Evie',
  'Florence',
  'Willow',
  'Poppy',
  'Elsie',
  'Alice',
] as const;

function latinNames(
  male: readonly string[],
  female: readonly string[],
): readonly CulturalFirstName[] {
  return [
    ...male.map((display) => ({ display, gender: 'male' as const })),
    ...female.map((display) => ({ display, gender: 'female' as const })),
  ];
}

function arabicNames(
  male: readonly [string, string][],
  female: readonly [string, string][],
): readonly CulturalFirstName[] {
  return [
    ...male.map(([display, romanized]) => ({ display, romanized, gender: 'male' as const })),
    ...female.map(([display, romanized]) => ({ display, romanized, gender: 'female' as const })),
  ];
}

export const CULTURE_REFERENCES: readonly CultureReference[] = [
  { code: 'ma-fr', status: 'pending-human-approval', names: latinNames(maFrMale, maFrFemale) },
  {
    code: 'ma-ar',
    status: 'pending-human-approval',
    names: arabicNames(
      [
        ['آدم', 'Adam'],
        ['أمين', 'Amine'],
        ['أنس', 'Anas'],
        ['أيوب', 'Ayoub'],
        ['حمزة', 'Hamza'],
        ['إلياس', 'Ilyas'],
        ['إسماعيل', 'Ismaïl'],
        ['كريم', 'Karim'],
        ['مهدي', 'Mehdi'],
        ['نبيل', 'Nabil'],
        ['عمر', 'Omar'],
        ['ريان', 'Rayan'],
        ['رضا', 'Reda'],
        ['سعد', 'Saad'],
        ['سامي', 'Sami'],
        ['سفيان', 'Soufiane'],
        ['ياسين', 'Yassine'],
        ['يونس', 'Younes'],
        ['زكرياء', 'Zakaria'],
        ['زيد', 'Zayd'],
      ],
      [
        ['عائشة', 'Aïcha'],
        ['أمل', 'Amal'],
        ['أسماء', 'Asma'],
        ['آية', 'Aya'],
        ['شيماء', 'Chaïma'],
        ['دنيا', 'Dounia'],
        ['فرح', 'Farah'],
        ['هاجر', 'Hajar'],
        ['هناء', 'Hanae'],
        ['إيمان', 'Imane'],
        ['كنزة', 'Kenza'],
        ['لمياء', 'Lamia'],
        ['لينا', 'Lina'],
        ['ملاك', 'Malak'],
        ['مريم', 'Maryam'],
        ['مروة', 'Marwa'],
        ['ندى', 'Nada'],
        ['سلمى', 'Salma'],
        ['سارة', 'Sara'],
        ['ياسمين', 'Yasmine'],
      ],
    ),
  },
  { code: 'en', status: 'pending-human-approval', names: latinNames(enMale, enFemale) },
];

export function getCultureReference(code: string): CultureReference {
  return CULTURE_REFERENCES.find((reference) => reference.code === code) ?? CULTURE_REFERENCES[0];
}

export function resolveCultureReference(culture: string): CultureReference {
  return getCultureReference(culture);
}

export function getCultureNames(
  code: string,
  gender: CultureReferenceGender,
): readonly CulturalFirstName[] {
  return getCultureReference(code).names.filter((name) => name.gender === gender);
}
