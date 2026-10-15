import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fisher Healthcare Field Operations',
    short_name: 'Fisher Field',
    description: 'Foundation interface for authorized Fisher Healthcare field teams. No active assignments.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#241b50',
    icons: [{ src: '/field-icon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' }]
  };
}
