import { describe, it, expect } from 'vitest';
import { ommlToLatex } from '../src/serializer/mathSerializer';

const M = 'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
const omath = (inner: string) => `<m:oMath ${M}>${inner}</m:oMath>`;
const run = (text: string) => `<m:r><m:t>${text}</m:t></m:r>`;
const argument = (name: 'e' | 'sub' | 'sup' | 'deg', text: string) =>
  `<m:${name}>${run(text)}</m:${name}>`;

/**
 * 回归（auto-fix.md 坑表）：OMML → LaTeX 转换的 JS 兜底路径（ommlToLatex）。
 *
 * - 分数等基本结构要转成正确的 LaTeX 命令。
 * - 梯度/反向传播页用的 ∂(U+2202)/∇(U+2207)：早先因为不在 Greek 归一化范围 →
 *   泄漏成 lone surrogate，KaTeX 报错把源码渲染成红字。postProcessLatex 补了
 *   ∂→\partial、∇→\nabla 的兜底。
 */
describe('mathSerializer · ommlToLatex', () => {
  it('分数 m:f → \\frac{a}{b}', () => {
    const latex = ommlToLatex(
      omath(
        '<m:f><m:num><m:r><m:t>a</m:t></m:r></m:num><m:den><m:r><m:t>b</m:t></m:r></m:den></m:f>',
      ),
    );
    expect(latex).toBe('\\frac{a}{b}');
  });

  it('radical m:rad → racine carrée structurée', () => {
    const latex = ommlToLatex(
      omath(`<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr>${argument('e', 'x')}</m:rad>`),
    );
    expect(latex).toBe('\\sqrt{x}');
  });

  it('indice et exposant m:sSubSup restent attachés à la base', () => {
    const latex = ommlToLatex(
      omath(
        `<m:sSubSup>${argument('e', 'x')}${argument('sub', 'i')}${argument('sup', '2')}</m:sSubSup>`,
      ),
    );
    expect(latex).toContain('x');
    expect(latex).toContain('_{i}');
    expect(latex).toContain('^{2}');
  });

  it('matrice m:m conserve toutes les cellules', () => {
    const latex = ommlToLatex(
      omath(
        `<m:m><m:mr>${argument('e', 'a')}${argument('e', 'b')}</m:mr>` +
          `<m:mr>${argument('e', 'c')}${argument('e', 'd')}</m:mr></m:m>`,
      ),
    );
    expect(latex).toBe('a & b \\\\ c & d');
  });

  it('opérateur n-aire conserve le symbole et ses bornes', () => {
    const latex = ommlToLatex(
      omath(
        `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr>` +
          `${argument('sub', 'i')}${argument('sup', 'n')}${argument('e', 'x')}</m:nary>`,
      ),
    );
    expect(latex).toContain('\\sum');
    expect(latex).toContain('i');
    expect(latex).toContain('n');
    expect(latex).toContain('x');
  });

  it('∂ (U+2202) → \\partial（不泄漏原字符）', () => {
    const latex = ommlToLatex(omath('<m:r><m:t>\u2202</m:t></m:r>'));
    expect(latex).toContain('\\partial');
    expect(latex).not.toContain('\u2202');
  });

  it('∇ (U+2207) → \\nabla（不泄漏原字符）', () => {
    const latex = ommlToLatex(omath('<m:r><m:t>\u2207</m:t></m:r>'));
    expect(latex).toContain('\\nabla');
    expect(latex).not.toContain('\u2207');
  });
});
