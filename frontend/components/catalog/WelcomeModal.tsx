'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  LayoutGrid,
  GalleryHorizontal,
  ArrowRight,
  X,
  User,
  Lock,
  MessageCircle,
  Clock,
} from 'lucide-react';
import { AccessStatus, CompanyInfo, Customer, PriceList, PriceTier } from '@/lib/types';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyInfo;
  visiblePriceLists: PriceList[];
  currentTier: PriceTier;
  onSelectTier: (tier: PriceTier) => void;
  viewMode: 'grid' | 'carousel';
  onSelectViewMode: (mode: 'grid' | 'carousel') => void;
  customer?: Customer | null;
  accessStatus: AccessStatus | 'visitante';
  hasPriceAccess: boolean;
  whiteLabelMode?: boolean;
  resellerBrandTitle?: string;
  onOpenAccount?: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  company,
  visiblePriceLists,
  currentTier,
  onSelectTier,
  viewMode,
  onSelectViewMode,
  customer,
  accessStatus,
  hasPriceAccess,
  whiteLabelMode = false,
  resellerBrandTitle = 'Catálogo',
  onOpenAccount,
}) => {
  const [selectedTier, setSelectedTier] = useState<PriceTier>(currentTier);
  const [selectedView, setSelectedView] = useState<'grid' | 'carousel'>(viewMode);

  useEffect(() => {
    setSelectedTier(currentTier);
  }, [currentTier]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (hasPriceAccess && selectedTier) {
      onSelectTier(selectedTier);
    }
    onSelectViewMode(selectedView);
    onClose();
  };

  const handleOpenAccountClick = () => {
    onSelectViewMode(selectedView);
    if (onOpenAccount) {
      onOpenAccount();
    } else {
      onClose();
    }
  };

  const cleanWaPhone = (company.phone || '').replace(/[^0-9]/g, '');
  const salesWhatsappUrl = cleanWaPhone
    ? `https://api.whatsapp.com/send/?phone=${cleanWaPhone}&text=${encodeURIComponent(
        `¡Hola! Acabo de registrarme en el catálogo de ${company.name} y quisiera activar mi acceso a precios.`
      )}`
    : '';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 my-auto">
        <button
          type="button"
          onClick={handleConfirm}
          className="absolute top-4 right-4 z-20 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          aria-label="Cerrar"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="px-6 pt-7 pb-6 flex flex-col items-center text-center space-y-4">
          {!whiteLabelMode ? (
            <>
              <div className="relative w-16 h-16 flex items-center justify-center">
                <Image
                  src={company.logoUrl || '/assets/Logo.png'}
                  alt={company.name}
                  fill
                  className="object-contain"
                  priority
                />
              </div>
              <span className="text-[11px] font-black tracking-widest text-[#3C5866] uppercase">
                {company.name}
              </span>
            </>
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-[#3C5866] text-[#FFF3CD] flex items-center justify-center font-black text-xl">
              {resellerBrandTitle.charAt(0).toUpperCase()}
            </div>
          )}

          <h2 className="text-lg sm:text-xl font-black text-[#263842] uppercase tracking-tight">
            {whiteLabelMode ? resellerBrandTitle : 'Bienvenido al Catálogo'}
          </h2>

          {/* Aviso de acceso a precios para visitantes y pendientes */}
          {!hasPriceAccess && (
            <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-left flex items-start gap-2.5">
              {accessStatus === 'pendiente' ? (
                <Clock className="w-4 h-4 text-[#C37D41] shrink-0 mt-0.5" />
              ) : (
                <Lock className="w-4 h-4 text-[#C37D41] shrink-0 mt-0.5" />
              )}
              <p className="text-xs font-semibold text-slate-700 leading-snug">
                {accessStatus === 'pendiente'
                  ? 'Solicitud en revisión. Espera el contacto de nuestro equipo de ventas para habilitar precios y pedidos.'
                  : accessStatus === 'rechazado' || accessStatus === 'suspendido'
                  ? 'Acceso a precios restringido. Contacta a nuestro equipo de ventas.'
                  : 'Regístrate y espera el contacto de ventas para ver la lista de precios y enviar pedidos.'}
              </p>
            </div>
          )}

          <div className="w-full bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 text-left space-y-3">
            {/* Selector de listas solo si tiene más de 1 lista habilitada */}
            {hasPriceAccess && !whiteLabelMode && visiblePriceLists.length > 1 && (
              <div>
                <label className="text-[11px] font-black text-slate-600 uppercase block mb-1.5">
                  Lista de Precios
                </label>
                <div className={`grid gap-2 ${visiblePriceLists.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {visiblePriceLists.map((list) => {
                    const isSelected = selectedTier === list.id;
                    return (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => setSelectedTier(list.id)}
                        className={`py-2.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-[#3C5866] text-white border-[#3C5866] font-black'
                            : 'bg-white hover:bg-slate-100 text-[#3C5866] border-slate-200 font-bold'
                        }`}
                      >
                        <span className="text-xs truncate block">{list.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] font-black text-slate-600 uppercase block mb-1.5">
                Vista
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedView('grid')}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    selectedView === 'grid'
                      ? 'bg-[#3C5866] text-white border-[#3C5866]'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <LayoutGrid className={`w-4 h-4 ${selectedView === 'grid' ? 'text-[#FFF3CD]' : 'text-slate-500'}`} />
                  <span className="text-xs font-extrabold">Cuadrícula</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedView('carousel')}
                  className={`py-2.5 px-3 rounded-xl border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    selectedView === 'carousel'
                      ? 'bg-[#3C5866] text-white border-[#3C5866]'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <GalleryHorizontal className={`w-4 h-4 ${selectedView === 'carousel' ? 'text-[#FFF3CD]' : 'text-slate-500'}`} />
                  <span className="text-xs font-extrabold">Carrusel</span>
                </button>
              </div>
            </div>
          </div>

          <div className="w-full space-y-2">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full py-3 px-5 bg-[#3C5866] hover:bg-[#263842] text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>Ver Catálogo</span>
              <ArrowRight className="w-4 h-4 text-[#FFF3CD]" />
            </button>

            {!whiteLabelMode && accessStatus === 'pendiente' && salesWhatsappUrl ? (
              <a
                href={salesWhatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Contactar Ventas</span>
              </a>
            ) : !whiteLabelMode ? (
              <button
                type="button"
                onClick={handleOpenAccountClick}
                className="w-full py-2.5 px-5 bg-white hover:bg-slate-50 border border-slate-200 text-[#3C5866] font-extrabold text-xs rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <User className="w-4 h-4 text-[#C37D41]" />
                <span>{customer ? customer.nombre : 'Registrarme / Ingresar'}</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
