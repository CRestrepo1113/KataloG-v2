'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  X,
  Filter,
  FileText,
  LayoutGrid,
  GalleryHorizontal,
  ChevronDown,
  Check,
  DollarSign,
  Ruler,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
} from 'lucide-react';
import { CatalogSortOption } from '@/lib/types';

interface SearchBarProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  onOpenPDFModal: () => void;
  categoryCounts?: Record<string, number>;
  totalResults: number;
  viewMode?: 'grid' | 'carousel';
  onViewModeChange?: (mode: 'grid' | 'carousel') => void;
  sortBy?: CatalogSortOption;
  onSortChange?: (sort: CatalogSortOption) => void;
  hasPriceAccess?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  searchTerm,
  onSearchChange,
  categories,
  selectedCategory,
  onCategoryChange,
  onOpenPDFModal,
  categoryCounts,
  totalResults,
  viewMode = 'grid',
  onViewModeChange,
  sortBy = 'default',
  onSortChange,
  hasPriceAccess = false,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPriceDropdownOpen, setIsPriceDropdownOpen] = useState(false);
  const [isSizeDropdownOpen, setIsSizeDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const priceDropdownRef = useRef<HTMLDivElement>(null);
  const sizeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
      if (priceDropdownRef.current && !priceDropdownRef.current.contains(target)) {
        setIsPriceDropdownOpen(false);
      }
      if (sizeDropdownRef.current && !sizeDropdownRef.current.contains(target)) {
        setIsSizeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleCategoryDropdown = () => {
    setIsDropdownOpen((prev) => !prev);
    setIsPriceDropdownOpen(false);
    setIsSizeDropdownOpen(false);
  };

  const togglePriceDropdown = () => {
    setIsPriceDropdownOpen((prev) => !prev);
    setIsDropdownOpen(false);
    setIsSizeDropdownOpen(false);
  };

  const toggleSizeDropdown = () => {
    setIsSizeDropdownOpen((prev) => !prev);
    setIsDropdownOpen(false);
    setIsPriceDropdownOpen(false);
  };

  const isPriceActive = sortBy === 'price-asc' || sortBy === 'price-desc';
  const isSizeActive = sortBy === 'size-asc' || sortBy === 'size-desc';

  return (
    <div className="flex flex-col gap-2.5 sm:gap-3 mb-4 sm:mb-6">
      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por REF o nombre..."
            className="w-full pl-10 pr-10 py-2.5 sm:py-3 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#3C5866] text-slate-800 placeholder-slate-400 shadow-xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          {onViewModeChange && (
            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => onViewModeChange('grid')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-[#3C5866] text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
                <span>Cuadrícula</span>
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('carousel')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  viewMode === 'carousel'
                    ? 'bg-[#3C5866] text-white'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <GalleryHorizontal className="w-4 h-4" />
                <span>Carrusel</span>
              </button>
            </div>
          )}

          {hasPriceAccess && (
            <button
              type="button"
              onClick={onOpenPDFModal}
              className="flex items-center justify-center gap-1.5 bg-[#C37D41] hover:bg-[#a86832] text-white px-3.5 py-2 sm:py-2.5 rounded-2xl font-bold text-xs sm:text-sm transition-all shadow-xs active:scale-95 whitespace-nowrap cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Exportar PDF</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex items-center gap-2 overflow-visible py-1 flex-wrap sm:flex-nowrap">
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            type="button"
            onClick={toggleCategoryDropdown}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
              isDropdownOpen
                ? 'bg-[#3C5866] text-white border-[#3C5866]'
                : 'bg-white hover:bg-slate-100 text-[#3C5866] border-slate-200'
            }`}
          >
            <Filter className={`w-3.5 h-3.5 ${isDropdownOpen ? 'text-[#FFF3CD]' : 'text-[#C37D41]'}`} />
            <span>Categorías</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isDropdownOpen ? 'rotate-180 text-white' : 'text-slate-400'}`} />
          </button>

          {isDropdownOpen && (
            <div className="absolute left-0 top-full mt-2 w-56 max-h-72 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-y-auto z-50 p-1.5 space-y-1">
              <button
                type="button"
                onClick={() => {
                  onCategoryChange('all');
                  setIsDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                  selectedCategory === 'all' ? 'bg-[#3C5866] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>Todas</span>
                <span className="text-[11px] opacity-80">({categoryCounts?.all ?? totalResults})</span>
              </button>

              {categories.map((cat) => {
                const isSelected = selectedCategory === cat;
                const count = categoryCounts?.[cat] ?? 0;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      onCategoryChange(cat);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                      isSelected ? 'bg-[#3C5866] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="truncate">{cat}</span>
                    <span className="text-[11px] opacity-80 shrink-0 ml-2">({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Ordenar por Precio (solo cuando tiene acceso a precios) */}
        {hasPriceAccess && (
          <div className="relative shrink-0" ref={priceDropdownRef}>
            <button
              type="button"
              onClick={togglePriceDropdown}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                isPriceActive
                  ? 'bg-[#3C5866] text-white border-[#3C5866]'
                  : 'bg-white hover:bg-slate-100 text-[#3C5866] border-slate-200'
              }`}
            >
              <DollarSign className={`w-3.5 h-3.5 ${isPriceActive ? 'text-[#FFF3CD]' : 'text-[#C37D41]'}`} />
              <span>
                {sortBy === 'price-asc'
                  ? 'Menor precio'
                  : sortBy === 'price-desc'
                  ? 'Mayor precio'
                  : 'Precio'}
              </span>
              {isPriceActive ? (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onSortChange?.('default');
                  }}
                  className="p-0.5 hover:bg-white/20 rounded-full ml-0.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5 text-[#FFF3CD]" />
                </span>
              ) : (
                <ChevronDown className={`w-3.5 h-3.5 ${isPriceDropdownOpen ? 'rotate-180' : 'text-slate-400'}`} />
              )}
            </button>

            {isPriceDropdownOpen && (
              <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 p-1.5 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onSortChange?.(sortBy === 'price-asc' ? 'default' : 'price-asc');
                    setIsPriceDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                    sortBy === 'price-asc' ? 'bg-[#3C5866] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ArrowUpNarrowWide className="w-3.5 h-3.5" />
                    Menor a mayor
                  </span>
                  {sortBy === 'price-asc' && <Check className="w-3.5 h-3.5 text-[#FFF3CD]" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSortChange?.(sortBy === 'price-desc' ? 'default' : 'price-desc');
                    setIsPriceDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                    sortBy === 'price-desc' ? 'bg-[#3C5866] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <ArrowDownWideNarrow className="w-3.5 h-3.5" />
                    Mayor a menor
                  </span>
                  {sortBy === 'price-desc' && <Check className="w-3.5 h-3.5 text-[#FFF3CD]" />}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Ordenar por Tamaño */}
        <div className="relative shrink-0" ref={sizeDropdownRef}>
          <button
            type="button"
            onClick={toggleSizeDropdown}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
              isSizeActive
                ? 'bg-[#3C5866] text-white border-[#3C5866]'
                : 'bg-white hover:bg-slate-100 text-[#3C5866] border-slate-200'
            }`}
          >
            <Ruler className={`w-3.5 h-3.5 ${isSizeActive ? 'text-[#FFF3CD]' : 'text-[#C37D41]'}`} />
            <span>
              {sortBy === 'size-asc'
                ? 'Menor tamaño'
                : sortBy === 'size-desc'
                ? 'Mayor tamaño'
                : 'Tamaño'}
            </span>
            {isSizeActive ? (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onSortChange?.('default');
                }}
                className="p-0.5 hover:bg-white/20 rounded-full ml-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5 text-[#FFF3CD]" />
              </span>
            ) : (
              <ChevronDown className={`w-3.5 h-3.5 ${isSizeDropdownOpen ? 'rotate-180' : 'text-slate-400'}`} />
            )}
          </button>

          {isSizeDropdownOpen && (
            <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 p-1.5 space-y-1">
              <button
                type="button"
                onClick={() => {
                  onSortChange?.(sortBy === 'size-asc' ? 'default' : 'size-asc');
                  setIsSizeDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                  sortBy === 'size-asc' ? 'bg-[#3C5866] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <ArrowUpNarrowWide className="w-3.5 h-3.5" />
                  Menor a mayor
                </span>
                {sortBy === 'size-asc' && <Check className="w-3.5 h-3.5 text-[#FFF3CD]" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSortChange?.(sortBy === 'size-desc' ? 'default' : 'size-desc');
                  setIsSizeDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                  sortBy === 'size-desc' ? 'bg-[#3C5866] text-white font-bold' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <ArrowDownWideNarrow className="w-3.5 h-3.5" />
                  Mayor a menor
                </span>
                {sortBy === 'size-desc' && <Check className="w-3.5 h-3.5 text-[#FFF3CD]" />}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            onClick={() => onCategoryChange('all')}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#3C5866] text-white'
                : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            Todas ({categoryCounts?.all ?? totalResults})
          </button>

          {selectedCategory !== 'all' && (
            <button
              type="button"
              onClick={() => onCategoryChange('all')}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#3C5866] text-white whitespace-nowrap flex items-center gap-1.5 cursor-pointer"
            >
              <span>{selectedCategory} ({categoryCounts?.[selectedCategory] ?? 0})</span>
              <X className="w-3.5 h-3.5 text-[#FFF3CD]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
