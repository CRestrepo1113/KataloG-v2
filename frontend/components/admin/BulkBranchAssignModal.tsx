'use client';

import React, { useState } from 'react';
import { Branch } from '@/lib/types';
import { Building2, X, CheckCircle, EyeOff, Globe } from 'lucide-react';

interface BulkBranchAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  branches: Branch[];
  onAssign: (targetBranchSlug: string, action: 'enable' | 'disable') => void;
}

export const BulkBranchAssignModal: React.FC<BulkBranchAssignModalProps> = ({
  isOpen,
  onClose,
  selectedCount,
  branches,
  onAssign,
}) => {
  const [selectedSlug, setSelectedSlug] = useState<string>(branches[0]?.slug || 'default');

  if (!isOpen) return null;

  const handleAction = (action: 'enable' | 'disable') => {
    onAssign(selectedSlug, action);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-[#3C5866] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#C37D41]" />
            <h3 className="font-extrabold text-sm sm:text-base">
              Asignar a Sucursal / País
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-full hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3 text-xs text-[#3C5866] font-semibold flex items-center justify-between">
            <span>Referencias a modificar:</span>
            <span className="bg-[#C37D41] text-white font-extrabold px-2.5 py-0.5 rounded-lg">
              {selectedCount} seleccionadas
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
              Seleccionar Sucursal Destino
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={selectedSlug}
                onChange={(e) => setSelectedSlug(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-[#3C5866] focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              >
                {branches.map((b) => (
                  <option key={b.id || b.slug} value={b.slug}>
                    {b.name} ({b.country} • {b.currencySymbol} {b.currencyCode})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => handleAction('enable')}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Habilitar en Sucursal</span>
            </button>

            <button
              onClick={() => handleAction('disable')}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <EyeOff className="w-4 h-4" />
              <span>Inhabilitar en Sucursal</span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 p-3 border-t border-slate-100 text-right">
          <button
            onClick={onClose}
            className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-xl"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
