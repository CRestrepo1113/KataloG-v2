'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Product } from '@/lib/types';
import { removeBackgroundBrowser, applyStudioPastelBrowser } from '@/lib/imageProcessor';
import { Sparkles, Palette, RefreshCw, CheckCircle2, AlertCircle, X, Check } from 'lucide-react';

interface BulkAIProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProducts: Product[];
  mode: 'rembg' | 'pastel';
  onSaveProcessedProducts: (updatedProducts: Product[]) => Promise<void>;
}

export const BulkAIProcessModal: React.FC<BulkAIProcessModalProps> = ({
  isOpen,
  onClose,
  selectedProducts,
  mode,
  onSaveProcessedProducts,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentProgress, setCurrentProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [processedResults, setProcessedResults] = useState<Product[]>([]);
  const [currentPreview, setCurrentPreview] = useState<string | null>(null);
  const isCancelledRef = useRef(false);

  // Filter only products that actually have an image
  const productsWithImage = selectedProducts.filter((p) =>
    Boolean((p.processedImageUrl && p.processedImageUrl.trim() !== '') || (p.originalImageUrl && p.originalImageUrl.trim() !== ''))
  );

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setCurrentProgress(0);
      setIsProcessing(false);
      setIsCompleted(false);
      setProcessedResults([]);
      setCurrentPreview(null);
      isCancelledRef.current = false;
    }
  }, [isOpen]);

  const handleStartProcessing = async () => {
    if (productsWithImage.length === 0) return;

    setIsProcessing(true);
    setIsCompleted(false);
    isCancelledRef.current = false;

    const updatedList: Product[] = [];

    for (let i = 0; i < productsWithImage.length; i++) {
      if (isCancelledRef.current) break;

      const product = productsWithImage[i];
      const sourceImage = product.processedImageUrl || product.originalImageUrl || '';
      setCurrentIndex(i);
      setCurrentProgress(0);
      setCurrentPreview(sourceImage || null);

      try {
        let newImageUrl = sourceImage;

        if (mode === 'rembg') {
          newImageUrl = await removeBackgroundBrowser(sourceImage, (pct) => {
            if (!isCancelledRef.current) {
              setCurrentProgress(pct);
            }
          });
        } else if (mode === 'pastel') {
          setCurrentProgress(50);
          newImageUrl = await applyStudioPastelBrowser(sourceImage);
          setCurrentProgress(100);
        }

        const updatedProduct: Product = {
          ...product,
          processedImageUrl: newImageUrl,
          originalImageUrl: product.originalImageUrl || sourceImage,
        };

        updatedList.push(updatedProduct);
        setProcessedResults([...updatedList]);
        setCurrentPreview(newImageUrl);
      } catch (err) {
        console.error(`Error procesando producto ${product.sku}:`, err);
      }
    }


    if (!isCancelledRef.current && updatedList.length > 0) {
      await onSaveProcessedProducts(updatedList);
    }

    setIsProcessing(false);
    setIsCompleted(true);
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    setIsProcessing(false);
  };

  if (!isOpen) return null;

  const currentProduct = productsWithImage[currentIndex];
  const totalCount = productsWithImage.length;
  const overallPercent = totalCount > 0 ? Math.round(((currentIndex + (isCompleted ? 1 : 0)) / totalCount) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 text-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-xs ${
              mode === 'rembg' ? 'bg-amber-100 text-[#C37D41]' : 'bg-[#D8E2DC] text-[#3C5866]'
            }`}>
              {mode === 'rembg' ? (
                <Sparkles className="w-5 h-5" />
              ) : (
                <Palette className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-800">
                {mode === 'rembg' ? 'IA Rembg Masivo' : 'Fondo Pastel Masivo'}
              </h3>
              <p className="text-[11px] text-slate-400 font-bold">
                {totalCount} referencias con imagen seleccionadas
              </p>
            </div>
          </div>

          {!isProcessing && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        {!isProcessing && !isCompleted ? (
          <div className="space-y-4 text-center py-2">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs text-slate-600 space-y-2 text-left">
              <div className="font-extrabold text-slate-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>¿Qué hará este proceso?</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {mode === 'rembg'
                  ? 'Recortará automáticamente el fondo de las referencias seleccionadas utilizando la IA local de tu navegador, preservando los detalles del peluche.'
                  : 'Centrará cada producto en un marco 600x600 WebP y le aplicará un fondo pastel de estudio con iluminación optimizada.'}
              </p>
            </div>

            {selectedProducts.length > productsWithImage.length && (
              <div className="flex items-center gap-2 bg-amber-50 text-amber-800 px-3 py-2 rounded-xl text-[11px] font-bold border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  {selectedProducts.length - productsWithImage.length} referencias sin imagen serán omitidas.
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleStartProcessing}
                disabled={totalCount === 0}
                className={`px-5 py-2.5 rounded-xl text-xs font-extrabold text-white flex items-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer ${
                  mode === 'rembg'
                    ? 'bg-[#C37D41] hover:bg-[#a86832]'
                    : 'bg-[#3C5866] hover:bg-[#2c424e]'
                } ${totalCount === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {mode === 'rembg' ? <Sparkles className="w-4 h-4 text-[#FFF3CD]" /> : <Palette className="w-4 h-4" />}
                <span>Iniciar Procesamiento ({totalCount})</span>
              </button>
            </div>
          </div>
        ) : isProcessing ? (
          <div className="space-y-4 py-3">
            {/* Live Progress Box */}
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span>Procesando {currentIndex + 1} de {totalCount}</span>
              <span className="text-[#C37D41] font-extrabold">{overallPercent}%</span>
            </div>

            {/* Main Progress Bar */}
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
              <div
                className="h-full bg-gradient-to-r from-[#C37D41] to-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${overallPercent}%` }}
              />
            </div>

            {/* Current Item Preview Card */}
            {currentProduct && (
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/70">
                <div className="relative w-14 h-14 bg-white rounded-xl overflow-hidden shadow-2xs shrink-0 border border-slate-200">
                  {currentPreview ? (
                    <Image
                      src={currentPreview}
                      alt={currentProduct.name}
                      fill
                      className="object-contain p-0.5"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <RefreshCw className="w-5 h-5 animate-spin text-[#C37D41]" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider">
                    {currentProduct.sku}
                  </div>
                  <div className="text-xs font-black text-slate-800 truncate">
                    {currentProduct.name}
                  </div>
                  <div className="text-[10.5px] text-slate-400 font-bold flex items-center gap-1.5 mt-0.5">
                    <RefreshCw className="w-3 h-3 animate-spin text-[#C37D41]" />
                    <span>
                      {mode === 'rembg' ? `IA Recortando: ${currentProgress}%` : 'Aplicando Estudio...'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
              >
                Detener Proceso
              </button>
            </div>
          </div>
        ) : (
          /* Completed View */
          <div className="space-y-4 text-center py-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-sm">
              <Check className="w-7 h-7 stroke-[3]" />
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-slate-800">
                ¡Procesamiento Completado!
              </h4>
              <p className="text-xs text-slate-500 font-medium">
                Se actualizaron <strong className="text-emerald-700">{processedResults.length}</strong> referencias con éxito.
              </p>
            </div>

            <div className="pt-3">
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-[#3C5866] hover:bg-[#2c424e] text-white py-2.5 rounded-2xl text-xs font-extrabold shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                Cerrar y Ver Resultados
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
