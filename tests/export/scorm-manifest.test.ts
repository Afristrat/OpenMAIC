import { describe, expect, it } from 'vitest';
import { buildScorm12Manifest } from '@/lib/export/scorm/imsmanifest';

describe('buildScorm12Manifest', () => {
  it('produces a manifest referencing the launch file, resource files and course title', () => {
    const xml = buildScorm12Manifest({
      identifier: 'com.qalem.export.stage-1',
      title: 'Introduction à l\'algèbre',
      launchUrl: 'index.html',
      resourceFiles: ['index.html', 'scorm12.min.js'],
    });

    expect(xml).toContain('<?xml version="1.0" standalone="no" ?>');
    expect(xml).toContain('<schemaversion>1.2</schemaversion>');
    expect(xml).toContain('manifest identifier="com.qalem.export.stage-1"');
    expect(xml).toContain('adlcp:scormtype="sco" href="index.html"');
    expect(xml).toContain('<file href="index.html"/>');
    expect(xml).toContain('<file href="scorm12.min.js"/>');
    // XML-escaped, not raw — guards against a broken manifest on titles with apostrophes.
    expect(xml).toContain('Introduction à l&apos;algèbre');
  });

  it('escapes XML-significant characters in the title', () => {
    const xml = buildScorm12Manifest({
      identifier: 'com.qalem.export.stage-2',
      title: 'Tests <script> & "quotes"',
      launchUrl: 'index.html',
      resourceFiles: ['index.html'],
    });

    expect(xml).not.toContain('<script>');
    expect(xml).toContain('&lt;script&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;quotes&quot;');
  });

  it('is well-formed: every opening tag has a matching closing tag', () => {
    const xml = buildScorm12Manifest({
      identifier: 'com.qalem.export.stage-3',
      title: 'Cours de test',
      launchUrl: 'index.html',
      resourceFiles: ['index.html', 'scorm12.min.js'],
    });

    const opened = [...xml.matchAll(/<([a-zA-Z:]+)(?:\s[^>]*)?(?<!\/)>/g)].map((m) => m[1]);
    const closed = [...xml.matchAll(/<\/([a-zA-Z:]+)>/g)].map((m) => m[1]);
    expect(opened.sort()).toEqual(closed.sort());
  });
});
