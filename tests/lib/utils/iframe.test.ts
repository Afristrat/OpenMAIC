import { describe, expect, it } from 'vitest';
import { IFRAME_CSP, patchHtmlForIframe } from '@/lib/utils/iframe';

describe('patchHtmlForIframe', () => {
  it('injects the storage shim and sizing CSS after <head>', () => {
    const out = patchHtmlForIframe(
      '<!DOCTYPE html><html><head><title>t</title></head><body></body></html>',
    );
    expect(out).toContain('data-iframe-storage-shim');
    expect(out).toContain('data-iframe-patch');
  });

  it('runs the storage shim before the page scripts', () => {
    const html =
      '<!DOCTYPE html><html><head><script>window.__x = localStorage.getItem("k");</script></head><body></body></html>';
    const out = patchHtmlForIframe(html);
    // The shim must appear before the page's own <script> so storage is safe by then.
    expect(out.indexOf('data-iframe-storage-shim')).toBeLessThan(out.indexOf('window.__x'));
  });

  it('the shim provides a working in-memory storage when the real one throws', () => {
    // Execute the injected shim against a fake window whose localStorage getter
    // throws (mirroring a null-origin sandboxed iframe), then assert the shim
    // installed a usable in-memory store.
    const out = patchHtmlForIframe('<html><head></head><body></body></html>');
    const shim = out.match(/<script data-iframe-storage-shim>([\s\S]*?)<\/script>/)?.[1];
    expect(shim).toBeTruthy();

    const win: Record<string, unknown> = {};
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('sandboxed');
      },
    });
    Object.defineProperty(win, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('sandboxed');
      },
    });
    new Function('window', shim as string)(win);

    const ls = win.localStorage as Storage;
    expect(ls.getItem('missing')).toBeNull();
    ls.setItem('a', '1');
    expect(ls.getItem('a')).toBe('1');
    expect(ls.length).toBe(1);
    ls.removeItem('a');
    expect(ls.getItem('a')).toBeNull();
  });

  it('falls back to prepending when there is no <head>', () => {
    const out = patchHtmlForIframe('<div>no head</div>');
    // The CSP leads the prepended block, then the error-capture shim.
    expect(out.startsWith('\n<meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(out.indexOf('data-iframe-error-shim')).toBeGreaterThan(out.indexOf('Security-Policy'));
    expect(out.endsWith('<div>no head</div>')).toBe(true);
  });

  describe('contournements de l’injection de la CSP', () => {
    const cspIdx = (out: string) => out.indexOf('http-equiv="Content-Security-Policy"');

    it('injecte la CSP avant un script malgré un <head> placé dans un commentaire', () => {
      const out = patchHtmlForIframe('<!-- <head> --><script>evil()</script><head></head>');
      expect(cspIdx(out)).toBeGreaterThan(-1);
      expect(cspIdx(out)).toBeLessThan(out.indexOf('evil()'));
      // Hors du commentaire : rien du document d'origine ne précède la CSP.
      expect(out.slice(0, cspIdx(out))).not.toContain('<!--');
    });

    it('injecte la CSP avant un script malgré un <head> dans une chaîne JavaScript', () => {
      const out = patchHtmlForIframe('<script>evil(); var s = "<head>";</script><body></body>');
      expect(cspIdx(out)).toBeLessThan(out.indexOf('evil()'));
    });

    it('injecte la CSP avant un script malgré un <head ...> factice dans un commentaire', () => {
      const out = patchHtmlForIframe('<!-- <head class="x"> --><script>evil()</script>');
      expect(cspIdx(out)).toBeLessThan(out.indexOf('evil()'));
      expect(out.slice(0, cspIdx(out))).not.toContain('<!--');
    });

    it('garde le doctype en tête (mode standard) et injecte juste après', () => {
      const out = patchHtmlForIframe('<!DOCTYPE html><html><head></head><body>x</body></html>');
      expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(cspIdx(out)).toBeGreaterThan(out.indexOf('<!DOCTYPE html>'));
      expect(out.indexOf('<html>')).toBeGreaterThan(cspIdx(out));
    });

    it('ne prend pas un faux doctype dans un commentaire pour le vrai', () => {
      const out = patchHtmlForIframe('<!-- <!DOCTYPE html> --><script>evil()</script>');
      expect(cspIdx(out)).toBeLessThan(out.indexOf('evil()'));
    });

    it('conserve la totalité du document d’origine', () => {
      const html =
        '<!doctype html><html lang="fr"><head><title>t</title></head><body>é</body></html>';
      const out = patchHtmlForIframe(html);
      expect(out.replace(/\n<meta[\s\S]*?<\/style>/, '')).toBe(html);
    });
  });

  describe('Content-Security-Policy', () => {
    const directives = (csp: string): Record<string, string[]> =>
      Object.fromEntries(
        csp
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean)
          .map((d) => {
            const [name, ...values] = d.split(/\s+/);
            return [name, values];
          }),
      );

    it('injects a CSP meta before every script (shims and page scripts)', () => {
      const out = patchHtmlForIframe(
        '<!DOCTYPE html><html><head><script>boom()</script></head><body></body></html>',
      );
      const metaIdx = out.indexOf('http-equiv="Content-Security-Policy"');
      expect(metaIdx).toBeGreaterThan(-1);
      expect(metaIdx).toBeLessThan(out.indexOf('data-iframe-error-shim'));
      expect(metaIdx).toBeLessThan(out.indexOf('data-iframe-storage-shim'));
      expect(metaIdx).toBeLessThan(out.indexOf('boom()'));
    });

    it('injects the CSP before the document, keeping <head> attributes intact', () => {
      const out = patchHtmlForIframe('<html><head lang="fr"><title>t</title></head></html>');
      expect(out.indexOf('Security-Policy')).toBeLessThan(out.indexOf('<head lang="fr">'));
      expect(out).toContain('<head lang="fr"><title>t</title></head>');
    });

    it('is a single well-formed meta tag whose content has no double quote', () => {
      expect(IFRAME_CSP).not.toContain('"');
      const out = patchHtmlForIframe('<html><head></head></html>');
      expect(out).toContain(`<meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}">`);
      expect(out.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1);
    });

    it('denies by default and blocks forms, frames, base and plugins', () => {
      const d = directives(IFRAME_CSP);
      expect(d['default-src']).toEqual(["'none'"]);
      expect(d['form-action']).toEqual(["'none'"]);
      expect(d['frame-src']).toEqual(["'none'"]);
      expect(d['base-uri']).toEqual(["'none'"]);
      expect(d['object-src']).toEqual(["'none'"]);
    });

    it('limits network access (connect-src) to the Pyodide CDN, no wildcard', () => {
      const d = directives(IFRAME_CSP);
      expect(d['connect-src']).toEqual(['https://cdn.jsdelivr.net']);
    });

    it('allows only the CDNs used by the generation prompts for scripts', () => {
      const d = directives(IFRAME_CSP);
      for (const host of [
        'https://cdn.jsdelivr.net',
        'https://unpkg.com',
        'https://cdnjs.cloudflare.com',
        'https://cdn.tailwindcss.com',
      ]) {
        expect(d['script-src']).toContain(host);
      }
      expect(d['script-src']).toContain("'unsafe-inline'");
      for (const name of ['script-src', 'style-src', 'font-src', 'img-src', 'connect-src']) {
        expect(d[name]).not.toContain('*');
        expect(d[name]).not.toContain('https:');
        expect(d[name]).not.toContain('http:');
      }
    });

    it('does not allow remote images (no GET-beacon exfiltration channel)', () => {
      const d = directives(IFRAME_CSP);
      expect(d['img-src']).toEqual(['data:', 'blob:']);
    });

    it('lets the KaTeX stylesheet and fonts load from the jsdelivr CDN', () => {
      const d = directives(IFRAME_CSP);
      expect(d['style-src']).toContain('https://cdn.jsdelivr.net');
      expect(d['style-src']).toContain("'unsafe-inline'");
      expect(d['font-src']).toContain('https://cdn.jsdelivr.net');
    });
  });

  it('injects the error-capture shim before the storage shim and page scripts', () => {
    const html = '<!DOCTYPE html><html><head><script>boom()</script></head><body></body></html>';
    const out = patchHtmlForIframe(html);
    expect(out).toContain('data-iframe-error-shim');
    // error shim runs first → before storage shim → before page scripts, so it
    // catches errors from everything that follows.
    expect(out.indexOf('data-iframe-error-shim')).toBeLessThan(
      out.indexOf('data-iframe-storage-shim'),
    );
    expect(out.indexOf('data-iframe-storage-shim')).toBeLessThan(out.indexOf('boom()'));
  });

  it('the error shim posts runtime errors (onerror / resource / rejection / console.error) to the parent', () => {
    const out = patchHtmlForIframe('<html><head></head><body></body></html>');
    const shim = out.match(/<script data-iframe-error-shim>([\s\S]*?)<\/script>/)?.[1];
    expect(shim).toBeTruthy();

    const posts: Array<[Record<string, unknown>, string]> = [];
    const handlers: Record<string, (e: unknown) => void> = {};
    const win = {
      parent: { postMessage: (m: Record<string, unknown>, o: string) => posts.push([m, o]) },
      addEventListener: (t: string, cb: (e: unknown) => void) => {
        handlers[t] = cb;
      },
      console: { error: (..._args: unknown[]) => {} },
    };
    new Function('window', shim as string)(win);

    handlers.error({ message: 'JSON.parse boom', filename: 'p.html', lineno: 12 });
    expect(posts[0][0]).toMatchObject({ kind: 'runtime-error', errorKind: 'error' });
    expect(posts[0][0].message).toContain('JSON.parse boom');
    expect(posts[0][1]).toBe('*');

    handlers.error({ target: { src: 'https://cdn/katex.js' } });
    expect(String(posts[1][0].message)).toContain('Failed to load resource');

    handlers.unhandledrejection({ reason: { message: 'rej' } });
    expect(posts[2][0]).toMatchObject({ errorKind: 'unhandledrejection' });

    win.console.error('console boom');
    expect(posts[3][0]).toMatchObject({ errorKind: 'console.error' });
    expect(String(posts[3][0].message)).toContain('console boom');
  });

  it('the error shim buffers errors and re-emits them on a parent replay request', () => {
    // Guards the subscribe-after-insert race: a page that throws synchronously
    // while srcDoc parses may post before the parent subscribes. The shim must
    // re-emit the whole buffer when the parent asks, so nothing is lost.
    const out = patchHtmlForIframe('<html><head></head><body></body></html>');
    const shim = out.match(/<script data-iframe-error-shim>([\s\S]*?)<\/script>/)?.[1];
    const posts: Array<[Record<string, unknown>, string]> = [];
    const handlers: Record<string, (e: unknown) => void> = {};
    const win = {
      parent: { postMessage: (m: Record<string, unknown>, o: string) => posts.push([m, o]) },
      addEventListener: (t: string, cb: (e: unknown) => void) => {
        handlers[t] = cb;
      },
      console: { error: (..._args: unknown[]) => {} },
    };
    new Function('window', shim as string)(win);

    // Two errors fire "before the parent subscribed".
    handlers.error({ message: 'first boom' });
    handlers.unhandledrejection({ reason: { message: 'second boom' } });
    expect(posts).toHaveLength(2);

    // Parent now subscribes and requests a replay.
    handlers.message({ data: { __maicErrorReplayRequest: true } });
    expect(posts).toHaveLength(4);
    expect(String(posts[2][0].message)).toContain('first boom');
    expect(String(posts[3][0].message)).toContain('second boom');
    expect(posts[2][0]).toMatchObject({ kind: 'runtime-error', errorKind: 'error' });

    // An unrelated message must NOT trigger a replay.
    handlers.message({ data: { foo: 1 } });
    expect(posts).toHaveLength(4);
  });
});
