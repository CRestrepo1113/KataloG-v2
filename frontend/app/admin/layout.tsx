import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'KataloG Admin',
    template: '%s | KataloG Admin',
  },
  description: 'Panel de Administración de Inventarios y Sucursales - KataloG',
  applicationName: 'KataloG Admin',
  manifest: '/manifest-admin.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KataloG Admin',
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
