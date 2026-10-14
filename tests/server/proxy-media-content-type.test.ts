import { describe, expect, it } from 'vitest';
import { resolveProxyContentType } from '@/lib/server/proxy-media-content-type';

describe('resolveProxyContentType', () => {
  it.each([
    ['image/png', 'image/png'],
    ['IMAGE/JPEG; charset=binary', 'image/jpeg'],
    ['video/webm', 'video/webm'],
    ['audio/mpeg', 'audio/mpeg'],
    ['font/woff2', 'font/woff2'],
    ['text/css; charset=utf-8', 'text/css'],
    ['image/svg+xml', 'image/svg+xml'],
  ])('autorise %s', (header, expected) => {
    expect(resolveProxyContentType(header, 'https://example.com/x')).toBe(expected);
  });

  it.each([
    'text/html',
    'text/html; charset=utf-8',
    'application/xhtml+xml',
    'application/xml',
    'text/xml',
    'application/pdf',
  ])('refuse %s', (header) => {
    expect(resolveProxyContentType(header, 'https://example.com/x.png')).toBeNull();
  });

  it('déduit le type du suffixe pour octet-stream ou un type absent', () => {
    expect(resolveProxyContentType('application/octet-stream', 'https://e.com/a/b.PNG?x=1')).toBe(
      'image/png',
    );
    expect(resolveProxyContentType(null, 'https://e.com/v.mp4')).toBe('video/mp4');
  });

  it('refuse octet-stream sans suffixe connu ou sur une URL invalide', () => {
    expect(resolveProxyContentType('application/octet-stream', 'https://e.com/file')).toBeNull();
    expect(resolveProxyContentType('application/octet-stream', 'https://e.com/x.html')).toBeNull();
    expect(resolveProxyContentType(null, 'pas une url')).toBeNull();
  });
});
