'use client';

import React, { useState, useMemo } from 'react';
import { Customer, PriceList, Product, ResellerConfig } from '@/lib/types';
import { resolveProductPriceForList, resolveResellerPrice } from '@/lib/pricing';
import { formatCurrency } from '@/lib/theme';
import { useModalHistory } from '@/lib/useModalHistory';
import { X, Save, Percent, Search, EyeOff, RotateCcw } from 'lucide-react';

interface ResellerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  products: Product[];
  visiblePriceLists: PriceList[];
  branchSlug: string;
  currencySymbol?: string;
  onSaveConfig: (config: ResellerConfig) => Promise<void>;
}

export const ResellerSettingsModal: React.FC<ResellerSettingsModalProps> = (props) => {
  useModalHistory(props.isOpen, props.onClose, 'resellerSettingsModal');
  if (!props.isOpen) return null;
  const resetKey = `${props.customer.id}:${JSON.stringify(props.customer.resellerConfig || {})}`;
  return <ResellerSettingsContent key={resetKey} {...props} />;
};

const ResellerSettingsContent: React.FC<ResellerSettingsModalProps> = ({
  onClose,
  customer,
  products,
  visiblePriceLists,
  branchSlug,
  currencySymbol = '$',
  onSaveConfig,
}) => {
  const initialConfig = customer.resellerConfig;
  const [brandTitle, setBrandTitle] = useState(initialConfig?.brandTitle || 'Catálogo');
  const [defaultMarkup, setDefaultMarkup] = useState<number>(initialConfig?.defaultMarkupPercent ?? 30);
  const [roundingStep, setRoundingStep] = useState<number>(initialConfig?.roundingStep ?? 0);
  const [sourceCostListId, setSourceCostListId] = useState<string>(
    initialConfig?.sourceCostListId || visiblePriceLists[0]?.id || 'wholesale'
  );
  const [hideStock, setHideStock] = useState<boolean>(initialConfig?.hideStockInClientMode ?? true);
  const [overrides, setOverrides] = useState<Record<string, number>>(
    initialConfig?.productOverrides || {}
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  const activeCostList = useMemo(
    () => visiblePriceLists.find((l) => l.id === sourceCostListId) || visiblePriceLists[0],
    [visiblePriceLists, sourceCostListId]
  );

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.sku.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
        )
      : products;
    return list.slice(0, 40);
  }, [products, searchTerm]);

  const previewConfig: ResellerConfig = {
    brandTitle: brandTitle.trim() || 'Catálogo',
    defaultMarkupPercent: Math.max(0, Number(defaultMarkup) || 0),
    roundingStep,
    sourceCostListId: activeCostList?.id,
    hideStockInClientMode: hideStock,
    productOverrides: overrides,
  };

  const handleOverrideChange = (sku: string, val: string) => {
    const num = Number(val);
    setOverrides((prev) => {
      const next = { ...prev };
      if (!val || isNaN(num) || num <= 0) {
        delete next[sku];
      } else {
        next[sku] = num;
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveConfig(previewConfig);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90dvh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#3C5866] text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <Percent className="w-4 h-4 text-[#FFF3CD]" />
            </div>
            <h3 className="font-extrabold text-sm sm:text-base">Precios de Venta</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Global Rules */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Título Modo Cliente
              </label>
              <input
                type="text"
                value={brandTitle}
                onChange={(e) => setBrandTitle(e.target.value)}
                placeholder="Catálogo"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-[#3C5866] focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Lista Base Costo
              </label>
              <select
                value={activeCostList?.id || 'wholesale'}
                onChange={(e) => setSourceCostListId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-[#3C5866] focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              >
                {visiblePriceLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Margen Global (%)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={defaultMarkup}
                onChange={(e) => setDefaultMarkup(Math.max(0, Number(e.target.value)))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-[#C37D41] focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Redondeo Comercial
              </label>
              <select
                value={roundingStep}
                onChange={(e) => setRoundingStep(Number(e.target.value))}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              >
                <option value={0}>Exacto</option>
                <option value={50}>Múltiplos de 50</option>
                <option value={100}>Múltiplos de 100</option>
                <option value={500}>Múltiplos de 500</option>
                <option value={1000}>Múltiplos de 1000</option>
              </select>
            </div>

            <label className="sm:col-span-2 flex items-center justify-between pt-2 border-t border-slate-200/70 cursor-pointer">
              <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <EyeOff className="w-4 h-4 text-[#C37D41]" />
                Ocultar stock en Modo Cliente
              </span>
              <input
                type="checkbox"
                checked={hideStock}
                onChange={(e) => setHideStock(e.target.checked)}
                className="w-4 h-4 accent-[#3C5866] cursor-pointer"
              />
            </label>
          </div>

          {/* Product-level Overrides */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-[#3C5866] uppercase">
                Ajuste por Referencia
              </span>
              {Object.keys(overrides).length > 0 && (
                <button
                  type="button"
                  onClick={() => setOverrides({})}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restablecer
                </button>
              )}
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar SKU o nombre..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              />
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
              {filteredProducts.map((p) => {
                const cost = resolveProductPriceForList(
                  p,
                  activeCostList || 'wholesale',
                  branchSlug,
                  visiblePriceLists
                );
                const computed = resolveResellerPrice(cost, p, previewConfig);
                const customVal = overrides[p.sku] ?? '';

                return (
                  <div key={p.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0 flex-1">
                      <span className="font-black text-[#C37D41] text-[10px] mr-1.5">{p.sku}</span>
                      <span className="font-bold text-slate-800 truncate">{p.name}</span>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Costo: <strong className="text-slate-700">{formatCurrency(cost, currencySymbol)}</strong>
                        <span className="mx-1.5">•</span>
                        Venta: <strong className="text-emerald-700">{formatCurrency(computed, currencySymbol)}</strong>
                      </div>
                    </div>

                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={customVal}
                      onChange={(e) => handleOverrideChange(p.sku, e.target.value)}
                      placeholder={String(computed)}
                      className="w-24 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-right text-xs font-black text-[#3C5866] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#C37D41]"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-[#3C5866] hover:bg-[#263842] flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4 text-[#FFF3CD]" />
              <span>{saving ? 'Guardando...' : 'Guardar'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
