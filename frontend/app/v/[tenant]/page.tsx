import React from 'react';
import type { Metadata } from 'next';
import { TenantCatalogClient } from '@/components/catalog/TenantCatalogClient';
import { fetchBranches } from '@/lib/firestore';

export async function generateStaticParams() {
  const defaults = [
    { tenant: 'costarica' },
    { tenant: 'costa-rica' },
    { tenant: 'mexico' },
    { tenant: 'colombia' },
    { tenant: 'honduras' },
    { tenant: 'panama' },
    { tenant: 'guatemala' },
    { tenant: 'default' },
    { tenant: 'all' },
  ];
  try {
    const branches = await fetchBranches();
    const branchSlugs = branches
      .filter((b) => b.slug)
      .map((b) => ({ tenant: b.slug }));
    const combined = [...defaults, ...branchSlugs];
    const unique = Array.from(new Set(combined.map((item) => item.tenant))).map((t) => ({ tenant: t }));
    return unique;
  } catch {
    return defaults;
  }
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const rawSlug = resolvedParams?.tenant || 'default';
  const tenantSlug = rawSlug === 'costa-rica' ? 'costarica' : rawSlug;

  let title = 'KataloG - Catálogo Digital';
  try {
    const branches = await fetchBranches();
    const branch = branches.find(
      (b) => b.slug === tenantSlug || b.slug === rawSlug || b.id === tenantSlug
    );
    if (branch) {
      const countryStr = branch.country ? ` (${branch.country.toUpperCase()})` : '';
      title = `${branch.name || 'KataloG'}${countryStr}`;
    }
  } catch (error) {
    console.error('Error generating tenant metadata:', error);
  }

  return {
    title,
    applicationName: title,
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title,
    },
  };
}

export default function DynamicTenantCatalogPage() {
  return <TenantCatalogClient />;
}
