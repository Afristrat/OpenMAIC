import { describe, expect, it } from 'vitest';
import { chapterFileName } from '@/lib/export/mp4/chapter-file-name';

describe('chapterFileName', () => {
  it('numérote sur deux chiffres au moins et garde le titre lisible', () => {
    expect(chapterFileName(0, 5, 'Dire merci utilement')).toBe('01-Dire merci utilement.mp4');
    expect(chapterFileName(4, 5, 'Conclusion')).toBe('05-Conclusion.mp4');
  });

  it('élargit la numérotation quand le cours dépasse 99 scènes, pour que le tri suive l’ordre', () => {
    expect(chapterFileName(0, 120, 'Début')).toBe('001-Début.mp4');
    expect(chapterFileName(119, 120, 'Fin')).toBe('120-Fin.mp4');
  });

  it('retire les caractères interdits dans un nom de fichier', () => {
    expect(chapterFileName(1, 3, 'Q/R : « pourquoi ? » <ici> | là *')).toBe(
      '02-Q R « pourquoi » ici là.mp4',
    );
  });

  it('conserve l’arabe et les accents', () => {
    expect(chapterFileName(2, 3, 'مقدمة في الشكر')).toBe('03-مقدمة في الشكر.mp4');
    expect(chapterFileName(2, 3, 'Éléments à retenir')).toBe('03-Éléments à retenir.mp4');
  });

  it('retombe sur « chapitre-N » quand le titre est vide ou ne contient rien de lisible', () => {
    expect(chapterFileName(0, 3, null)).toBe('01-chapitre-1.mp4');
    expect(chapterFileName(1, 3, '   ')).toBe('02-chapitre-2.mp4');
    expect(chapterFileName(2, 3, '???')).toBe('03-chapitre-3.mp4');
  });

  it('borne la longueur du titre et retire les points ou espaces de fin', () => {
    const name = chapterFileName(0, 2, `${'a'.repeat(79)}. . .`);
    expect(name).toBe(`01-${'a'.repeat(79)}.mp4`);
    expect(name.length).toBeLessThan(100);
  });

  it('distingue deux scènes de même titre grâce au numéro', () => {
    expect(chapterFileName(0, 2, 'Quiz')).not.toBe(chapterFileName(1, 2, 'Quiz'));
  });
});
