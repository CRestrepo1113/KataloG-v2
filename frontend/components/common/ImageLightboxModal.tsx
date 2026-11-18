'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import { X, AlertCircle } from 'lucide-react';
import { formatSize, formatCurrency, getPastelBgColor } from '@/lib/theme';
import { useModalHistory } from '@/lib/useModalHistory';

export interface LightboxPriceEntry {
  id: string;
  label: string;
  amount: number;
  highlight?: boolean;
}

interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string | null;
  sku?: string;
  name?: string;
  category?: string;
  size?: string;
  stock?: number;
  status?: string;
  prices?: { unit: number; dozen: number; wholesale: number } | null;
  visiblePriceEntries?: LightboxPriceEntry[];
  hidePrices?: boolean;
  price?: number;
  currencySymbol?: string;
  isOutOfStock?: boolean;
  showStock?: boolean;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  sku,
  name,
  category,
  size,
  stock,
  status,
  prices,
  visiblePriceEntries,
  hidePrices = false,
  price,
  currencySymbol = '$',
  isOutOfStock: isOutOfStockProp,
  showStock = true,
}) => {
  const bgColor = getPastelBgColor();

  const isOutOfStock =
    isOutOfStockProp ??
    (stock !== undefined && stock <= 0) ??
    status === 'out_of_stock';

  useModalHistory(isOpen, onClose, 'imageLightbox');

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen || !imageUrl) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl border border-white/20 flex flex-col relative animate-in zoom-in-95 duration-200 my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top-Right Close Button & Optional Stock Badge */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          {showStock && (
            isOutOfStock ? (
              <span className="bg-rose-500/95 text-white text-[12px] font-black px-3 py-1 rounded-xl flex items-center gap-1 shadow-sm pointer-events-none">
                <AlertCircle className="w-3.5 h-3.5" />
                Agotado
              </span>
            ) : stock !== undefined ? (
              <span className="text-[12px] font-black text-slate-700 bg-white/95 px-3 py-1 rounded-xl border border-slate-200/70 shadow-xs pointer-events-none">
                Stock: {stock} u.
              </span>
            ) : null
          )}

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-700 hover:text-rose-600 flex items-center justify-center shadow-md cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Floating SKU Badge */}
        {sku && (
          <div
            className={`absolute top-3 z-20 pointer-events-none ${
              !showStock ? 'left-1/2 -translate-x-1/2' : 'left-3'
            }`}
          >
            <span className="bg-[#3C5866]/95 text-white text-[12px] font-black px-3 py-1 rounded-xl uppercase tracking-wider shadow-sm font-mono inline-block">
              {sku}
            </span>
          </div>
        )}

        {/* Centered Image Container */}
        <div
          className="relative w-full aspect-square max-h-[65vh] flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: bgColor.hex }}
        >
          <Image
            src={imageUrl}
            alt={name || sku || 'Foto de producto'}
            fill
            className="object-contain p-4 transition-transform duration-300 hover:scale-105 select-none"
            sizes="(max-width: 768px) 100vw, 550px"
            priority
          />

          {size && (
            <span className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-[12px] font-bold text-slate-800 bg-white/95 px-3.5 py-1 rounded-xl border border-slate-200/70 shadow-xs pointer-events-none whitespace-nowrap uppercase tracking-wider">
              {formatSize(size)}
            </span>
          )}
        </div>

        {/* Bottom Details Bar */}
        <div className="p-4 sm:p-5 bg-white border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            {category && (
              <span className="text-[11px] uppercase font-black text-[#C37D41] tracking-wider block mb-1">
                {category}
              </span>
            )}
            <h3 className="text-base sm:text-lg font-black text-[#263842] leading-snug line-clamp-2">
              {name || sku || 'Producto'}
            </h3>
          </div>

          {!hidePrices && (
            visiblePriceEntries && visiblePriceEntries.length > 0 ? (
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 px-3.5 flex flex-col gap-1 min-w-[140px] shrink-0 text-right">
                {visiblePriceEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between gap-3 text-[12px] font-bold ${
                      entry.highlight ? 'text-[#C37D41]' : 'text-slate-600'
                    }`}
                  >
                    <span className="text-[#3C5866] font-black">{entry.label}:</span>
                    <span className={`font-black ${entry.highlight ? 'text-[#C37D41]' : 'text-[#263842]'}`}>
                      {formatCurrency(entry.amount, currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>
            ) : prices ? (
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 px-3.5 flex flex-col gap-1 min-w-[135px] shrink-0 text-right">
                <div className="flex items-center justify-between gap-3 text-[12px] font-bold text-slate-600">
                  <span className="text-[#3C5866] font-black font-mono">U:</span>
                  <span className="font-extrabold text-[#263842]">{formatCurrency(prices.unit, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[12px] font-bold text-slate-600">
                  <span className="text-[#3C5866] font-black font-mono">D:</span>
                  <span className="font-extrabold text-[#263842]">{formatCurrency(prices.dozen, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-[12px] font-bold text-amber-900 bg-amber-50/80 -mx-1 px-1.5 py-0.5 rounded-lg border border-amber-200/60">
                  <span className="text-[#C37D41] font-black font-mono">M:</span>
                  <span className="font-black text-[#C37D41]">{formatCurrency(prices.wholesale, currencySymbol)}</span>
                </div>
              </div>
            ) : price !== undefined ? (
              <div className="text-lg sm:text-xl font-black text-[#C37D41]">
                {formatCurrency(price, currencySymbol)}
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  );
};
