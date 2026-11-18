import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CompanyInfo, Branch, CustomerOrder } from '@/lib/types';
import { Package, Settings, LogOut, ExternalLink, Globe, Building2, Copy, Check, Crown, ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { NotificationControls } from './NotificationControls';

interface AdminHeaderProps {
  company: CompanyInfo;
  branches?: Branch[];
  currentBranchSlug?: string;
  orders?: CustomerOrder[];
  pendingRequestsCount?: number;
  onOpenOrdersTab?: () => void;
  onOpenCustomersTab?: () => void;
  onSelectBranch?: (slug: string) => void;
  onAddNewBranch?: () => void;
  onOpenBranchManager?: () => void;
  onLogout?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  company,
  branches = [],
  currentBranchSlug = 'default',
  orders = [],
  pendingRequestsCount = 0,
  onOpenOrdersTab,
  onOpenCustomersTab,
  onSelectBranch,
  onAddNewBranch,
  onOpenBranchManager,
  onLogout,
}) => {
  const pathname = usePathname();
  const { isSuperAdmin, canAccessBranch } = useAdminAuth();

  const currentBranch = branches.find((b) => b.slug === currentBranchSlug || b.id === currentBranchSlug);
  const effectiveSlug = currentBranchSlug && currentBranchSlug !== 'default' && currentBranchSlug !== 'main'
    ? currentBranchSlug
    : (branches[0]?.slug || 'costarica');
  const publicCatalogUrl = `/v/${effectiveSlug}`;

  const [copiedLink, setCopiedLink] = useState(false);

  const visibleBranches = branches.filter((b) => canAccessBranch(b.slug));

  const handleCopyCurrentBranchUrl = () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://katalog-lime.vercel.app';
    const url = `${origin}${publicCatalogUrl}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <header className="bg-[#3C5866] text-white shadow-md">
      <div className="max-w-7xl mx-auto px-3.5 sm:px-4 py-3 space-y-2.5 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
        {/* Brand & Mobile Actions */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 sm:w-9 sm:h-9 bg-white/10 rounded-xl p-1 shrink-0 border border-white/10 shadow-xs">
              <Image
                src={company.logoUrl || '/assets/Logo.png'}
                alt="KataloG"
                fill
                className="object-contain"
              />
            </div>
            <div className="flex items-center gap-2">
              <h1 className="font-black text-base sm:text-lg tracking-tight text-white leading-none">
                KataloG
              </h1>
              {isSuperAdmin ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-black text-[10px] tracking-wide shadow-xs border border-amber-300">
                  <Crown className="w-3 h-3 text-slate-950" />
                  SuperAdmin
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white/20 text-[#FFF3CD] font-bold text-[10px] tracking-wide border border-white/20">
                  <ShieldCheck className="w-3 h-3 text-[#FFF3CD]" />
                  Admin Sede
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:hidden">
            {/* Notificaciones en móvil */}
            <NotificationControls
              orders={orders}
              pendingRequestsCount={pendingRequestsCount}
              onOpenOrdersTab={onOpenOrdersTab}
              onOpenCustomersTab={onOpenCustomersTab}
            />

            {/* Logout on mobile */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                title="Cerrar Sesión"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Action Controls: Selector + Branch Manager + Public Catalog + Desktop Logout */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
          {visibleBranches.length > 0 && onSelectBranch && (
            <div className="flex-1 sm:flex-initial flex items-center gap-2 bg-white/10 px-3.5 py-1.5 rounded-2xl border border-white/20 min-w-0">
              <Building2 className="w-4 h-4 text-[#FFF3CD] shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[8.5px] text-slate-300 font-bold uppercase tracking-wider">
                  Sucursal activa:
                </span>
                {visibleBranches.length > 1 ? (
                  <select
                    value={currentBranchSlug}
                    onChange={(e) => onSelectBranch(e.target.value)}
                    className="bg-transparent text-white text-xs font-black focus:outline-none cursor-pointer pr-1 truncate"
                  >
                    {visibleBranches.map((b) => (
                      <option key={b.id || b.slug} value={b.slug} className="text-[#3C5866] font-bold">
                        {b.name} ({b.country || 'Internacional'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-white text-xs font-black truncate">
                    {visibleBranches[0]?.name || currentBranch?.name || 'Costa Rica'}
                  </span>
                )}
              </div>
            </div>
          )}

          {isSuperAdmin && onOpenBranchManager && (
            <button
              onClick={onOpenBranchManager}
              className="bg-[#C37D41] hover:bg-[#a86832] text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
              title="Administrar, editar o eliminar sucursales"
            >
              <Settings className="w-4 h-4 text-[#FFF3CD]" />
              <span className="hidden min-[480px]:inline">Gestionar Sucursales</span>
            </button>
          )}

          {/* Direct Link to Active Branch Public Catalog */}
          <Link
            href={publicCatalogUrl}
            target="_blank"
            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold px-3.5 py-2 rounded-xl transition-all shadow-sm active:scale-95 shrink-0"
          >
            <Globe className="w-4 h-4 text-[#FFF3CD]" />
            <span className="hidden min-[400px]:inline">Ver Catálogo</span>
            <ExternalLink className="w-3 h-3 opacity-80" />
          </Link>

          {/* Quick Copy Link for active branch */}
          <button
            onClick={handleCopyCurrentBranchUrl}
            className={`flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl transition-all shadow-sm active:scale-95 cursor-pointer shrink-0 ${
              copiedLink
                ? 'bg-emerald-500 text-white font-extrabold'
                : 'bg-white/10 hover:bg-white/20 border border-white/20 text-white'
            }`}
            title="Copiar enlace de esta sucursal para compartir con clientes"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-white" />
                <span className="hidden min-[500px]:inline">¡Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-[#FFF3CD]" />
                <span className="hidden min-[500px]:inline">Copiar Link</span>
              </>
            )}
          </button>

          {/* Notificaciones en escritorio */}
          <div className="hidden sm:block">
            <NotificationControls
              orders={orders}
              pendingRequestsCount={pendingRequestsCount}
              onOpenOrdersTab={onOpenOrdersTab}
              onOpenCustomersTab={onOpenCustomersTab}
            />
          </div>

          {onLogout && (
            <button
              onClick={onLogout}
              className="hidden sm:flex p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>


      {/* Sub-Header Indicator Strip */}
      <div className="bg-[#2c424e] px-4 py-2 border-t border-slate-700/60">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-2 text-[#FFF3CD]">
            <Package className="w-4 h-4 text-[#C37D41]" />
            <span>Inventario & Referencias Maestras</span>
          </div>

          <div className="text-[11px] text-slate-300 font-semibold">
            Sucursal: <span className="text-white font-extrabold">{company.name}</span> ({currentBranch?.country || company.country || 'Internacional'})
          </div>
        </div>
      </div>
    </header>
  );
};
