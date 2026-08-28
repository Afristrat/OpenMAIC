import { describe, expect, it } from 'vitest';
import { buildScorm12Manifest, buildScorm2004Manifest } from '@/lib/export/scorm/imsmanifest';
import { trackingAdapters } from '@/lib/export/scorm/tracking-adapters';

describe('buildScorm12Manifest', () => {
  it('produces a manifest referencing the launch file, resource files and course title', () => {
    const xml = buildScorm12Manifest({
      identifier: 'com.qalem.export.stage-1',
      title: "Introduction à l'algèbre",
      launchUrl: 'index.html',
      resourceFiles: ['index.html', 'course.css'],
    });

    expect(xml).toContain('<?xml version="1.0" standalone="no" ?>');
    expect(xml).toContain('<schemaversion>1.2</schemaversion>');
    expect(xml).toContain('manifest identifier="com.qalem.export.stage-1"');
    expect(xml).toContain('adlcp:scormtype="sco" href="index.html"');
    expect(xml).toContain('<file href="index.html"/>');
    expect(xml).toContain('<file href="course.css"/>');
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
      resourceFiles: ['index.html', 'course.css'],
    });

    const opened = [...xml.matchAll(/<([a-zA-Z:]+)(?:\s[^>]*)?(?<!\/)>/g)].map((m) => m[1]);
    const closed = [...xml.matchAll(/<\/([a-zA-Z:]+)>/g)].map((m) => m[1]);
    expect(opened.sort()).toEqual(closed.sort());
  });

  it('produces a SCORM 2004 manifest with the 4th Edition metadata and LMS API contract', () => {
    const xml = buildScorm2004Manifest({
      identifier: 'com.qalem.export.stage-2004',
      title: 'Cours SCORM 2004',
      launchUrl: 'index.html',
      resourceFiles: ['index.html'],
    });

    expect(xml).toContain('<schemaversion>2004 4th Edition</schemaversion>');
    expect(xml).toContain('adlcp:scormType="sco"');
    expect(trackingAdapters.scorm2004.buildTrackingScript()).toContain("findApi('API_1484_11')");
    expect(trackingAdapters.scorm2004.buildTrackingScript()).toContain("api.Initialize('')");
  });

  it('produces a cmi5 course structure and a launch adapter that uses the one-time token fetch', () => {
    const xml = trackingAdapters.cmi5.buildManifest({
      identifier: 'com.qalem.export.stage-cmi5',
      title: 'Cours cmi5',
      description: 'Description cmi5',
      language: 'fr-FR',
      launchUrl: 'index.html',
      resourceFiles: ['index.html'],
    });
    const script = trackingAdapters.cmi5.buildTrackingScript();

    expect(xml).toContain(
      '<courseStructure xmlns="https://w3id.org/xapi/profiles/cmi5/v1/CourseStructure.xsd"',
    );
    expect(xml).toContain(
      '<course id="https://qalem.ma/exports/courses/com.qalem.export.stage-cmi5">',
    );
    expect(xml).toContain('<au ');
    expect(xml).toContain('moveOn="CompletedOrPassed"');
    expect(xml).toContain('<url>index.html</url>');
    expect(script).toContain("params.get('fetch')");
    expect(script).toContain("method: 'POST'");
    expect(script).toContain('http://adlnet.gov/expapi/verbs/initialized');
    expect(script).toContain('http://adlnet.gov/expapi/verbs/terminated');
  });
});
