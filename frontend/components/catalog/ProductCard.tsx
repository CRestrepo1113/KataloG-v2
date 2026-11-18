'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { PriceList, PriceTier, Product } from '@/lib/types';
import { getPastelBgColor, formatCurrency, formatSize } from '@/lib/theme';
import { getSharedProductImage } from '@/lib/firestore';
import { useModalHistory } from '@/lib/useModalHistory';
import { ImageLightboxModal, LightboxPriceEntry } from '@/components/common/ImageLightboxModal';
import { ShoppingBag, Info, Check, AlertCircle, Image as ImageIcon, MessageSquare, Lock } from 'lucide-react';

interface ProductCardProps {
  product: Product;
  index: number;
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
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
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
}) => {
  const [showTierModal, setShowTierModal] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showImageLightbox, setShowImageLightbox] = useState(false);
  const [comment, setComment] = useState('');
  const [addedAnimation, setAddedAnimation] = useState(false);
  const [quantity, setQuantity] = useState<number | string>(1);

  useModalHistory(showTierModal, () => setShowTierModal(false), 'cardTierModal');
  useModalHistory(showCommentModal, () => setShowCommentModal(false), 'cardCommentModal');

  const displayUrl = useMemo(
    () => getSharedProductImage(product.sku, product.processedImageUrl),
    [product.sku, product.processedImageUrl]
  );

  const cardColor = getPastelBgColor();

  const handleQtyChange = (val: string) => {
    if (val === '') {
      setQuantity('');
      return;
    }
    const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed)) {
      setQuantity(parsed);
    }
  };

  const handleQtyBlur = () => {
    if (quantity === '' || quantity === 0) {
      setQuantity(1);
    }
  };

  const activeList = visiblePriceLists.find((l) => l.id === currentTier) || visiblePriceLists[0];
  const currentPrice = hasPriceAccess ? resolvePrice(product, activeList?.id || currentTier) : 0;
  const isOutOfStock = product.stock <= 0 || product.status === 'out_of_stock';

  const lightboxEntries: LightboxPriceEntry[] = useMemo(() => {
    if (!hasPriceAccess) return [];
    if (whiteLabelMode) {
      return [{ id: 'venta', label: 'Precio', amount: currentPrice, highlight: true }];
    }
    return visiblePriceLists.map((l) => ({
      id: l.id,
      label: l.name,
      amount: resolvePrice(product, l.id),
      highlight: l.id === activeList?.id,
    }));
  }, [hasPriceAccess, whiteLabelMode, currentPrice, visiblePriceLists, resolvePrice, product, activeList]);

  const handleAdd = () => {
    if (!hasCartAccess) return;
    if (isOutOfStock && showStock) return;
    const finalQty = typeof quantity === 'number' && quantity > 0 ? quantity : 1;
    onAddToCart(product, finalQty, comment.trim() || undefined);
    setAddedAnimation(true);
    setTimeout(() => setAddedAnimation(false), 1200);
  };

  return (
    <>
      <div
        className="group relative rounded-[24px] overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl border flex flex-col justify-between"
        style={{ backgroundColor: cardColor.hex, borderColor: cardColor.border }}
      >
        {/* Image Showcase */}
        <div
          onClick={() => {
            if (displayUrl) setShowImageLightbox(true);
          }}
          className={`relative w-full aspect-square flex items-center justify-center overflow-hidden ${
            displayUrl ? 'cursor-pointer' : ''
          }`}
        >
          <span
            className={`absolute top-2.5 z-10 bg-[#3C5866]/95 text-white text-[11.5px] font-black px-2.5 py-1 rounded-xl uppercase tracking-wider shadow-sm ${
              !showStock ? 'left-1/2 -translate-x-1/2' : 'left-2.5'
            }`}
          >
            {product.sku}
          </span>

          {showStock && (
            isOutOfStock ? (
              <span className="absolute top-2.5 right-2.5 z-10 bg-rose-500/95 text-white text-[11px] font-bold px-2.5 py-1 rounded-xl flex items-center gap-1 shadow-sm">
                <AlertCircle className="w-3.5 h-3.5" />
                Agotado
              </span>
            ) : (
              <span className="absolute top-2.5 right-2.5 z-10 text-[11px] font-bold text-slate-700 bg-white/95 px-2.5 py-1 rounded-xl border border-slate-200/70 shadow-xs">
                Stock: {product.stock} u.
              </span>
            )
          )}

          {product.size && (
            <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 text-[11.5px] font-bold text-slate-800 bg-white/95 px-3 py-1 rounded-xl border border-slate-200/70 shadow-xs pointer-events-none whitespace-nowrap uppercase tracking-wider">
              {formatSize(product.size)}
            </span>
          )}

          {displayUrl ? (
            <Image
              src={displayUrl}
              alt={product.name}
              fill
              className="object-contain w-full h-full group-hover:scale-105 transition-transform duration-500 ease-out"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 33vw, 25vw"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 gap-1.5 p-4 select-none">
              <ImageIcon className="w-12 h-12 text-slate-300/80 stroke-1" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Sin Imagen
              </span>
            </div>
          )}
        </div>

        {/* Info & Action Section */}
        <div className="p-3.5 pt-2.5 flex-1 flex flex-col justify-between gap-1.5">
          <div>
            <span className="text-[10px] uppercase font-extrabold text-[#C37D41] tracking-wider block mb-0.5">
              {product.category}
            </span>
            <h4 className="text-sm font-extrabold text-[#263842] leading-snug line-clamp-2" title={product.name}>
              {product.name}
            </h4>
          </div>

          {hasPriceAccess ? (
            <div className="mt-1 pt-2 border-t border-slate-900/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                  {whiteLabelMode ? 'Precio' : activeList?.name || 'Tarifa'}
                </span>
                {!whiteLabelMode && visiblePriceLists.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowTierModal(true)}
                    className="text-slate-400 hover:text-[#C37D41] transition-colors p-0.5 cursor-pointer"
                    title="Ver tarifas"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="text-xl font-black text-[#3C5866] tracking-tight leading-tight mt-0.5">
                {formatCurrency(currentPrice, currencySymbol)}
              </div>

              {hasCartAccess && (
                <div className="mt-2.5 flex items-stretch gap-1.5">
                  <div className="flex items-center bg-white border border-slate-200/90 rounded-2xl p-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const cur = typeof quantity === 'number' ? quantity : 1;
                        if (cur > 1) setQuantity(cur - 1);
                      }}
                      disabled={isOutOfStock && showStock}
                      className="w-7 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl font-black text-xs disabled:opacity-30 cursor-pointer"
                    >
                      -
                    </button>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      disabled={isOutOfStock && showStock}
                      value={quantity}
                      onChange={(e) => handleQtyChange(e.target.value)}
                      onBlur={handleQtyBlur}
                      className="w-8 text-center text-xs font-black text-[#3C5866] bg-transparent focus:outline-none disabled:opacity-30"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const cur = typeof quantity === 'number' ? quantity : 1;
                        setQuantity(cur + 1);
                      }}
                      disabled={isOutOfStock && showStock}
                      className="w-7 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl font-black text-xs disabled:opacity-30 cursor-pointer"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCommentModal(true)}
                    disabled={isOutOfStock && showStock}
                    className={`w-8 flex items-center justify-center rounded-2xl border shrink-0 relative cursor-pointer disabled:opacity-30 ${
                      comment.trim()
                        ? 'bg-amber-50 text-[#C37D41] border-amber-300'
                        : 'bg-white text-slate-400 hover:text-[#3C5866] border-slate-200/90'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    {comment.trim() && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#C37D41] rounded-full" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={isOutOfStock && showStock}
                    className={`flex-1 py-2 px-2.5 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isOutOfStock && showStock
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : addedAnimation
                        ? 'bg-emerald-600 text-white'
                        : 'bg-[#3C5866] hover:bg-[#263842] text-white'
                    }`}
                  >
                    {addedAnimation ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Listo</span>
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="w-3.5 h-3.5 text-[#FFF3CD] shrink-0" />
                        <span>Agregar</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-1 pt-2.5 border-t border-slate-900/5">
              <button
                type="button"
                onClick={onRequestPriceAccess}
                className="w-full py-2.5 px-3 bg-white hover:bg-[#3C5866] text-[#3C5866] hover:text-white border border-slate-200 hover:border-[#3C5866] rounded-2xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-[#C37D41]" />
                <span>Ver Precio</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Comment Modal */}
      {showCommentModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-[#C37D41] uppercase">{product.sku}</span>
                <h3 className="text-sm font-bold text-[#3C5866] line-clamp-1">{product.name}</h3>
              </div>
              <button type="button" onClick={() => setShowCommentModal(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                ✕
              </button>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Especificación..."
              rows={3}
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3C5866]/30 text-slate-800 resize-none"
              autoFocus
            />
            <div className="flex items-center gap-2">
              {comment.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setComment('');
                    setShowCommentModal(false);
                  }}
                  className="py-2.5 px-3 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Borrar
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCommentModal(false)}
                className="flex-1 py-2.5 bg-[#3C5866] hover:bg-[#263842] text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tier Price Breakdown Modal (Solo listas habilitadas) */}
      {showTierModal && hasPriceAccess && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-[#C37D41] uppercase">{product.sku}</span>
                <h3 className="text-sm font-bold text-[#3C5866]">{product.name}</h3>
              </div>
              <button type="button" onClick={() => setShowTierModal(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                ✕
              </button>
            </div>

            <div className="space-y-1.5 text-xs">
              {visiblePriceLists.map((list) => {
                const amt = resolvePrice(product, list.id);
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

            <button
              type="button"
              onClick={() => setShowTierModal(false)}
              className="w-full py-2.5 bg-[#3C5866] text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <ImageLightboxModal
        isOpen={showImageLightbox}
        onClose={() => setShowImageLightbox(false)}
        imageUrl={displayUrl}
        sku={product.sku}
        name={product.name}
        category={product.category}
        size={product.size}
        stock={product.stock}
        status={product.status}
        visiblePriceEntries={lightboxEntries}
        hidePrices={!hasPriceAccess}
        currencySymbol={currencySymbol}
        isOutOfStock={isOutOfStock}
        showStock={showStock}
      />
    </>
  );
};
