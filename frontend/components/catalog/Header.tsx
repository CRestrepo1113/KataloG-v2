'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { AccessStatus, CompanyInfo, Customer } from '@/lib/types';
import {
  Phone,
  MapPin,
  ShoppingCart,
  Share2,
  Smartphone,
  User,
  History,
  Briefcase,
  ShieldCheck,
  Store,
  EyeOff,
  Clock,
  SlidersHorizontal,
} from 'lucide-react';
import { isAuthorizedAdminEmail } from '@/lib/auth';

interface HeaderProps {
  company: CompanyInfo;
  cartCount: number;
  onOpenCart: () => void;
  onOpenSocialModal?: () => void;
  customer?: Customer | null;
  accessStatus: AccessStatus | 'visitante';
  hasCartAccess: boolean;
  whiteLabelMode?: boolean;
  canToggleWhiteLabel?: boolean;
  onToggleWhiteLabel?: () => void;
  onOpenResellerSettings?: () => void;
  resellerBrandTitle?: string;
  onOpenCustomerAuth?: () => void;
  onOpenCustomerOrders?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  company,
  cartCount,
  onOpenCart,
  onOpenSocialModal,
  customer,
  accessStatus,
  hasCartAccess,
  whiteLabelMode = false,
  canToggleWhiteLabel = false,
  onToggleWhiteLabel,
  onOpenResellerSettings,
  resellerBrandTitle = 'Catálogo',
  onOpenCustomerAuth,
  onOpenCustomerOrders,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [, setLogoTapCount] = useState(0);

  const isCustomerAdmin = Boolean(
    !whiteLabelMode &&
      customer &&
      accessStatus === 'aprobado' &&
      (customer.rol === 'admin' ||
        customer.rol === 'superadmin' ||
        isAuthorizedAdminEmail(customer.email))
  );

  const handleLogoTap = () => {
    if (whiteLabelMode) return;
    setLogoTapCount((prev) => {
      const next = prev + 1;
      if (next >= 5) {
        window.location.href = '/admin/inventory';
        return 0;
      }
      return next;
    });
    setTimeout(() => setLogoTapCount(0), 2500);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);

      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') setDeferredPrompt(null);
    } else {
      alert(
        `Para instalar ${company.name}:\n• Android: Menú (⋮) -> "Instalar aplicación"\n• iPhone: Compartir -> "Añadir a inicio"`
      );
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
      {/* Barra superior corporativa: oculta totalmente en Modo Marca Blanca */}
      {!whiteLabelMode && (
        <div className="bg-[#3C5866] text-white py-1.5 px-3 sm:px-4 text-xs font-medium">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex items-center gap-1.5 font-bold text-[11px] sm:text-xs text-white shrink-0">
                <Phone className="w-3.5 h-3.5 text-[#FFF3CD] shrink-0" />
                <span>{company.phone}</span>
              </span>
              {company.address && (
                <span className="hidden md:flex items-center gap-1 text-xs text-slate-200 truncate">
                  <MapPin className="w-3.5 h-3.5 text-[#C37D41] shrink-0" />
                  {company.address}
                </span>
              )}
            </div>

            <span className="bg-[#C37D41] text-white px-2.5 py-0.5 rounded-full text-[10px] uppercase font-extrabold tracking-wider whitespace-nowrap">
              {company.country || 'Catálogo'}
            </span>
          </div>
        </div>
      )}

      {/* Main Header */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
        {whiteLabelMode ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#3C5866] text-[#FFF3CD] flex items-center justify-center font-black text-sm shrink-0">
              {resellerBrandTitle.charAt(0).toUpperCase()}
            </div>
            <span className="font-black text-base sm:text-lg text-[#3C5866] truncate">
              {resellerBrandTitle}
            </span>
          </div>
        ) : (
          <div
            onClick={handleLogoTap}
            className="flex items-center gap-2.5 sm:gap-3 min-w-0 cursor-pointer select-none"
            title={company.name}
          >
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0">
              <Image
                src={company.logoUrl || '/assets/Logo.png'}
                alt={company.name}
                fill
                className="object-contain"
                priority
              />
            </div>
            <div className="relative w-28 h-6 sm:w-40 sm:h-9">
              <Image
                src={company.nameLogoUrl || '/assets/Nombre.png'}
                alt={company.name}
                fill
                className="object-contain object-left"
                priority
              />
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Toggle Modo Marca Blanca (solo Emprendedor habilitado) */}
          {canToggleWhiteLabel && onToggleWhiteLabel && (
            <button
              type="button"
              onClick={onToggleWhiteLabel}
              className={`flex items-center gap-1.5 px-2.5 py-2 sm:px-3 rounded-2xl font-extrabold text-xs border transition-all cursor-pointer ${
                whiteLabelMode
                  ? 'bg-[#3C5866] text-white border-[#3C5866]'
                  : 'bg-white hover:bg-slate-50 text-[#3C5866] border-slate-200'
              }`}
              title={whiteLabelMode ? 'Volver a Vista KYG' : 'Activar Modo Cliente Sin Marca'}
            >
              <EyeOff className={`w-3.5 h-3.5 ${whiteLabelMode ? 'text-[#FFF3CD]' : 'text-[#C37D41]'}`} />
              <span className="hidden min-[520px]:inline">
                {whiteLabelMode ? 'Vista KYG' : 'Modo Cliente'}
              </span>
            </button>
          )}

          {whiteLabelMode && onOpenResellerSettings && (
            <button
              type="button"
              onClick={onOpenResellerSettings}
              className="flex items-center gap-1.5 bg-[#FFF3CD] hover:bg-[#ffeaa7] text-[#3C5866] border border-[#EBD89F] px-2.5 py-2 sm:px-3 rounded-2xl font-extrabold text-xs transition-all cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#C37D41]" />
              <span className="hidden sm:inline">Precios</span>
            </button>
          )}

          {!whiteLabelMode && !isStandalone && (
            <button
              type="button"
              onClick={handleInstallApp}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-[#3C5866] border border-slate-200 px-2.5 py-2 sm:px-3 rounded-2xl font-bold text-xs transition-all cursor-pointer"
              aria-label="Instalar App"
            >
              <Smartphone className="w-4 h-4 text-[#C37D41]" />
              <span className="hidden md:inline">Instalar</span>
            </button>
          )}

          {!whiteLabelMode && onOpenSocialModal && (
            <button
              type="button"
              onClick={onOpenSocialModal}
              className="flex items-center gap-1.5 bg-white hover:bg-slate-50 text-[#3C5866] border border-slate-200 px-2.5 py-2 sm:px-3 rounded-2xl font-bold text-xs transition-all cursor-pointer"
              aria-label="Contacto"
            >
              <Share2 className="w-4 h-4 text-[#C37D41]" />
              <span className="hidden sm:inline">Contacto</span>
            </button>
          )}

          {isCustomerAdmin && (
            <a
              href="/admin/inventory"
              className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 border border-amber-500 px-2.5 py-2 sm:px-3 rounded-2xl font-black text-xs transition-all cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="hidden min-[600px]:inline">Admin</span>
            </a>
          )}

          {/* Account / Orders / Auth */}
          {!whiteLabelMode && (
            customer ? (
              <button
                type="button"
                onClick={onOpenCustomerOrders}
                className={`flex items-center gap-1.5 border px-3 py-2 sm:px-3.5 rounded-2xl font-black text-xs transition-all cursor-pointer ${
                  accessStatus !== 'aprobado'
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
                    : customer.rol === 'vendedor'
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300'
                    : customer.rol === 'emprendedor'
                    ? 'bg-[#3C5866] hover:bg-[#263842] text-white border-[#3C5866]'
                    : 'bg-[#FFF3CD] hover:bg-[#ffeaa7] text-[#3C5866] border-[#EBD89F]'
                }`}
              >
                {accessStatus !== 'aprobado' ? (
                  <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                ) : customer.rol === 'vendedor' ? (
                  <Briefcase className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : customer.rol === 'emprendedor' ? (
                  <Store className="w-4 h-4 text-[#FFF3CD] shrink-0" />
                ) : (
                  <History className="w-4 h-4 text-[#C37D41] shrink-0" />
                )}
                <span className="hidden min-[520px]:inline max-w-[110px] truncate">
                  {customer.nombre.split(' ')[0]}
                </span>
                <span className="min-[520px]:hidden">
                  {accessStatus !== 'aprobado' ? 'Estado' : 'Cuenta'}
                </span>
              </button>
            ) : (
              onOpenCustomerAuth && (
                <button
                  type="button"
                  onClick={onOpenCustomerAuth}
                  className="flex items-center gap-1.5 bg-[#3C5866] hover:bg-[#263842] text-white px-3.5 py-2 rounded-2xl font-extrabold text-xs transition-all cursor-pointer"
                >
                  <User className="w-4 h-4 text-[#FFF3CD]" />
                  <span>Ingresar</span>
                </button>
              )
            )
          )}

          {/* Carrito: visible únicamente cuando tiene acceso a pedidos */}
          {hasCartAccess && (
            <button
              type="button"
              onClick={onOpenCart}
              className="relative flex items-center gap-1.5 bg-[#3C5866] hover:bg-[#263842] text-white px-3.5 py-2 rounded-2xl font-bold text-xs sm:text-sm transition-all cursor-pointer"
              aria-label="Carrito"
            >
              <ShoppingCart className="w-4 h-4 text-[#FFF3CD]" />
              <span className="hidden sm:inline">{whiteLabelMode ? 'Lista' : 'Carrito'}</span>
              {cartCount > 0 && (
                <span className="bg-[#C37D41] text-white text-[10px] font-black min-w-[18px] h-4.5 px-1 rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
