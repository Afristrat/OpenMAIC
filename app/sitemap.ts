import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://qalem.ma', lastModified: new Date() },
    { url: 'https://qalem.ma/features', lastModified: new Date() },
    { url: 'https://qalem.ma/institutions', lastModified: new Date() },
    { url: 'https://qalem.ma/pricing', lastModified: new Date() },
    { url: 'https://qalem.ma/legal/privacy', lastModified: new Date() },
    { url: 'https://qalem.ma/legal/terms', lastModified: new Date() },
  ];
}
