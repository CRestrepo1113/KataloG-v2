'use client';

import React, { useState } from 'react';
import { PriceList, PriceTier, Product } from '@/lib/types';
import { ProductCard } from './ProductCard';
import { PackageX } from 'lucide-react';

interface ProductGridProps {
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
  isLoading?: boolean;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
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
  isLoading = false,
}) => {
  const [displayCount, setDisplayCount] = useState(24);

  if (products.length === 0) {
    if (isLoading) {
      return (
        <div className="space-y-6 mb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={`grid-skeleton-${i}`}
                className="bg-white rounded-3xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between animate-pulse"
              >
                <div className="w-full aspect-square bg-slate-100 rounded-2xl mb-4" />
                <div className="space-y-2.5">
                  <div className="h-4 bg-slate-200 rounded-md w-3/4" />
                  <div className="h-3.5 bg-slate-100 rounded-md w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-3xl p-10 text-center border border-slate-100 shadow-xs max-w-md mx-auto my-8">
        <div className="w-14 h-14 bg-slate-100 text-[#3C5866] rounded-2xl flex items-center justify-center mx-auto mb-3">
          <PackageX className="w-7 h-7 text-[#C37D41]" />
        </div>
        <h3 className="text-base font-bold text-[#3C5866]">Sin resultados</h3>
      </div>
    );
  }

  const visibleProducts = products.slice(0, displayCount);
  const hasMore = displayCount < products.length;

  return (
    <div className="space-y-8 mb-12">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
        {visibleProducts.map((product, idx) => (
          <ProductCard
            key={product.id}
            product={product}
            index={idx}
            currentTier={currentTier}
            visiblePriceLists={visiblePriceLists}
            resolvePrice={resolvePrice}
            hasPriceAccess={hasPriceAccess}
            hasCartAccess={hasCartAccess}
            whiteLabelMode={whiteLabelMode}
            currencySymbol={currencySymbol}
            showStock={showStock}
            onAddToCart={onAddToCart}
            onRequestPriceAccess={onRequestPriceAccess}
          />
        ))}
      </div>

      {hasMore && (
        <div className="text-center pt-4">
          <button
            type="button"
            onClick={() => setDisplayCount((prev) => prev + 24)}
            className="bg-white hover:bg-slate-50 text-[#3C5866] border border-slate-200 px-6 py-3 rounded-2xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            Cargar más ({products.length - displayCount})
          </button>
        </div>
      )}
    </div>
  );
};
