/**
 * SCORM 1.2 manifest (imsmanifest.xml) generation.
 *
 * Standard IMS Content Packaging schema (imscp_rootv1p1p2 + adlcp_rootv1p2),
 * unchanged since the SCORM 1.2 spec (ADL, 2001) — the same shape every SCORM
 * 1.2 authoring tool (Articulate, iSpring, Moodle's own exporter) emits.
 * Referenced XSDs are declared for schema completeness but not bundled: LMS
 * SCORM parsers (Moodle included) validate structurally, not by fetching them.
 */

export interface ScormManifestOptions {
  identifier: string;
  title: string;
  launchUrl: string;
  resourceFiles: string[];
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildScorm12Manifest(options: ScormManifestOptions): string {
  const { identifier, title, launchUrl, resourceFiles } = options;
  const safeTitle = escapeXml(title);
  const fileTags = resourceFiles.map((f) => `      <file href="${escapeXml(f)}"/>`).join('\n');

  return `<?xml version="1.0" standalone="no" ?>
<manifest identifier="${escapeXml(identifier)}" version="1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="qalem_org">
    <organization identifier="qalem_org">
      <title>${safeTitle}</title>
      <item identifier="item_1" identifierref="resource_1">
        <title>${safeTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="resource_1" type="webcontent" adlcp:scormtype="sco" href="${escapeXml(launchUrl)}">
${fileTags}
    </resource>
  </resources>
</manifest>
`;
}

/**
 * SCORM 2004 4th Edition content aggregation manifest.
 *
 * Qalem deliberately emits one SCO without sequencing extensions: the shared
 * course viewer owns its scene navigation, while the LMS remains responsible
 * for launch and runtime tracking. This keeps the format difference confined
 * to the tracking adapter rather than duplicating pedagogical content.
 */
export function buildScorm2004Manifest(options: ScormManifestOptions): string {
  const { identifier, title, launchUrl, resourceFiles } = options;
  const safeTitle = escapeXml(title);
  const fileTags = resourceFiles.map((f) => `      <file href="${escapeXml(f)}"/>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeXml(identifier)}" version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd
                      http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  <organizations default="qalem_org">
    <organization identifier="qalem_org">
      <title>${safeTitle}</title>
      <item identifier="item_1" identifierref="resource_1">
        <title>${safeTitle}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="resource_1" type="webcontent" adlcp:scormType="sco" href="${escapeXml(launchUrl)}">
${fileTags}
    </resource>
  </resources>
</manifest>
`;
}
