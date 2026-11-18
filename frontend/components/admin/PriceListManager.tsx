'use client';

import React, { useMemo, useState } from 'react';
import { BuiltInPriceListId, PriceList, Product } from '@/lib/types';
import {
  savePriceList,
  deletePriceList,
  saveProduct,
} from '@/lib/firestore';
import {
  BUILT_IN_PRICE_LIST_IDS,
  getEffectiveProductPrices,
  resolveProductPriceForList,
} from '@/lib/pricing';
import {
  Tag,
  Plus,
  Pencil,
  Trash2,
  SlidersHorizontal,
  Search,
  X,
  Check,
  Star,
  Power,
  Percent,
  RotateCcw,
} from 'lucide-react';

interface PriceListManagerProps {
  branchSlug: string;
  currencySymbol: string;
  priceLists: PriceList[];
  products: Product[];
  canManagePrices: boolean;
  onPriceListsChanged: (updated: PriceList[]) => void;
  onProductUpdated: (updated: Product) => void;
}

const ROUNDING_STEPS = [
  { value: 0, label: 'Exacto' },
  { value: 10, label: '10' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 500, label: '500' },
  { value: 1000, label: '1,000' },
];

function slugifyListId(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

export default function PriceListManager({
  branchSlug,
  currencySymbol,
  priceLists,
  products,
  canManagePrices,
  onPriceListsChanged,
  onProductUpdated,
}: PriceListManagerProps) {
  const [editingList, setEditingList] = useState<PriceList | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Form fields
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formMode, setFormMode] = useState<'manual' | 'base_percent'>('base_percent');
  const [formBaseOp, setFormBaseOp] = useState<'markup' | 'discount'>('markup');
  const [formPercent, setFormPercent] = useState('0');
  const [formRounding, setFormRounding] = useState('100');
  const [formMinUnits, setFormMinUnits] = useState('');
  const [formMinAmount, setFormMinAmount] = useState('');
  const [formSortOrder, setFormSortOrder] = useState('10');
  const [formIsActive, setFormIsActive] = useState(true);
  const [formDefaultSeller, setFormDefaultSeller] = useState(false);

  // SKU Exceptions & Preview modal
  const [inspectingList, setInspectingList] = useState<PriceList | null>(null);
  const [skuSearch, setSkuSearch] = useState('');
  const [savingSkuId, setSavingSkuId] = useState<string | null>(null);
  const [skuDrafts, setSkuDrafts] = useState<Record<string, { price?: string; basePrice?: string }>>({});

  const sortedLists = useMemo(() => {
    return [...priceLists].sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }, [priceLists]);

  const formatMoney = (amount: number) => {
    const clean = Number.isFinite(amount) ? amount : 0;
    return `${currencySymbol}${clean.toLocaleString('es-CR', {
      minimumFractionDigits: clean % 1 !== 0 ? 2 : 0,
      maximumFractionDigits: 2,
    })}`;
  };

  const openCreateModal = () => {
    if (!canManagePrices) return;
    setIsCreating(true);
    setEditingList(null);
    setFormError('');
    setFormId('');
    setFormName('');
    setFormMode('base_percent');
    setFormBaseOp('markup');
    setFormPercent('15');
    setFormRounding('100');
    setFormMinUnits('');
    setFormMinAmount('');
    setFormSortOrder(String(sortedLists.length + 1));
    setFormIsActive(true);
    setFormDefaultSeller(false);
  };

  const openEditModal = (list: PriceList) => {
    if (!canManagePrices) return;
    setIsCreating(false);
    setEditingList(list);
    setFormError('');
    setFormId(list.id);
    setFormName(list.name);
    setFormMode(list.mode || 'manual');
    setFormBaseOp(list.baseOperation || 'markup');
    setFormPercent(String(list.percentValue ?? 0));
    setFormRounding(String(list.roundingStep ?? 0));
    setFormMinUnits(list.minUnits ? String(list.minUnits) : '');
    setFormMinAmount(list.minOrderAmount ? String(list.minOrderAmount) : '');
    setFormSortOrder(String(list.sortOrder ?? 10));
    setFormIsActive(list.isActive !== false);
    setFormDefaultSeller(Boolean(list.isDefaultForSeller));
  };

  const closeFormModal = () => {
    setEditingList(null);
    setIsCreating(false);
    setFormError('');
  };

  const handleNameChange = (value: string) => {
    setFormName(value);
    if (isCreating) {
      setFormId(slugifyListId(value));
    }
  };

  const handleSaveList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManagePrices || saving) return;

    const cleanName = formName.trim();
    const cleanId = isCreating ? slugifyListId(formId || cleanName) : formId.trim();

    if (!cleanName || !cleanId) {
      setFormError('Nombre e ID requeridos');
      return;
    }

    if (isCreating && sortedLists.some((l) => l.id === cleanId)) {
      setFormError('Ya existe una lista con ese ID');
      return;
    }

    const percentNum = Math.max(0, Number(formPercent) || 0);
    const roundingNum = Math.max(0, Number(formRounding) || 0);
    const minUnitsNum = Math.max(0, parseInt(formMinUnits || '0', 10) || 0);
    const minAmountNum = Math.max(0, Number(formMinAmount) || 0);
    const sortNum = Math.max(1, parseInt(formSortOrder || '10', 10) || 10);

    const payload: PriceList = {
      id: cleanId,
      name: cleanName,
      branchSlug,
      mode: formMode,
      baseOperation: formMode === 'base_percent' ? formBaseOp : undefined,
      percentValue: formMode === 'base_percent' ? percentNum : undefined,
      roundingStep: formMode === 'base_percent' && roundingNum > 1 ? roundingNum : undefined,
      minUnits: minUnitsNum > 0 ? minUnitsNum : undefined,
      minOrderAmount: minAmountNum > 0 ? minAmountNum : undefined,
      isActive: formIsActive,
      isDefaultForSeller: formDefaultSeller,
      sortOrder: sortNum,
      createdAt: editingList?.createdAt,
    };

    setSaving(true);
    try {
      const saved = await savePriceList(payload);
      const next = sortedLists.some((l) => l.id === saved.id)
        ? sortedLists.map((l) => (l.id === saved.id ? saved : l))
        : [...sortedLists, saved];

      // Si esta quedó predeterminada para vendedor, limpiar las demás visualmente
      const normalized = saved.isDefaultForSeller
        ? next.map((l) => (l.id === saved.id ? saved : { ...l, isDefaultForSeller: false }))
        : next;

      onPriceListsChanged(normalized.sort((a, b) => a.sortOrder - b.sortOrder));
      closeFormModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (list: PriceList) => {
    if (!canManagePrices) return;
    try {
      const updated = await savePriceList({ ...list, isActive: !list.isActive });
      onPriceListsChanged(
        sortedLists.map((l) => (l.id === updated.id ? updated : l))
      );
    } catch (err) {
      console.error('Error toggling list:', err);
    }
  };

  const handleDeleteList = async (list: PriceList) => {
    if (!canManagePrices) return;
    if (BUILT_IN_PRICE_LIST_IDS.includes(list.id as BuiltInPriceListId)) return;
    if (!confirm(`¿Eliminar la lista "${list.name}"?`)) return;
    try {
      await deletePriceList(list.id, branchSlug);
      onPriceListsChanged(sortedLists.filter((l) => l.id !== list.id));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo eliminar';
      alert(msg);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!inspectingList) return [];
    const q = skuSearch.trim().toLowerCase();
    const activeOnly = products.filter((p) => p.status !== 'disabled');
    if (!q) return activeOnly.slice(0, 60);
    return activeOnly
      .filter(
        (p) =>
          (p.sku || '').toLowerCase().includes(q) ||
          (p.name || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [inspectingList, products, skuSearch]);

  const handleSaveSkuException = async (product: Product) => {
    if (!inspectingList || !canManagePrices) return;
    const draft = skuDrafts[product.id];
    if (!draft) return;

    const currentPrices = getEffectiveProductPrices(product, branchSlug);
    const listId = inspectingList.id;
    const nextPrices = {
      ...currentPrices,
      customLists: { ...(currentPrices.customLists || {}) },
    };

    if (draft.basePrice !== undefined) {
      const parsedBase = Number(draft.basePrice);
      if (Number.isFinite(parsedBase) && parsedBase >= 0) {
        nextPrices.basePrice = parsedBase;
      }
    }

    if (draft.price !== undefined) {
      const trimmed = draft.price.trim();
      const parsed = Number(trimmed);
      if (listId === 'unit' || listId === 'dozen' || listId === 'wholesale') {
        if (inspectingList.mode === 'manual') {
          if (Number.isFinite(parsed) && parsed >= 0) {
            nextPrices[listId] = parsed;
          }
          delete nextPrices.customLists[listId];
        } else {
          if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) {
            delete nextPrices.customLists[listId];
          } else {
            nextPrices.customLists[listId] = parsed;
          }
        }
      } else {
        if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) {
          delete nextPrices.customLists[listId];
        } else {
          nextPrices.customLists[listId] = parsed;
        }
      }
    }

    setSavingSkuId(product.id);
    try {
      const saved = await saveProduct(
        {
          ...product,
          prices: nextPrices,
        },
        branchSlug
      );
      onProductUpdated(saved);
      setSkuDrafts((prev) => {
        const copy = { ...prev };
        delete copy[product.id];
        return copy;
      });
    } catch (err) {
      console.error('Error saving SKU price override:', err);
    } finally {
      setSavingSkuId(null);
    }
  };

  const handleClearSkuException = async (product: Product) => {
    if (!inspectingList || !canManagePrices) return;
    const currentPrices = getEffectiveProductPrices(product, branchSlug);
    const nextCustom = { ...(currentPrices.customLists || {}) };
    delete nextCustom[inspectingList.id];

    setSavingSkuId(product.id);
    try {
      const saved = await saveProduct(
        {
          ...product,
          prices: {
            ...currentPrices,
            customLists: nextCustom,
          },
        },
        branchSlug
      );
      onProductUpdated(saved);
      setSkuDrafts((prev) => {
        const copy = { ...prev };
        delete copy[product.id];
        return copy;
      });
    } finally {
      setSavingSkuId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header minimalista */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-[#3C5866]/10 text-[#3C5866] flex items-center justify-center">
            <Tag className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#263842] leading-tight">
              Listas de Precios
            </h2>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Sucursal: {branchSlug} · {sortedLists.length} listas
            </span>
          </div>
        </div>

        {canManagePrices && (
          <button
            type="button"
            onClick={openCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#3C5866] hover:bg-[#263842] text-white text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Nueva Lista
          </button>
        )}
      </div>

      {/* Grid responsive de listas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedLists.map((list) => {
          const isBuiltIn = BUILT_IN_PRICE_LIST_IDS.includes(list.id as BuiltInPriceListId);
          const ruleSummary =
            list.mode === 'base_percent'
              ? `${list.baseOperation === 'discount' ? '-' : '+'}${list.percentValue || 0}% Base`
              : 'Precio Manual';

          return (
            <div
              key={list.id}
              className={`bg-white border rounded-xl p-4 shadow-sm transition-all flex flex-col justify-between gap-3 ${
                list.isActive
                  ? 'border-gray-200 hover:border-[#3C5866]/40'
                  : 'border-gray-200 opacity-70 bg-gray-50/70'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-bold text-[#263842] truncate">
                        {list.name}
                      </h3>
                      {list.isDefaultForSeller && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#FFF3CD] text-[#9A5B13] text-[10px] font-bold border border-[#C37D41]/30">
                          <Star className="w-2.5 h-2.5 fill-current" />
                          Vendedor
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-mono text-gray-400 mt-0.5">
                      #{list.id} · Orden {list.sortOrder}
                    </p>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      list.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-gray-100 text-gray-500 border border-gray-200'
                    }`}
                  >
                    {list.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </div>

                {/* Reglas de cálculo y mínimos */}
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold ${
                      list.mode === 'base_percent'
                        ? 'bg-[#B9E0FD]/40 text-[#263842] border border-[#B9E0FD]'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {list.mode === 'base_percent' && <Percent className="w-3 h-3 text-[#3C5866]" />}
                    {ruleSummary}
                  </span>

                  {list.mode === 'base_percent' && list.roundingStep && list.roundingStep > 1 && (
                    <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-700">
                      Redondeo {list.roundingStep}
                    </span>
                  )}

                  {list.minUnits && list.minUnits > 0 && (
                    <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-[#FFF3CD]/60 text-[#263842] border border-[#C37D41]/25">
                      Mín. {list.minUnits} uds
                    </span>
                  )}

                  {list.minOrderAmount && list.minOrderAmount > 0 && (
                    <span className="px-2 py-1 rounded-md text-[11px] font-semibold bg-[#FFF3CD]/60 text-[#263842] border border-[#C37D41]/25">
                      Mín. {formatMoney(list.minOrderAmount)}
                    </span>
                  )}
                </div>
              </div>

              {/* Acciones */}
              <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setInspectingList(list);
                    setSkuSearch('');
                    setSkuDrafts({});
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-[#3C5866] bg-[#3C5866]/10 hover:bg-[#3C5866]/20 transition-colors"
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  Excepciones
                </button>

                {canManagePrices && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(list)}
                      title={list.isActive ? 'Desactivar' : 'Activar'}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        list.isActive
                          ? 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                          : 'text-gray-400 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      <Power className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditModal(list)}
                      title="Editar"
                      className="p-1.5 rounded-lg border border-gray-200 text-[#3C5866] hover:bg-gray-100 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {!isBuiltIn && (
                      <button
                        type="button"
                        onClick={() => handleDeleteList(list)}
                        title="Eliminar"
                        className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Crear / Editar Lista */}
      {(isCreating || editingList) && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden">
            <div className="bg-[#3C5866] text-white px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {isCreating ? 'Nueva Lista' : 'Editar Lista'}
              </h3>
              <button
                type="button"
                onClick={closeFormModal}
                className="p-1 rounded-lg hover:bg-white/15 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveList} className="p-5 space-y-4">
              {formError && (
                <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                    Nombre
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Ej. Mayorista VIP"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs font-semibold text-[#263842] focus:outline-none focus:border-[#3C5866]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1">
                    ID Lista
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!isCreating}
                    value={formId}
                    onChange={(e) => setFormId(slugifyListId(e.target.value))}
                    placeholder="mayorista_vip"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-xs font-mono text-gray-700 disabled:bg-gray-100 focus:outline-none focus:border-[#3C5866]"
                  />
                </div>
              </div>

              {/* Modo de cálculo */}
              <div>
                <label className="block text-[11px] font-bold text-gray-600 uppercase mb-1.5">
                  Modo de Cálculo
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormMode('base_percent')}
                    className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                      formMode === 'base_percent'
                        ? 'bg-[#3C5866] text-white border-[#3C5866]'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    % Sobre Base
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormMode('manual')}
                    className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                      formMode === 'manual'
                        ? 'bg-[#3C5866] text-white border-[#3C5866]'
                        : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    Manual por SKU
                  </button>
                </div>
              </div>

              {formMode === 'base_percent' && (
                <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-[#F8FAFC] border border-gray-200">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                      Operación
                    </label>
                    <select
                      value={formBaseOp}
                      onChange={(e) => setFormBaseOp(e.target.value as 'markup' | 'discount')}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold bg-white"
                    >
                      <option value="markup">Aumento (+)</option>
                      <option value="discount">Descuento (-)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                      Porcentaje %
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={formPercent}
                      onChange={(e) => setFormPercent(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                      Redondeo
                    </label>
                    <select
                      value={formRounding}
                      onChange={(e) => setFormRounding(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold bg-white"
                    >
                      {ROUNDING_STEPS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Reglas de pedido */}
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Mín. Unidades
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formMinUnits}
                    onChange={(e) => setFormMinUnits(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Mín. Monto
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formMinAmount}
                    onChange={(e) => setFormMinAmount(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                    Orden
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 text-xs"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center justify-between gap-4 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 accent-[#3C5866]"
                  />
                  <span className="text-xs font-semibold text-gray-700">Lista Activa</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formDefaultSeller}
                    onChange={(e) => setFormDefaultSeller(e.target.checked)}
                    className="w-4 h-4 accent-[#C37D41]"
                  />
                  <span className="text-xs font-semibold text-gray-700">Default Vendedor</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeFormModal}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#3C5866] hover:bg-[#263842] text-white text-xs font-bold disabled:opacity-50 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Vista Previa y Excepciones por SKU */}
      {inspectingList && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="bg-[#263842] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-sm font-bold">{inspectingList.name} · Excepciones</h3>
                <p className="text-[11px] text-white/75">
                  {inspectingList.mode === 'base_percent'
                    ? `${inspectingList.baseOperation === 'discount' ? '-' : '+'}${inspectingList.percentValue || 0}% sobre precio base`
                    : 'Precios manuales por referencia'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingList(null)}
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 border-b border-gray-200 bg-[#F8FAFC] shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={skuSearch}
                  onChange={(e) => setSkuSearch(e.target.value)}
                  placeholder="Buscar por SKU, nombre o categoría..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:border-[#3C5866]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
              {filteredProducts.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">
                  Sin referencias coincidentes.
                </div>
              ) : (
                filteredProducts.map((product) => {
                  const effPrices = getEffectiveProductPrices(product, branchSlug);
                  const computed = resolveProductPriceForList(
                    product,
                    inspectingList,
                    branchSlug,
                    sortedLists
                  );
                  const customOverrideVal = effPrices.customLists?.[inspectingList.id];
                  const hasCustomOverride =
                    typeof customOverrideVal === 'number' && customOverrideVal > 0;
                  const draft = skuDrafts[product.id];
                  const isDirty = Boolean(draft);

                  const displayPriceVal =
                    draft?.price !== undefined
                      ? draft.price
                      : hasCustomOverride
                      ? String(customOverrideVal)
                      : inspectingList.mode === 'manual' &&
                        (inspectingList.id === 'unit' ||
                          inspectingList.id === 'dozen' ||
                          inspectingList.id === 'wholesale')
                      ? String(effPrices[inspectingList.id] || 0)
                      : '';

                  const displayBaseVal =
                    draft?.basePrice !== undefined
                      ? draft.basePrice
                      : String(effPrices.basePrice ?? effPrices.wholesale ?? 0);

                  return (
                    <div
                      key={product.id}
                      className="px-4 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:bg-gray-50/70"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono font-bold text-[#3C5866]">
                            {product.sku}
                          </span>
                          {hasCustomOverride && (
                            <span className="px-1.5 py-0.5 rounded bg-[#FFF3CD] text-[#9A5B13] text-[10px] font-bold">
                              Fijo
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-[#263842] truncate">
                          {product.name}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {inspectingList.mode === 'base_percent' && (
                          <div className="w-24">
                            <span className="block text-[9px] uppercase font-bold text-gray-400">
                              Base
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              disabled={!canManagePrices}
                              value={displayBaseVal}
                              onChange={(e) =>
                                setSkuDrafts((prev) => ({
                                  ...prev,
                                  [product.id]: {
                                    ...prev[product.id],
                                    basePrice: e.target.value,
                                  },
                                }))
                              }
                              className="w-full px-2 py-1 rounded border border-gray-300 text-xs font-mono"
                            />
                          </div>
                        )}

                        <div className="w-28">
                          <span className="block text-[9px] uppercase font-bold text-gray-400">
                            {inspectingList.mode === 'base_percent' ? 'Excepción' : 'Precio'}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!canManagePrices}
                            value={displayPriceVal}
                            placeholder={String(computed)}
                            onChange={(e) =>
                              setSkuDrafts((prev) => ({
                                ...prev,
                                [product.id]: {
                                  ...prev[product.id],
                                  price: e.target.value,
                                },
                              }))
                            }
                            className="w-full px-2 py-1 rounded border border-gray-300 text-xs font-mono font-bold text-[#263842]"
                          />
                        </div>

                        <div className="w-24 text-right">
                          <span className="block text-[9px] uppercase font-bold text-gray-400">
                            Final
                          </span>
                          <span className="text-xs font-bold text-emerald-700">
                            {formatMoney(computed)}
                          </span>
                        </div>

                        {canManagePrices && (
                          <div className="flex items-center gap-1">
                            {isDirty && (
                              <button
                                type="button"
                                disabled={savingSkuId === product.id}
                                onClick={() => handleSaveSkuException(product)}
                                className="px-2 py-1.5 rounded-lg bg-[#3C5866] text-white text-[11px] font-bold hover:bg-[#263842] disabled:opacity-50"
                              >
                                {savingSkuId === product.id ? '...' : 'OK'}
                              </button>
                            )}
                            {hasCustomOverride && (
                              <button
                                type="button"
                                title="Restaurar fórmula"
                                disabled={savingSkuId === product.id}
                                onClick={() => handleClearSkuException(product)}
                                className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
