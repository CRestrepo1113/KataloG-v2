'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { PriceList, Product, ProductStatus } from '@/lib/types';
import { AIImageUploader } from './AIImageUploader';
import { getBaseSku } from '@/lib/theme';
import { getLocalProducts, uploadProductImage } from '@/lib/firestore';
import {
  BUILT_IN_PRICE_LIST_IDS,
  resolveProductPriceForList,
} from '@/lib/pricing';
import { X, Save, Package, DollarSign } from 'lucide-react';

interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Partial<Product>) => void;
  initialProduct?: Product | null;
  currencySymbol?: string;
  priceLists?: PriceList[];
  branchSlug?: string;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProduct,
  currencySymbol = '$',
  priceLists = [],
  branchSlug = 'costarica',
}) => {
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Peluches Tradicionales');
  const [size, setSize] = useState('');
  const [filledWeight, setFilledWeight] = useState<number | undefined>(undefined);
  const [stock, setStock] = useState<number>(12);
  const [status, setStatus] = useState<ProductStatus>('active');

  const [unitPrice, setUnitPrice] = useState<number>(25000);
  const [dozenPrice, setDozenPrice] = useState<number>(20000);
  const [wholesalePrice, setWholesalePrice] = useState<number>(18000);
  const [basePrice, setBasePrice] = useState<string>('18000');
  const [customListsDraft, setCustomListsDraft] = useState<Record<string, string>>({});

  const [processedImageUrl, setProcessedImageUrl] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const extraBranchLists = useMemo(() => {
    return priceLists
      .filter(
        (l) =>
          l.isActive &&
          (!l.branchSlug || l.branchSlug === branchSlug || l.branchSlug === 'global') &&
          (!BUILT_IN_PRICE_LIST_IDS.includes(l.id as any) || l.mode === 'base_percent')
      )
      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }, [priceLists, branchSlug]);

  const stripCmSuffix = (val?: string): string => {
    if (!val) return '';
    return val.replace(/[\s]*cm$/i, '').trim();
  };

  // Synchronize state whenever initialProduct or isOpen changes
  useEffect(() => {
    if (initialProduct) {
      setSku(initialProduct.sku || '');
      setName(initialProduct.name || '');
      setCategory(initialProduct.category || 'Peluches Tradicionales');
      setSize(stripCmSuffix(initialProduct.size));
      setFilledWeight(initialProduct.filledWeight);
      setStock(initialProduct.stock ?? 12);
      setStatus(initialProduct.status || 'active');

      setUnitPrice(initialProduct.prices?.unit ?? 25000);
      setDozenPrice(initialProduct.prices?.dozen ?? 20000);
      setWholesalePrice(initialProduct.prices?.wholesale ?? 18000);
      const resolvedBase =
        initialProduct.prices?.basePrice ?? initialProduct.prices?.wholesale ?? 0;
      setBasePrice(resolvedBase > 0 ? String(resolvedBase) : '');
      const draftCustom: Record<string, string> = {};
      if (initialProduct.prices?.customLists) {
        Object.entries(initialProduct.prices.customLists).forEach(([k, v]) => {
          if (typeof v === 'number' && v > 0) draftCustom[k] = String(v);
        });
      }
      setCustomListsDraft(draftCustom);

      setProcessedImageUrl(initialProduct.processedImageUrl || '');
    } else {
      setSku('');
      setName('');
      setCategory('Peluches Tradicionales');
      setSize('');
      setFilledWeight(undefined);
      setStock(12);
      setStatus('active');

      setUnitPrice(25000);
      setDozenPrice(20000);
      setWholesalePrice(18000);
      setBasePrice('18000');
      setCustomListsDraft({});

      setProcessedImageUrl('');
    }
  }, [initialProduct, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku || !name) return;

    setSaving(true);
    let finalImageUrl = processedImageUrl;

    if (finalImageUrl && finalImageUrl.startsWith('data:image/')) {
      try {
        finalImageUrl = await uploadProductImage(finalImageUrl, `${sku.toLowerCase()}.webp`);
      } catch (err) {
        console.warn('Could not upload image, saving dataUrl:', err);
      }
    } else if (!finalImageUrl) {
      const baseSku = getBaseSku(sku);
      const existing = getLocalProducts().find(
        (p) => getBaseSku(p.sku) === baseSku && p.processedImageUrl
      );
      if (existing) {
        finalImageUrl = existing.processedImageUrl;
      }
    }

    const cleanSize = stripCmSuffix(size);
    const categoryList = category
      .split(/[,/|;\n]/)
      .map((c) => c.trim())
      .filter(Boolean);

    const cleanBase = Number(basePrice);
    const cleanedCustomLists: Record<string, number> = {};
    Object.entries(customListsDraft).forEach(([k, val]) => {
      const parsed = Number(val);
      if (val.trim() !== '' && Number.isFinite(parsed) && parsed > 0) {
        cleanedCustomLists[k] = parsed;
      }
    });

    onSave({
      id: initialProduct?.id,
      sku,
      name,
      category,
      categories: categoryList.length > 0 ? categoryList : [category],
      size: cleanSize,
      filledWeight: filledWeight !== undefined && !isNaN(filledWeight) ? Number(filledWeight) : undefined,
      stock,
      status,
      prices: {
        unit: Number(unitPrice),
        dozen: Number(dozenPrice),
        wholesale: Number(wholesalePrice),
        basePrice:
          basePrice.trim() !== '' && Number.isFinite(cleanBase) && cleanBase >= 0
            ? cleanBase
            : Number(wholesalePrice) || undefined,
        customLists:
          Object.keys(cleanedCustomLists).length > 0 ? cleanedCustomLists : undefined,
      },
      processedImageUrl: finalImageUrl,

      tags: [
        ...categoryList.map((c) => c.toLowerCase()),
        name.toLowerCase(),
      ],
    });

    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 my-6 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-[#3C5866] text-white p-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-[#C37D41]" />
            <h3 className="font-bold text-sm">
              {initialProduct ? `Editar: ${initialProduct.sku}` : 'Nueva Referencia'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-full hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3.5 max-h-[80vh] overflow-y-auto">
          {/* AI Image Uploader */}
          <AIImageUploader
            currentImageUrl={processedImageUrl}
            onImageProcessed={(url) => setProcessedImageUrl(url)}
          />

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                REF *
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="ej: PEL-010"
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase text-[#3C5866]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Categoría
              </label>
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="ej: Peluches Tradicionales"
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <div className="col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Nombre del Producto *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ej: Oso Caramelo"
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Medida (cm)
              </label>
              <input
                type="text"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="ej: 30"
                className="w-full px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-extrabold text-amber-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Peso Relleno (g)
              </label>
              <input
                type="number"
                min="0"
                step="any"
                value={filledWeight !== undefined && filledWeight !== null ? filledWeight : ''}
                onChange={(e) => setFilledWeight(e.target.value === '' ? undefined : Number(e.target.value))}
                placeholder="ej: 250"
                className="w-full px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-extrabold text-amber-900"
              />
            </div>
          </div>


          {/* Stock & Status */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Stock
              </label>
              <input
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Estado
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProductStatus)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
              >
                <option value="active">Activo</option>
                <option value="out_of_stock">Agotado</option>
                <option value="disabled">Inhabilitado</option>
              </select>
            </div>
          </div>

          {/* Price Tiers Matrix */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-[#3C5866]">
              <div className="flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-[#C37D41]" />
                <span>Precios ({currencySymbol})</span>
              </div>
              <span className="text-[10px] font-semibold text-slate-400">
                Base + Listas
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                  Precio Base
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={basePrice}
                  onChange={(e) => setBasePrice(e.target.value)}
                  placeholder={String(wholesalePrice)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-extrabold text-[#263842]"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                  Unidad
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-white border rounded-xl text-xs font-extrabold text-[#3C5866]"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                  Docena
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={dozenPrice}
                  onChange={(e) => setDozenPrice(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-white border rounded-xl text-xs font-extrabold text-[#3C5866]"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-semibold text-[#C37D41] mb-0.5">
                  Mayorista
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-extrabold text-[#C37D41]"
                />
              </div>
            </div>

            {extraBranchLists.length > 0 && (
              <div className="pt-2 border-t border-slate-200/80 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {extraBranchLists.map((list) => {
                  const previewCalc = resolveProductPriceForList(
                    {
                      prices: {
                        unit: Number(unitPrice) || 0,
                        dozen: Number(dozenPrice) || 0,
                        wholesale: Number(wholesalePrice) || 0,
                        basePrice: Number(basePrice) || Number(wholesalePrice) || 0,
                      },
                    },
                    list,
                    branchSlug,
                    priceLists
                  );
                  return (
                    <div key={list.id}>
                      <label className="block text-[10px] font-bold text-[#3C5866] mb-0.5 truncate">
                        {list.name} {list.mode === 'base_percent' ? '(Excepción)' : ''}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={customListsDraft[list.id] ?? ''}
                        placeholder={previewCalc > 0 ? String(previewCalc) : 'Auto'}
                        onChange={(e) =>
                          setCustomListsDraft((prev) => ({
                            ...prev,
                            [list.id]: e.target.value,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-[#263842]"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-[#3C5866] hover:bg-[#2c424e] text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm active:scale-95"
            >
              <Save className="w-3.5 h-3.5 text-[#C37D41]" />
              <span>Guardar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
