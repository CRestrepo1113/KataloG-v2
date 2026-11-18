'use client';

import React from 'react';
import { Branch } from '@/lib/types';
import { Building2, Globe, ArrowRight, Plus, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface SelectBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: Branch[];
  currentBranchSlug: string;
  onSelectBranch: (slug: string) => void;
  onAddNewBranch?: () => void;
}

export const SelectBranchModal: React.FC<SelectBranchModalProps> = ({
  isOpen,
  onClose,
  branches,
  currentBranchSlug,
  onSelectBranch,
  onAddNewBranch,
}) => {
  if (!isOpen) return null;

  const handleSelect = (slug: string) => {
    onSelectBranch(slug);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-[#3C5866] text-white p-6 relative">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20 shadow-inner shrink-0">
              <Building2 className="w-6 h-6 text-[#FFF3CD]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-[#C37D41] text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full">
                  Acceso al Panel
                </span>
                <span className="text-xs text-slate-200 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Sesión Autenticada
                </span>
              </div>
              <h2 className="text-xl font-black tracking-tight mt-0.5">
                ¿Qué sucursal deseas gestionar hoy?
              </h2>
              <p className="text-xs text-slate-200 mt-0.5">
                El inventario, precios y stock se cargarán específicamente para la sucursal que elijas.
              </p>
            </div>
          </div>
        </div>

        {/* Branches Grid */}
        <div className="p-6 overflow-y-auto space-y-3.5 flex-1 bg-slate-50/50">
          {branches.length === 0 ? (
            <div className="text-center py-8 text-slate-400 space-y-2">
              <Building2 className="w-12 h-12 mx-auto text-slate-300 stroke-1" />
              <p className="text-sm font-bold">No hay sucursales registradas</p>
            </div>
          ) : (
            branches.map((b) => {
              const isSelected = b.slug === currentBranchSlug;
              return (
                <button
                  key={b.id || b.slug}
                  onClick={() => handleSelect(b.slug)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between gap-4 group cursor-pointer active:scale-[0.99] ${
                    isSelected
                      ? 'bg-white border-[#3C5866] shadow-md ring-2 ring-[#3C5866]/20'
                      : 'bg-white border-slate-200/80 hover:border-[#3C5866]/50 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 font-black text-sm uppercase transition-colors ${
                        isSelected
                          ? 'bg-[#3C5866] text-[#FFF3CD]'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-[#3C5866]/10 group-hover:text-[#3C5866]'
                      }`}
                    >
                      {b.country?.slice(0, 2) || b.slug.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-[#263842] text-sm group-hover:text-[#3C5866] transition-colors truncate">
                          {b.name}
                        </h3>
                        {isSelected && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            Activa
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                        <span className="font-semibold">{b.country || 'Internacional'}</span>
                        <span>•</span>
                        <span className="font-bold text-[#C37D41]">
                          {b.currencySymbol} ({b.currencyCode})
                        </span>
                        {b.phone && (
                          <>
                            <span>•</span>
                            <span className="text-[11px] text-slate-400">{b.phone}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center">
                    <div className="w-9 h-9 rounded-xl bg-slate-50 group-hover:bg-[#3C5866] group-hover:text-white text-slate-400 flex items-center justify-center transition-all shadow-2xs">
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-between gap-3">
          {onAddNewBranch ? (
            <button
              onClick={() => {
                onClose();
                onAddNewBranch();
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-[#3C5866] hover:text-[#263842] px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <Plus className="w-4 h-4 text-[#C37D41]" />
              <span>Registrar Nueva Sucursal</span>
            </button>
          ) : (
            <div />
          )}

          {currentBranchSlug && (
            <button
              onClick={onClose}
              className="text-xs font-bold text-slate-400 hover:text-slate-600 px-4 py-2"
            >
              Continuar con la actual
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
