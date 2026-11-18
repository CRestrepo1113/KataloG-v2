'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { PriceList, PriceTier, Product } from '@/lib/types';
import { getPastelBgColor, formatCurrency, formatSize } from '@/lib/theme';
import { getSharedProductImage } from '@/lib/firestore';
import { useModalHistory } from '@/lib/useModalHistory';
import { ImageLightboxModal, LightboxPriceEntry } from '@/components/common/ImageLightboxModal';
import {
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  ShoppingCart,
  Info,
  Check,
  AlertCircle,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  PackageX,
  Search,
  X,
  Filter,
  ChevronDown,
  MessageSquare,
  Lock,
} from 'lucide-react';

interface ProductCarouselProps {
  products: Product[];
  currentTier: PriceTier;
  visiblePriceLists: PriceList[];
  resolvePrice: (product: Product, listId?: string) => number;
  hasPriceAccess: boolean;
  hasCartAccess: boolean;
  whiteLabelMode?: boolean;
  currencySymbol?: string;
  showStock?: boolean;
  onAddToCart: (product: Product, quantity?: number, comment?: string) => void;
  onRequestPriceAccess?: () => void;
  categories?: string[];
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
  searchTerm?: string;
  onSearchChange?: (term: string) => void;
  categoryCounts?: Record<string, number>;
  cartCount?: number;
  onOpenCart?: () => void;
  isLoading?: boolean;
}

export const ProductCarousel: React.FC<ProductCarouselProps> = ({
  products,
  currentTier,
  visiblePriceLists,
  resolvePrice,
  hasPriceAccess,
  hasCartAccess,
  whiteLabelMode = false,
  currencySymbol = '$',
  showStock = true,
  onAddToCart,
  onRequestPriceAccess,
  categories = [],
  selectedCategory = 'all',
  onCategoryChange,
  searchTerm = '',
  onSearchChange,
  categoryCounts,
  cartCount = 0,
  onOpenCart,
  isLoading = false,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showTierModal, setShowTierModal] = useState(false);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [commentModalProduct, setCommentModalProduct] = useState<Product | null>(null);
  const [lightboxProduct, setLightboxProduct] = useState<Product | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [addedAnimationId, setAddedAnimationId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  useModalHistory(isFullscreen, () => setIsFullscreen(false), 'carouselFullscreen');
  useModalHistory(showTierModal, () => setShowTierModal(false), 'carouselTierModal');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const thumbnailsRef = useRef<HTMLDivElement>(null);
  const carouselWrapperRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScroll = useRef(false);

  useEffect(() => {
    if (activeIndex >= products.length && products.length > 0) {
      setActiveIndex(products.length - 1);
    } else if (products.length === 0 && activeIndex !== 0) {
      setActiveIndex(0);
    }
  }, [products.length, activeIndex]);

  const scrollToIndex = useCallback(
    (index: number, smooth: boolean = true) => {
      if (!containerRef.current || products.length === 0) return;
      const targetIndex = Math.max(0, Math.min(index, products.length - 1));
      const container = containerRef.current;
      const cardWidth = container.clientWidth;
      isProgrammaticScroll.current = true;
      container.scrollTo({
        left: targetIndex * cardWidth,
        behavior: smooth ? 'smooth' : 'auto',
      });
      setActiveIndex(targetIndex);

      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 400);

      if (thumbnailsRef.current) {
        const thumbElement = thumbnailsRef.current.children[targetIndex] as HTMLElement;
        if (thumbElement) {
          thumbElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }
    },
    [products.length]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollToIndex(activeIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        scrollToIndex(activeIndex + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, scrollToIndex]);

  const handleScroll = () => {
    if (isProgrammaticScroll.current || !containerRef.current) return;
    const container = containerRef.current;
    const cardWidth = container.clientWidth;
    if (cardWidth > 0) {
      const newIndex = Math.round(container.scrollLeft / cardWidth);
      if (newIndex !== activeIndex && newIndex >= 0 && newIndex < products.length) {
        setActiveIndex(newIndex);
        if (thumbnailsRef.current) {
          const thumbElement = thumbnailsRef.current.children[newIndex] as HTMLElement;
          if (thumbElement) {
            thumbElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
        }
      }
    }
  };

  const toggleFullscreen = useCallback(() => {
    const nextState = !isFullscreen;
    setIsFullscreen(nextState);
    const doc = document as any;
    const elem = (carouselWrapperRef.current || document.documentElement) as any;
    if (nextState) {
      try {
        if (elem?.requestFullscreen) elem.requestFullscreen().catch(() => {});
        else if (elem?.webkitRequestFullscreen) elem.webkitRequestFullscreen();
      } catch {}
    } else {
      try {
        if (doc.fullscreenElement || doc.webkitFullscreenElement) {
          if (doc.exitFullscreen) doc.exitFullscreen().catch(() => {});
          else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        }
      } catch {}
    }
  }, [isFullscreen]);

  const handleCartClick = () => {
    if (isFullscreen) toggleFullscreen();
    onOpenCart?.();
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const isNative = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      if (!isNative && isFullscreen) setIsFullscreen(false);
    };
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxProduct) {
          setLightboxProduct(null);
          return;
        }
        if (showTierModal) {
          setShowTierModal(false);
          return;
        }
        if (commentModalProduct) {
          setCommentModalProduct(null);
          return;
        }
        if (isCategoryDropdownOpen) {
          setIsCategoryDropdownOpen(false);
          return;
        }
        if (isFullscreen) {
          toggleFullscreen();
        }
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('keydown', handleEscapeKey);
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleEscapeKey);
      document.body.style.overflow = '';
    };
  }, [isFullscreen, lightboxProduct, showTierModal, commentModalProduct, isCategoryDropdownOpen, toggleFullscreen]);

  const [quantities, setQuantities] = useState<Record<string, number | string>>({});

  const getItemQty = (productId: string): number | string =>
    quantities[productId] !== undefined ? quantities[productId] : 1;

  const handleQtyChange = (productId: string, val: string) => {
    if (val === '') {
      setQuantities((prev) => ({ ...prev, [productId]: '' }));
      return;
    }
    const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed)) setQuantities((prev) => ({ ...prev, [productId]: parsed }));
  };

  const handleQtyBlur = (productId: string) => {
    const cur = quantities[productId];
    if (cur === '' || cur === 0 || cur === undefined) {
      setQuantities((prev) => ({ ...prev, [productId]: 1 }));
    }
  };

  const handleAdd = (product: Product) => {
    if (!hasCartAccess) return;
    const isOutOfStock = product.stock <= 0 || product.status === 'out_of_stock';
    if (isOutOfStock && showStock) return;
    const rawQty = quantities[product.id];
    const finalQty = typeof rawQty === 'number' && rawQty > 0 ? rawQty : 1;
    onAddToCart(product, finalQty, comments[product.id]?.trim() || undefined);
    setAddedAnimationId(product.id);
    setTimeout(() => setAddedAnimationId(null), 1200);
  };

  const activeList = visiblePriceLists.find((l) => l.id === currentTier) || visiblePriceLists[0];

  const lightboxEntries: LightboxPriceEntry[] = lightboxProduct && hasPriceAccess
    ? whiteLabelMode
      ? [{ id: 'venta', label: 'Precio', amount: resolvePrice(lightboxProduct, activeList?.id || currentTier), highlight: true }]
      : visiblePriceLists.map((l) => ({
          id: l.id,
          label: l.name,
          amount: resolvePrice(lightboxProduct, l.id),
          highlight: l.id === activeList?.id,
        }))
    : [];

  return (
    <div
      ref={carouselWrapperRef}
      className={`relative w-full transition-all duration-300 ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-[#F8FAFC] p-2 sm:p-4 flex flex-col justify-between overflow-hidden h-[100dvh] w-screen'
          : 'flex flex-col space-y-4 mb-10'
      }`}
    >
      {/* Top Counter Bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white/95 rounded-2xl border border-slate-200/80 shadow-xs z-30 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="bg-[#3C5866] text-white text-xs font-black px-2.5 py-1 rounded-xl shrink-0">
            {products.length > 0 ? `${activeIndex + 1} / ${products.length}` : '0 / 0'}
          </span>

          {isFullscreen && onSearchChange && (
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-8 pr-6 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {isFullscreen && onCategoryChange && (
            <div className="relative shrink-0" ref={categoryDropdownRef}>
              <button
                type="button"
                onClick={() => setIsCategoryDropdownOpen((p) => !p)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 border border-slate-200 text-slate-700 cursor-pointer"
              >
                <Filter className="w-3.5 h-3.5 text-[#C37D41]" />
                <span className="max-w-[110px] truncate">
                  {selectedCategory === 'all' ? 'Categorías' : selectedCategory}
                </span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {isCategoryDropdownOpen && (
                <div className="absolute left-0 top-full mt-1.5 w-52 max-h-60 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-y-auto z-50 p-1.5 space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      onCategoryChange('all');
                      setIsCategoryDropdownOpen(false);
                    }}
                    className={`w-full flex justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                      selectedCategory === 'all' ? 'bg-[#3C5866] text-white' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>Todas</span>
                    <span>({categoryCounts?.all ?? products.length})</span>
                  </button>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        onCategoryChange(cat);
                        setIsCategoryDropdownOpen(false);
                      }}
                      className={`w-full flex justify-between px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                        selectedCategory === cat ? 'bg-[#3C5866] text-white' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{cat}</span>
                      <span>({categoryCounts?.[cat] ?? 0})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-amber-50 hover:bg-amber-100 text-[#C37D41] border border-amber-200 cursor-pointer"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-3.5 h-3.5" />
              <span>Normal</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden min-[380px]:inline">Pantalla Completa</span>
            </>
          )}
        </button>
      </div>

      {products.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-4 min-h-[260px]">
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-100 shadow-xs max-w-sm w-full">
            <PackageX className="w-10 h-10 mx-auto mb-3 text-[#C37D41]" />
            <h3 className="text-sm font-bold text-[#3C5866]">
              {isLoading ? 'Cargando referencias...' : 'Sin resultados'}
            </h3>
          </div>
        </div>
      ) : (
        <>
          <div className="relative w-full flex-1 min-h-0 flex items-center">
            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex - 1)}
              disabled={activeIndex === 0}
              aria-label="Anterior"
              className="absolute left-1 sm:left-3 z-20 w-9 h-9 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center bg-white/95 border border-slate-200 shadow-md text-[#3C5866] disabled:opacity-15 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => scrollToIndex(activeIndex + 1)}
              disabled={activeIndex === products.length - 1}
              aria-label="Siguiente"
              className="absolute right-1 sm:right-3 z-20 w-9 h-9 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center bg-white/95 border border-slate-200 shadow-md text-[#3C5866] disabled:opacity-15 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div
              ref={containerRef}
              onScroll={handleScroll}
              className="w-full flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-none py-1 items-center"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {products.map((product, idx) => {
                const cardColor = getPastelBgColor();
                const currentPrice = hasPriceAccess ? resolvePrice(product, activeList?.id || currentTier) : 0;
                const isOutOfStock = product.stock <= 0 || product.status === 'out_of_stock';
                const isAdded = addedAnimationId === product.id;
                const isCurrent = idx === activeIndex;
                const displayUrl = getSharedProductImage(product.sku, product.processedImageUrl);

                return (
                  <div key={product.id} className="w-full flex-shrink-0 snap-center flex justify-center px-2 sm:px-12">
                    <div
                      className={`w-full max-w-3xl rounded-3xl overflow-hidden border flex flex-col md:flex-row items-stretch shadow-lg transition-all ${
                        isCurrent ? 'scale-100 opacity-100' : 'scale-95 opacity-50'
                      }`}
                      style={{ backgroundColor: cardColor.hex, borderColor: cardColor.border }}
                    >
                      <div
                        onClick={() => {
                          if (displayUrl) setLightboxProduct(product);
                        }}
                        className={`relative w-full aspect-square md:aspect-auto md:w-1/2 min-h-[260px] sm:min-h-[340px] flex items-center justify-center shrink-0 ${
                          displayUrl ? 'cursor-pointer' : ''
                        }`}
                      >
                        <span
                          className={`absolute top-3 z-10 bg-[#3C5866]/95 text-white text-xs font-black px-3 py-1 rounded-xl uppercase ${
                            !showStock ? 'left-1/2 -translate-x-1/2' : 'left-3'
                          }`}
                        >
                          {product.sku}
                        </span>

                        {showStock && (
                          isOutOfStock ? (
                            <span className="absolute top-3 right-3 z-10 bg-rose-500/95 text-white text-xs font-bold px-3 py-1 rounded-xl flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" />
                              Agotado
                            </span>
                          ) : (
                            <span className="absolute top-3 right-3 z-10 text-xs font-bold text-slate-700 bg-white/95 px-3 py-1 rounded-xl border border-slate-200/70">
                              Stock: {product.stock} u.
                            </span>
                          )
                        )}

                        {product.size && (
                          <span className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 text-xs font-bold text-slate-800 bg-white/95 px-3 py-1 rounded-xl border border-slate-200/70 whitespace-nowrap uppercase">
                            {formatSize(product.size)}
                          </span>
                        )}

                        {displayUrl ? (
                          <Image
                            src={displayUrl}
                            alt={product.name}
                            fill
                            priority={idx === activeIndex}
                            className="object-contain p-2"
                            sizes="(max-width: 768px) 100vw, 500px"
                          />
                        ) : (
                          <ImageIcon className="w-12 h-12 text-slate-300 stroke-1" />
                        )}
                      </div>

                      <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <span className="text-xs uppercase font-extrabold text-[#C37D41] tracking-wider block mb-1">
                            {product.category}
                          </span>
                          <h2 className="text-lg sm:text-2xl font-black text-[#263842] leading-tight mb-3 line-clamp-2">
                            {product.name}
                          </h2>

                          {hasPriceAccess ? (
                            <div className="bg-white/85 rounded-2xl p-3 border border-white/60 shadow-xs">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-slate-500 uppercase">
                                  {whiteLabelMode ? 'Precio' : activeList?.name || 'Tarifa'}
                                </span>
                                {!whiteLabelMode && visiblePriceLists.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModalProduct(product);
                                      setShowTierModal(true);
                                    }}
                                    className="text-slate-400 hover:text-[#C37D41] cursor-pointer"
                                  >
                                    <Info className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                              <div className="text-2xl sm:text-3xl font-black text-[#3C5866] mt-0.5">
                                {formatCurrency(currentPrice, currencySymbol)}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-white/85 rounded-2xl p-3.5 border border-white/60 text-xs font-bold text-slate-600 flex items-center gap-2">
                              <Lock className="w-4 h-4 text-[#C37D41] shrink-0" />
                              <span>Regístrate para consultar precios</span>
                            </div>
                          )}
                        </div>

                        {hasCartAccess ? (
                          <div className="pt-3 flex items-stretch gap-2">
                            <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  const cur = typeof getItemQty(product.id) === 'number' ? (getItemQty(product.id) as number) : 1;
                                  if (cur > 1) setQuantities((prev) => ({ ...prev, [product.id]: cur - 1 }));
                                }}
                                disabled={isOutOfStock && showStock}
                                className="w-8 h-9 flex items-center justify-center text-slate-500 font-black cursor-pointer"
                              >
                                -
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                disabled={isOutOfStock && showStock}
                                value={getItemQty(product.id)}
                                onChange={(e) => handleQtyChange(product.id, e.target.value)}
                                onBlur={() => handleQtyBlur(product.id)}
                                className="w-9 text-center text-xs font-black text-[#3C5866] bg-transparent focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const cur = typeof getItemQty(product.id) === 'number' ? (getItemQty(product.id) as number) : 1;
                                  setQuantities((prev) => ({ ...prev, [product.id]: cur + 1 }));
                                }}
                                disabled={isOutOfStock && showStock}
                                className="w-8 h-9 flex items-center justify-center text-slate-500 font-black cursor-pointer"
                              >
                                +
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => setCommentModalProduct(product)}
                              disabled={isOutOfStock && showStock}
                              className={`w-10 flex items-center justify-center rounded-2xl border shrink-0 cursor-pointer ${
                                comments[product.id]?.trim() ? 'bg-amber-50 text-[#C37D41] border-amber-300' : 'bg-white text-slate-400 border-slate-200'
                              }`}
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleAdd(product)}
                              disabled={isOutOfStock && showStock}
                              className={`flex-1 py-2.5 px-4 rounded-2xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer ${
                                isOutOfStock && showStock
                                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                  : isAdded
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-[#3C5866] hover:bg-[#263842] text-white'
                              }`}
                            >
                              {isAdded ? (
                                <>
                                  <Check className="w-4 h-4" />
                                  <span>Listo</span>
                                </>
                              ) : (
                                <>
                                  <ShoppingBag className="w-4 h-4 text-[#FFF3CD]" />
                                  <span>Agregar</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="pt-3">
                            <button
                              type="button"
                              onClick={onRequestPriceAccess}
                              className="w-full py-3 px-4 bg-[#3C5866] hover:bg-[#263842] text-white font-extrabold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <Lock className="w-4 h-4 text-[#FFF3CD]" />
                              <span>Solicitar Acceso</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-end gap-2 z-30 shrink-0">
            <div className="bg-white/90 rounded-2xl p-1.5 border border-slate-200/80 flex-1 flex items-center overflow-hidden h-14">
              <div ref={thumbnailsRef} className="flex items-center gap-1.5 overflow-x-auto scrollbar-none w-full" style={{ scrollbarWidth: 'none' }}>
                {products.map((product, idx) => {
                  const isSelected = idx === activeIndex;
                  const thumbUrl = getSharedProductImage(product.sku, product.processedImageUrl);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => scrollToIndex(idx)}
                      className={`relative flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border-2 bg-white flex items-center justify-center cursor-pointer ${
                        isSelected ? 'border-[#3C5866] ring-2 ring-[#C37D41]/40' : 'border-slate-200 opacity-70'
                      }`}
                    >
                      {thumbUrl ? (
                        <Image src={thumbUrl} alt={product.name} fill className="object-contain p-0.5" sizes="44px" />
                      ) : (
                        <span className="text-[8px] font-black text-slate-400">{product.sku}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {isFullscreen && hasCartAccess && onOpenCart && (
              <button
                type="button"
                onClick={handleCartClick}
                className="relative w-14 h-14 flex items-center justify-center bg-[#3C5866] text-white rounded-2xl shadow-md cursor-pointer shrink-0"
              >
                <ShoppingCart className="w-5 h-5 text-[#FFF3CD]" />
                {cartCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-[#C37D41] text-white text-[10px] font-black min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center border-2 border-white">
                    {cartCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </>
      )}

      {/* Tier Modal */}
      {showTierModal && modalProduct && hasPriceAccess && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-[#C37D41] uppercase">{modalProduct.sku}</span>
                <h3 className="text-sm font-bold text-[#3C5866]">{modalProduct.name}</h3>
              </div>
              <button type="button" onClick={() => setShowTierModal(false)} className="text-slate-400 p-1 cursor-pointer">✕</button>
            </div>
            <div className="space-y-1.5 text-xs">
              {visiblePriceLists.map((list) => {
                const amt = resolvePrice(modalProduct, list.id);
                const isSelected = list.id === activeList?.id;
                return (
                  <div
                    key={list.id}
                    className={`flex justify-between p-2.5 rounded-xl border ${
                      isSelected ? 'bg-amber-50/70 border-amber-200' : 'bg-slate-50 border-slate-100'
                    }`}
                  >
                    <span className="font-bold text-slate-700">{list.name}</span>
                    <span className={`font-black ${isSelected ? 'text-[#C37D41]' : 'text-[#3C5866]'}`}>
                      {formatCurrency(amt, currencySymbol)}
                    </span>
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={() => setShowTierModal(false)} className="w-full py-2.5 bg-[#3C5866] text-white font-bold text-xs rounded-xl cursor-pointer">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Comment Modal */}
      {commentModalProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-[#C37D41] uppercase">{commentModalProduct.sku}</span>
                <h3 className="text-sm font-bold text-[#3C5866] line-clamp-1">{commentModalProduct.name}</h3>
              </div>
              <button type="button" onClick={() => setCommentModalProduct(null)} className="text-slate-400 p-1 cursor-pointer">✕</button>
            </div>
            <textarea
              value={comments[commentModalProduct.id] || ''}
              onChange={(e) => setComments((prev) => ({ ...prev, [commentModalProduct.id]: e.target.value }))}
              placeholder="Especificación..."
              rows={3}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3C5866]/30 resize-none"
              autoFocus
            />
            <button type="button" onClick={() => setCommentModalProduct(null)} className="w-full py-2.5 bg-[#3C5866] text-white font-bold text-xs rounded-xl cursor-pointer">
              Guardar
            </button>
          </div>
        </div>
      )}

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
        visiblePriceEntries={lightboxEntries}
        hidePrices={!hasPriceAccess}
        currencySymbol={currencySymbol}
        isOutOfStock={lightboxProduct ? lightboxProduct.stock <= 0 || lightboxProduct.status === 'out_of_stock' : false}
        showStock={showStock}
      />
    </div>
  );
};
