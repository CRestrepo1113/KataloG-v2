'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Product, ProductStatus, Branch } from '@/lib/types';
import { formatCurrency, formatSize, getBaseSku } from '@/lib/theme';
import { getSharedProductImage } from '@/lib/firestore';
import {
  Edit2,
  EyeOff,
  Eye,
  Trash2,
  Plus,
  Search,
  AlertCircle,
  CheckCircle,
  Package,
  FileSpreadsheet,
  FileText,
  CheckSquare,
  Square,
  Building2,
  Image as ImageIcon,
  Sparkles,
  Palette,
  Link2,
  X,
} from 'lucide-react';

import { BulkAIProcessModal } from './BulkAIProcessModal';
import { ImageLightboxModal } from '@/components/common/ImageLightboxModal';

interface ProductTableProps {
  products: Product[];
  branches?: Branch[];
  currencySymbol?: string;
  onAddProduct: () => void;
  onOpenBulkImport: () => void;
  onOpenPDFModal: () => void;
  onEditProduct: (product: Product) => void;
  onToggleStatus: (id: string, newStatus: ProductStatus) => void;
  onDeleteProduct: (id: string) => void;
  onUpdateStock: (id: string, newStock: number) => void;
  onUpdateFilledWeight?: (id: string, newWeight: number) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkToggleStatus?: (ids: string[], newStatus: ProductStatus) => void;
  onBulkUpdateProducts?: (products: Product[]) => Promise<void>;
}

export const ProductTable: React.FC<ProductTableProps> = ({
  products,
  currencySymbol = '$',
  onAddProduct,
  onOpenBulkImport,
  onOpenPDFModal,
  onEditProduct,
  onToggleStatus,
  onDeleteProduct,
  onUpdateStock,
  onUpdateFilledWeight,
  onBulkDelete,
  onBulkToggleStatus,
  onBulkUpdateProducts,
}) => {

  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'out_of_stock' | 'disabled' | 'no_image'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkAIModalOpen, setIsBulkAIModalOpen] = useState(false);
  const [bulkAIMode, setBulkAIMode] = useState<'rembg' | 'pastel'>('rembg');
  const [lightboxProduct, setLightboxProduct] = useState<Product | null>(null);

  const hasNoImage = (p: Product) => {
    return !getSharedProductImage(p.sku, p.processedImageUrl);
  };

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === 'active') return p.status === 'active' && p.stock > 0;
    if (filterTab === 'out_of_stock') return p.status === 'out_of_stock' || p.stock <= 0;
    if (filterTab === 'disabled') return p.status === 'disabled';
    if (filterTab === 'no_image') return hasNoImage(p);
    return true;
  });

  // Select All / Deselect All Checkbox Handler
  const isAllSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedIds.includes(p.id));

  const handleSelectAll = () => {
    if (selectedIds.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map((p) => p.id));
    }
  };

  // Toggle single product selection
  const handleToggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-3.5 sm:p-5 md:p-6 space-y-4">
      {/* Table Header & Main Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por referencia, nombre o categoría..."
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#3C5866]/20 focus:border-[#3C5866] transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              title="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Global Action Buttons */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <button
            onClick={onOpenPDFModal}
            className="flex items-center justify-center gap-1.5 bg-[#C37D41] hover:bg-[#a86832] text-white px-3 py-2.5 rounded-2xl font-bold text-xs transition-all shadow-sm active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>Exportar PDF</span>
          </button>

          <button
            onClick={onOpenBulkImport}
            className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2.5 rounded-2xl font-bold text-xs transition-all shadow-sm active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-[#FFF3CD]" />
            <span>Importación</span>
          </button>

          <button
            onClick={onAddProduct}
            className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 bg-[#3C5866] hover:bg-[#2c424e] text-white px-4 py-2.5 rounded-2xl font-bold text-xs transition-all shadow-sm active:scale-95 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#C37D41]" />
            <span>Agregar Referencia</span>
          </button>
        </div>
      </div>

      {/* MINIMALIST FLOATING BULK ACTIONS TOOLBAR */}
      {selectedIds.length > 0 && (
        <div className="bg-[#2E4552] text-white px-4 py-2.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md border border-slate-700/40 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-white/15 text-white px-2.5 py-1 rounded-xl font-black tracking-wide">
              {selectedIds.length} seleccionadas
            </span>
            <span className="text-slate-300 font-medium">de {products.length} referencias</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* IA Rembg Masivo */}
            <button
              onClick={() => {
                setBulkAIMode('rembg');
                setIsBulkAIModalOpen(true);
              }}
              className="bg-white/10 hover:bg-white/20 text-slate-100 border border-white/10 hover:border-amber-400/40 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Remover fondo con IA a las referencias seleccionadas"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>IA Rembg</span>
            </button>

            {/* Fondo Pastel Masivo */}
            <button
              onClick={() => {
                setBulkAIMode('pastel');
                setIsBulkAIModalOpen(true);
              }}
              className="bg-white/10 hover:bg-white/20 text-slate-100 border border-white/10 hover:border-rose-300/40 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Aplicar fondo pastel de estudio a las referencias seleccionadas"
            >
              <Palette className="w-3.5 h-3.5 text-rose-300" />
              <span>Fondo Pastel</span>
            </button>

            <div className="w-px h-4 bg-white/20 mx-1 hidden sm:block" />

            {/* Habilitar / Activar */}
            <button
              onClick={() => {
                if (onBulkToggleStatus) onBulkToggleStatus(selectedIds, 'active');
              }}
              className="bg-white/10 hover:bg-emerald-600/30 text-slate-100 border border-white/10 hover:border-emerald-500/40 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Habilitar referencias seleccionadas"
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              <span>Habilitar</span>
            </button>

            {/* Inhabilitar */}
            <button
              onClick={() => {
                if (onBulkToggleStatus) onBulkToggleStatus(selectedIds, 'disabled');
              }}
              className="bg-white/10 hover:bg-amber-600/30 text-slate-100 border border-white/10 hover:border-amber-500/40 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Inhabilitar referencias seleccionadas"
            >
              <EyeOff className="w-3.5 h-3.5 text-amber-300" />
              <span>Inhabilitar</span>
            </button>

            {/* Eliminar Seleccionadas */}
            <button
              onClick={() => {
                if (onBulkDelete) {
                  onBulkDelete(selectedIds);
                  setSelectedIds([]);
                }
              }}
              className="bg-rose-500/15 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/30 hover:border-rose-600 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ml-1"
              title="Eliminar referencias seleccionadas permanentemente"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400 hover:text-white" />
              <span>Eliminar</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-none">
        <button
          onClick={() => setFilterTab('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            filterTab === 'all'
              ? 'bg-[#3C5866] text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Todos ({products.length})
        </button>
        <button
          onClick={() => setFilterTab('active')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            filterTab === 'active'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Activos ({products.filter((p) => p.status === 'active' && p.stock > 0).length})
        </button>
        <button
          onClick={() => setFilterTab('out_of_stock')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            filterTab === 'out_of_stock'
              ? 'bg-rose-500 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Agotados ({products.filter((p) => p.status === 'out_of_stock' || p.stock <= 0).length})
        </button>
        <button
          onClick={() => setFilterTab('disabled')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
            filterTab === 'disabled'
              ? 'bg-slate-700 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Inhabilitados ({products.filter((p) => p.status === 'disabled').length})
        </button>
        <button
          onClick={() => setFilterTab('no_image')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
            filterTab === 'no_image'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200/60'
          }`}
        >
          <span>Sin Imagen</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10.5px] ${
            filterTab === 'no_image' ? 'bg-amber-700/60 text-white' : 'bg-amber-200/60 text-amber-900'
          }`}>
            {products.filter(hasNoImage).length}
          </span>
        </button>
      </div>

      {/* Table Data with Horizontal Scroll for Mobile */}
      <div className="overflow-x-auto rounded-2xl border border-slate-100 scrollbar-thin">
        <table className="w-full min-w-[920px] text-left border-collapse text-xs">
          <thead>
            <tr className="bg-[#3C5866] text-white font-bold uppercase tracking-wider text-[10px]">
              <th className="p-3 w-10 text-center whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  className="w-4 h-4 rounded border-slate-300 text-[#C37D41] focus:ring-[#C37D41] cursor-pointer"
                  title="Seleccionar / Deseleccionar todos"
                />
              </th>
              <th className="p-3 whitespace-nowrap min-w-[200px]">Producto</th>
              <th className="p-3 whitespace-nowrap min-w-[120px]">REF</th>
              <th className="p-3 whitespace-nowrap min-w-[130px]">Categoría</th>
              <th className="p-3 whitespace-nowrap min-w-[100px]">Medida (cm)</th>
              <th className="p-3 text-center whitespace-nowrap min-w-[110px]">Peso Relleno (g)</th>
              <th className="p-3 text-center whitespace-nowrap min-w-[85px]">Stock</th>
              <th className="p-3 text-center whitespace-nowrap min-w-[110px]">Estado</th>
              <th className="p-3 text-right whitespace-nowrap min-w-[90px]">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400 font-medium">
                  No se encontraron referencias con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => {
                const isSelected = selectedIds.includes(p.id);
                return (
                  <tr
                    key={p.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-amber-50/60' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Checkbox Column */}
                    <td className="p-3 text-center whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectOne(p.id)}
                        className="w-4 h-4 rounded border-slate-300 text-[#C37D41] focus:ring-[#C37D41] cursor-pointer"
                      />
                    </td>

                    <td className="p-3 font-extrabold text-[#263842]">
                      <div className="flex items-center gap-3">
                        {(() => {
                          const isInherited = !p.processedImageUrl;
                          const displayUrl = getSharedProductImage(p.sku, p.processedImageUrl);

                          return (
                            <div
                              onClick={() => {
                                if (displayUrl) setLightboxProduct(p);
                              }}
                              className={`relative w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 flex items-center justify-center ${
                                displayUrl
                                  ? 'cursor-pointer hover:ring-2 hover:ring-[#C37D41]/60 hover:scale-105 transition-all shadow-2xs'
                                  : ''
                              }`}
                              title={displayUrl ? 'Haz clic para ampliar la foto' : undefined}
                            >
                              {displayUrl ? (
                                <>
                                  <Image
                                    src={displayUrl}
                                    alt={p.name}
                                    fill
                                    className="object-cover"
                                  />
                                  {isInherited && (
                                    <div
                                      className="absolute bottom-0 right-0 bg-[#C37D41] text-white p-0.5 rounded-tl-md shadow-xs z-10"
                                      title={`Foto compartida vinculada (Código Base: ${getBaseSku(p.sku)})`}
                                    >
                                      <Link2 className="w-2.5 h-2.5" />
                                    </div>
                                  )}
                                </>
                              ) : (
                                <ImageIcon className="w-5 h-5 text-slate-400" />
                              )}
                            </div>
                          );
                        })()}
                        <span className="line-clamp-1">{p.name}</span>
                      </div>
                    </td>

                    <td className="p-3 font-mono font-bold text-[#C37D41] whitespace-nowrap">
                      <span className="bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/60 inline-block whitespace-nowrap leading-none tracking-tight">
                        {p.sku}
                      </span>
                    </td>

                    <td className="p-3 text-slate-700 font-extrabold uppercase text-[11px] whitespace-nowrap tracking-wide">
                      {p.category}
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      {p.size ? (
                        <span className="font-extrabold text-[#3C5866] bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-lg text-[10.5px] inline-block whitespace-nowrap leading-none">
                          {formatSize(p.size)}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-[11px]">-</span>
                      )}
                    </td>

                    {/* Peso con Relleno (g) editable en línea */}
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 bg-amber-50/70 border border-amber-200/80 px-2 py-0.5 rounded-xl">
                        <input
                          type="number"
                          value={p.filledWeight !== undefined && p.filledWeight !== null ? p.filledWeight : ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            if (onUpdateFilledWeight) {
                              onUpdateFilledWeight(p.id, isNaN(val) ? 0 : val);
                            }
                          }}
                          placeholder="0"
                          className="w-14 text-center font-extrabold text-[#3C5866] bg-transparent focus:outline-none"
                          min={0}
                        />
                        <span className="text-[10px] text-amber-800 font-bold">g</span>
                      </div>
                    </td>

                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-xl">
                        <input
                          type="number"
                          value={p.stock}
                          onChange={(e) =>
                            onUpdateStock(p.id, parseInt(e.target.value || '0', 10))
                          }
                          className="w-12 text-center font-bold text-slate-700 bg-transparent focus:outline-none"
                          min={0}
                        />
                        <span className="text-[10px] text-slate-400 font-semibold">u.</span>
                      </div>
                    </td>


                    <td className="p-3 text-center whitespace-nowrap">
                      {p.status === 'active' && p.stock > 0 ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold whitespace-nowrap">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          Activo
                        </span>
                      ) : p.status === 'disabled' ? (
                        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold whitespace-nowrap">
                          <EyeOff className="w-3 h-3 text-slate-400" />
                          Inhabilitado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold whitespace-nowrap">
                          <AlertCircle className="w-3 h-3 text-rose-500" />
                          Agotado
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEditProduct(p)}
                          className="p-1.5 text-slate-500 hover:text-[#3C5866] hover:bg-slate-100 rounded-lg transition-colors"
                          title="Editar Referencia"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() =>
                            onToggleStatus(
                              p.id,
                              p.status === 'disabled' ? 'active' : 'disabled'
                            )
                          }
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title={p.status === 'disabled' ? 'Habilitar' : 'Inhabilitar'}
                        >
                          {p.status === 'disabled' ? (
                            <Eye className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <EyeOff className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          onClick={() => onDeleteProduct(p.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Eliminar Referencia"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk AI Background Removal / Studio Pastel Modal */}
      <BulkAIProcessModal
        isOpen={isBulkAIModalOpen}
        onClose={() => setIsBulkAIModalOpen(false)}
        selectedProducts={products.filter((p) => selectedIds.includes(p.id))}
        mode={bulkAIMode}
        onSaveProcessedProducts={async (updatedProducts) => {
          if (onBulkUpdateProducts) {
            await onBulkUpdateProducts(updatedProducts);
          }
        }}
      />

      {/* Centered Image Lightbox Modal for Admin Inventory */}
      <ImageLightboxModal
        isOpen={Boolean(lightboxProduct)}
        onClose={() => setLightboxProduct(null)}
        imageUrl={lightboxProduct ? getSharedProductImage(lightboxProduct.sku, lightboxProduct.processedImageUrl) : null}
        sku={lightboxProduct?.sku}
        name={lightboxProduct?.name}
        category={lightboxProduct?.category}
        size={lightboxProduct?.size}
        stock={lightboxProduct?.stock}
        status={lightboxProduct?.status}
        prices={lightboxProduct?.prices}
        currencySymbol={currencySymbol}
      />
    </div>
  );
};

