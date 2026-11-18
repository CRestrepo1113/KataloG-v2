'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Upload, Sparkles, RefreshCw, CheckCircle2, Palette, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { BRAND_COLORS } from '@/lib/theme';

interface AIImageUploaderProps {
  currentImageUrl?: string;
  onImageProcessed: (imageUrl: string) => void;
}

export const AIImageUploader: React.FC<AIImageUploaderProps> = ({
  currentImageUrl,
  onImageProcessed,
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Procesando Imagen...');
  const [preview, setPreview] = useState<string | null>(currentImageUrl || null);
  const [originalBackupUrl, setOriginalBackupUrl] = useState<string | null>(currentImageUrl || null);

  useEffect(() => {
    setPreview(currentImageUrl || null);
    if (!originalBackupUrl) {
      setOriginalBackupUrl(currentImageUrl || null);
    }

    if (typeof window !== 'undefined') {
      const g = window as unknown as { ort?: { env?: { wasm?: { numThreads?: number } } } };
      g.ort = g.ort || {};
      g.ort.env = g.ort.env || {};
      g.ort.env.wasm = g.ort.env.wasm || {};
      g.ort.env.wasm.numThreads = 1;
    }

    // Preload AI model quietly in background so it executes instantly when clicked
    import('@imgly/background-removal')
      .then(({ preload }) => preload().catch(() => {}))
      .catch(() => {});
  }, [currentImageUrl]);


  // Clean 600x600 WebP Standardizer
  const processCleanOriginal = (sourceUrlOrFile: string | File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = typeof sourceUrlOrFile === 'string' ? sourceUrlOrFile : URL.createObjectURL(sourceUrlOrFile);
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.clearRect(0, 0, 600, 600);
          const scale = Math.min(600 / img.width, 600 / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (600 - w) / 2;
          const y = (600 - h) / 2;

          ctx.drawImage(img, x, y, w, h);
          resolve(canvas.toDataURL('image/webp', 0.90));
        } else {
          resolve(img.src);
        }
      };
      img.onerror = () => resolve(typeof sourceUrlOrFile === 'string' ? sourceUrlOrFile : '');
    });
  };

  // 600x600 Studio Pastel Background Compositor
  const processStudioPastel = (sourceUrlOrFile: string | File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = typeof sourceUrlOrFile === 'string' ? sourceUrlOrFile : URL.createObjectURL(sourceUrlOrFile);
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.fillStyle = BRAND_COLORS.cardBg.hex;
          ctx.fillRect(0, 0, 600, 600);

          // Mantener escala 100% original sin añadir recuadros ni márgenes internos
          const scale = Math.min(600 / img.width, 600 / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const x = (600 - w) / 2;
          const y = (600 - h) / 2;

          ctx.drawImage(img, x, y, w, h);

          resolve(canvas.toDataURL('image/webp', 0.90));
        } else {
          resolve(img.src);
        }
      };
      img.onerror = () => resolve(typeof sourceUrlOrFile === 'string' ? sourceUrlOrFile : '');
    });
  };

  // Handle File Change when user picks a file from disk
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setLoadingText('Cargando imagen...');
    try {
      const webpUrl = await processCleanOriginal(file);
      setPreview(webpUrl);
      setOriginalBackupUrl(webpUrl);
      onImageProcessed(webpUrl);
    } catch {
      const fallbackUrl = URL.createObjectURL(file);
      setPreview(fallbackUrl);
      onImageProcessed(fallbackUrl);
    } finally {
      setLoading(false);
      setLoadingText('Procesando Imagen...');
    }
  };

  // Run AI Background Removal directly in browser (WebAssembly)
  const handleRunAIRembg = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!preview) return;

    setLoading(true);
    setLoadingText('Recortando fondo con IA...');
    try {
      const { removeBackground } = await import('@imgly/background-removal');
      const blob = await removeBackground(preview, {
        progress: (_key, current, total) => {
          if (total > 0) {
            const pct = Math.round((current / total) * 100);
            setLoadingText(`IA Procesando: ${pct}%`);
          }
        },
      });

      const transparentUrl = URL.createObjectURL(blob);
      const clean500 = await processCleanOriginal(transparentUrl);
      setPreview(clean500);
      onImageProcessed(clean500);
    } catch (err) {
      console.error('Error en recorte de IA en el navegador:', err);
      alert('No se pudo completar el recorte automático en el navegador. Se conserva la imagen actual.');
    } finally {
      setLoading(false);
      setLoadingText('Procesando Imagen...');
    }
  };

  // Apply Studio Pastel Background on currently loaded image
  const handleApplyPastel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!preview) return;

    setLoading(true);
    setLoadingText('Aplicando fondo pastel...');
    try {
      const pastelUrl = await processStudioPastel(preview);
      setPreview(pastelUrl);
      onImageProcessed(pastelUrl);
    } finally {
      setLoading(false);
      setLoadingText('Procesando Imagen...');
    }
  };


  // Revert back to original image
  const handleRevertOriginal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (originalBackupUrl) {
      setPreview(originalBackupUrl);
      onImageProcessed(originalBackupUrl);
    }
  };

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <label className="block font-extrabold text-slate-700 uppercase tracking-wider">
          Fotografía de Referencia
        </label>
        <span className="text-[10px] text-slate-400 font-bold">
          Estandarización 600x600 WebP
        </span>
      </div>

      <div className="border border-dashed border-slate-200 rounded-2xl p-3 bg-slate-50 text-center overflow-hidden">
        {preview ? (
          <div className="space-y-3">
            {/* Image Preview Box with File Upload Trigger */}
            <div className="relative w-full aspect-square max-w-[180px] mx-auto rounded-xl overflow-hidden shadow-sm bg-white p-1 group cursor-pointer">
              <Image
                src={preview}
                alt="Vista previa"
                fill
                className="object-contain"
              />
              <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-bold gap-1 backdrop-blur-xs">
                <Upload className="w-4 h-4 text-[#FFF3CD]" />
                <span>Cambiar Foto</span>
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              {loading && (
                <div className="absolute inset-0 bg-slate-900/75 backdrop-blur-xs flex flex-col items-center justify-center text-white p-2 space-y-1 z-20">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#FFF3CD]" />
                  <span className="text-[11px] font-bold">{loadingText}</span>
                </div>
              )}

            </div>

            {/* Editing Action Buttons strictly targeted at loaded image */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 pt-2 border-t border-slate-200/70 relative z-30">
              <button
                type="button"
                onClick={handleRunAIRembg}
                disabled={loading}
                className="bg-white hover:bg-amber-50 text-[#C37D41] border border-amber-300 px-3 py-1.5 rounded-xl font-extrabold text-[11px] flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
                title="Remover fondo con Inteligencia Artificial Rembg sobre esta foto"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#C37D41]" />
                <span>IA Rembg</span>
              </button>

              <button
                type="button"
                onClick={handleApplyPastel}
                disabled={loading}
                className="bg-white hover:bg-slate-100 text-[#3C5866] border border-slate-300 px-3 py-1.5 rounded-xl font-extrabold text-[11px] flex items-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer"
                title="Aplicar fondo pastel de estudio a esta foto"
              >
                <Palette className="w-3.5 h-3.5 text-[#3C5866]" />
                <span>Fondo Pastel</span>
              </button>

              {originalBackupUrl && originalBackupUrl !== preview && (
                <button
                  type="button"
                  onClick={handleRevertOriginal}
                  disabled={loading}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 p-1.5 rounded-xl font-bold transition-all cursor-pointer"
                  title="Restablecer a la foto original"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="relative py-6 space-y-1.5 cursor-pointer hover:bg-slate-100 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-[#ECE4F0] text-[#3C5866] flex items-center justify-center mx-auto">
              <Upload className="w-5 h-5 text-[#C37D41]" />
            </div>
            <div className="text-xs font-bold text-[#3C5866]">
              Subir Imagen de Referencia
            </div>
            <p className="text-[10.5px] text-slate-400">
              Carga la imagen original o PNG transparente
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
        )}
      </div>

      {preview && !loading && (
        <div className="flex items-center justify-between text-[10.5px] text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-xl border border-emerald-100">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Foto Optimizada (600x600 WebP)</span>
          </div>
        </div>
      )}
    </div>
  );
};
