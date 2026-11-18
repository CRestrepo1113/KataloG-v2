'use client';

import React from 'react';
import { PriceList, PriceTier } from '@/lib/types';
import { Tag, SlidersHorizontal } from 'lucide-react';

interface PriceTierSwitcherProps {
  visibleLists: PriceList[];
  currentTier: PriceTier;
  onSelectTier: (tier: PriceTier) => void;
  whiteLabelMode?: boolean;
  onOpenResellerSettings?: () => void;
}

export const PriceTierSwitcher: React.FC<PriceTierSwitcherProps> = ({
  visibleLists,
  currentTier,
  onSelectTier,
  whiteLabelMode = false,
  onOpenResellerSettings,
}) => {
  if (whiteLabelMode) {
    return (
      <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-200/80 mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#FFF3CD] text-[#3C5866] rounded-xl">
            <Tag className="w-4 h-4 text-[#C37D41]" />
          </div>
          <span className="text-xs sm:text-sm font-extrabold text-[#3C5866]">
            Precios de Venta
          </span>
        </div>
        {onOpenResellerSettings && (
          <button
            type="button"
            onClick={onOpenResellerSettings}
            className="inline-flex items-center gap-1.5 bg-[#3C5866] hover:bg-[#263842] text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#FFF3CD]" />
            <span>Márgenes</span>
          </button>
        )}
      </div>
    );
  }

  if (visibleLists.length === 0) return null;

  // Sin elementos redundantes: si solo tiene 1 lista, mostrar indicador compacto sin selector múltiple
  if (visibleLists.length === 1) {
    const onlyList = visibleLists[0];
    return (
      <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-200/80 mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#FFF3CD] text-[#3C5866] rounded-xl">
            <Tag className="w-4 h-4 text-[#C37D41]" />
          </div>
          <span className="text-xs sm:text-sm font-extrabold text-[#3C5866]">
            Tarifa: {onlyList.name}
          </span>
        </div>
        {onlyList.minUnits && onlyList.minUnits > 0 ? (
          <span className="text-[11px] font-bold text-[#C37D41] bg-[#FFF3CD]/60 px-2.5 py-1 rounded-full">
            Mín. {onlyList.minUnits} u.
          </span>
        ) : null}
      </div>
    );
  }

  const gridColsClass =
    visibleLists.length === 2
      ? 'grid-cols-2'
      : visibleLists.length === 3
      ? 'grid-cols-3'
      : 'grid-cols-2 sm:grid-cols-4';

  return (
    <div className="bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-4 shadow-xs border border-slate-200/80 mb-4 sm:mb-6">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="p-1.5 bg-[#FFF3CD]/70 text-[#3C5866] rounded-xl">
          <Tag className="w-4 h-4 text-[#C37D41]" />
        </div>
        <h3 className="text-sm font-extrabold text-[#3C5866]">Listas de Precios</h3>
      </div>

      <div className={`grid ${gridColsClass} gap-2 sm:gap-3`}>
        {visibleLists.map((list) => {
          const isSelected = currentTier === list.id;
          return (
            <button
              key={list.id}
              type="button"
              onClick={() => onSelectTier(list.id)}
              className={`flex items-center justify-center py-2.5 px-2.5 sm:py-3 sm:px-4 rounded-xl sm:rounded-2xl border text-center transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#3C5866] text-white border-[#3C5866] shadow-xs ring-2 ring-[#C37D41]/30 font-black'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 font-bold'
              }`}
            >
              <span className="text-xs sm:text-sm truncate">{list.name}</span>
              {isSelected && (
                <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-[#C37D41] ml-1.5 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
