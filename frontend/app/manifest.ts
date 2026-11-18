import type { MetadataRoute } from 'next';
import { fetchBranches } from '@/lib/firestore';

export const dynamic = 'force-static';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let branchShortcuts: any[] = [];
  try {
    const branches = await fetchBranches();
    branchShortcuts = branches
      .filter((b) => b.isActive !== false)
      .map((b) => ({
        name: `Catálogo ${b.name || b.country || b.slug}`,
        short_name: b.country || b.name || b.slug,
        description: `Ver catálogo de productos de ${b.name || b.country}`,
        url: `/v/${b.slug}`,
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      }));
  } catch (e) {
    console.error('Error fetching branches for manifest shortcuts:', e);
  }

  return {
    name: 'KataloG - Catálogo Digital',
    short_name: 'KataloG',
    description: 'Catálogo interactivo de productos - KataloG',
    start_url: '/v/costarica',
    scope: '/',
    display: 'standalone',
    background_color: '#3C5866',
    theme_color: '#3C5866',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: branchShortcuts,
  };
}
