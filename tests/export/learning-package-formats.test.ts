import { describe, expect, it } from 'vitest';
import {
  LEARNING_PACKAGE_FORMATS,
  learningPackageExtension,
} from '@/lib/export/use-export-learning-package';

describe('learning package export formats', () => {
  it('offers every LMS format backed by the durable export job API', () => {
    expect(LEARNING_PACKAGE_FORMATS).toEqual(['scorm12', 'scorm2004', 'cmi5']);
  });

  it.each([
    ['scorm12', 'scorm12.zip'],
    ['scorm2004', 'scorm2004.zip'],
    ['cmi5', 'cmi5.zip'],
  ] as const)('uses a truthful filename extension for %s', (format, extension) => {
    expect(learningPackageExtension(format)).toBe(extension);
  });
});
