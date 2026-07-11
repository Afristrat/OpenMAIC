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

function escapeXml(value: string): string {
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
