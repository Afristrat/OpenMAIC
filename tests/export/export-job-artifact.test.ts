import { describe, expect, it } from 'vitest';
import { exportJobArtifactPath } from '@/lib/export/export-job-artifact';

describe('exportJobArtifactPath', () => {
  it.each([
    ['mp4', 'stage/job.mp4'],
    ['scorm12', 'stage/job.scorm12.zip'],
    ['scorm2004', 'stage/job.scorm2004.zip'],
    ['cmi5', 'stage/job.cmi5.zip'],
  ] as const)('uses the worker path convention for %s', (format, expected) => {
    expect(exportJobArtifactPath('stage', 'job', format)).toBe(expected);
  });
});
