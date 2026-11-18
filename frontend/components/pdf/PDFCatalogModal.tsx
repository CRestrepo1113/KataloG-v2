'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Product, CompanyInfo, PriceList, ResellerConfig } from '@/lib/types';
import { resolveProductPriceForList, resolveResellerPrice } from '@/lib/pricing';
import { formatCurrency, formatSize, isProductInCategory, getAllUniqueCategories } from '@/lib/theme';
import { getSharedProductImage } from '@/lib/firestore';
import jsPDF from 'jspdf';
import { toJpeg } from 'html-to-image';
import {
  FileText,
  X,
  Download,
  Award,
  Package,
  Truck,
  Phone,
  MapPin,
  Share2,
  Heart,
  Image as ImageIcon,
  Tag,
  CheckCircle2,
  Filter,
  Check,
  RefreshCw,
} from 'lucide-react';

interface PDFCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  categories?: string[];
  company: CompanyInfo | null;
  visiblePriceLists?: PriceList[];
  branchSlug?: string;
  whiteLabelMode?: boolean;
  resellerConfig?: ResellerConfig | null;
}

function getProductImageUrl(prod: Product): string {
  const direct =
    prod.processedImageUrl &&
    prod.processedImageUrl !== '/assets/REF_1.jpg' &&
    !prod.processedImageUrl.includes('REF_1.jpg')
      ? prod.processedImageUrl
      : undefined;

  const resolved = getSharedProductImage(prod.sku, direct);
  if (resolved && resolved !== '/assets/REF_1.jpg' && !resolved.includes('REF_1.jpg')) {
    return resolved;
  }
  return '';
}

function compressImageForPdf(src: string, maxDimension = 700, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    if (!src) return resolve('');
    if (src.startsWith('data:image/')) return resolve(src);

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(src);

        ctx.filter = 'contrast(105%) brightness(102%) saturate(105%)';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';

        resolve(canvas.toDataURL('image/webp', quality));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
  });
}

export const PDFCatalogModal: React.FC<PDFCatalogModalProps> = ({
  isOpen,
  onClose,
  products = [],
  categories = [],
  company,
  visiblePriceLists,
  branchSlug = 'costarica',
  whiteLabelMode = false,
  resellerConfig,
}) => {
  const effectivePriceLists: PriceList[] = useMemo(() => {
    if (visiblePriceLists && visiblePriceLists.length > 0) return visiblePriceLists;
    return [
      { id: 'wholesale', name: 'Mayorista', branchSlug, mode: 'manual', isActive: true, sortOrder: 3 },
      { id: 'dozen', name: 'Docena', branchSlug, mode: 'manual', isActive: true, sortOrder: 2 },
      { id: 'unit', name: 'Unidad', branchSlug, mode: 'manual', isActive: true, sortOrder: 1 },
    ];
  }, [visiblePriceLists, branchSlug]);

  const [selectedListId, setSelectedListId] = useState<string>(
    whiteLabelMode ? 'reseller' : effectivePriceLists[0]?.id || 'wholesale'
  );
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<string>('');
  const [mounted, setMounted] = useState(false);
  const [compressedImages, setCompressedImages] = useState<Record<string, string>>({});

  const [heroImageSrc, setHeroImageSrc] = useState<string>('/assets/hero_plushies_nobg.png');
  const [logoImageSrc, setLogoImageSrc] = useState<string>('/assets/Logo.png');

  useEffect(() => {
    if (isOpen) {
      setSelectedListId(whiteLabelMode ? 'reseller' : effectivePriceLists[0]?.id || 'wholesale');
    }
  }, [isOpen, whiteLabelMode, effectivePriceLists]);

  const safeCompany: CompanyInfo = useMemo(() => {
    return (
      company || {
        name: 'KYG DISTRIBUCIONES',
        phone: '+506 7032 1935',
        address: 'Costa Rica',
        slogan: 'Peluches con Alma',
        socialMedia: '@kygdistribuciones',
        logoUrl: '/assets/Logo.png',
        nameLogoUrl: '/assets/Nombre.png',
        currencySymbol: '$',
        currencyCode: 'USD',
        brandColors: { primary: '#3C5866', accent: '#C37D41', pastels: ['#B9E0FD'] },
      }
    );
  }, [company]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    compressImageForPdf('/assets/hero_plushies_nobg.png', 800, 0.85).then((d) => d && setHeroImageSrc(d));
    if (!whiteLabelMode) {
      compressImageForPdf(safeCompany.logoUrl || '/assets/Logo.png', 400, 0.9).then(
        (d) => d && setLogoImageSrc(d)
      );
    }
  }, [isOpen, safeCompany.logoUrl, whiteLabelMode]);

  const effectiveProducts = useMemo(() => products || [], [products]);

  const availableCategories = useMemo(() => {
    const activeProds = effectiveProducts.filter((p) => p.status !== 'disabled');
    const fromProducts = getAllUniqueCategories(activeProds);
    if (fromProducts.length > 0) return fromProducts;
    if (categories && categories.length > 0) {
      return Array.from(new Set(categories.filter((c) => Boolean(c && c.trim()))));
    }
    return [];
  }, [effectiveProducts, categories]);

  const isAllCategories = selectedCats.length === 0;

  const filteredProducts = useMemo(() => {
    return effectiveProducts.filter((p) => {
      if (p.status === 'disabled') return false;
      if (isAllCategories) return true;
      return selectedCats.some((cat) => isProductInCategory(p, cat));
    });
  }, [effectiveProducts, selectedCats, isAllCategories]);

  const toggleCategory = (cat: string) => {
    if (cat === 'all') {
      setSelectedCats([]);
      return;
    }
    if (isAllCategories) {
      setSelectedCats([cat]);
      return;
    }
    if (selectedCats.includes(cat)) {
      setSelectedCats(selectedCats.filter((c) => c !== cat));
    } else {
      const next = [...selectedCats, cat];
      setSelectedCats(next.length === availableCategories.length ? [] : next);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const run = async () => {
      const cache: Record<string, string> = {};
      for (const prod of filteredProducts) {
        const src = getProductImageUrl(prod);
        if (src && !cache[src]) {
          try {
            cache[src] = await compressImageForPdf(src, 600, 0.8);
          } catch {
            cache[src] = src;
          }
        }
      }
      if (active) setCompressedImages(cache);
    };
    run();
    return () => {
      active = false;
    };
  }, [isOpen, filteredProducts]);

  if (!isOpen) return null;

  const pageSize = 6;
  const pages: Product[][] = [];
  for (let i = 0; i < filteredProducts.length; i += pageSize) {
    pages.push(filteredProducts.slice(i, i + pageSize));
  }
  const totalPdfPages = pages.length + 2;

  const getPdfFileName = (): string => {
    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
    if (whiteLabelMode) {
      return `CATALOGO_${formattedDate}`;
    }
    const cleanLocation = (safeCompany.country || 'CR').replace(/[/\\?%*:|"<>]/g, '').trim().toUpperCase();
    return `CAT_KYG_${cleanLocation}_${formattedDate}`;
  };

  const handleDownloadPDF = async () => {
    if (isGenerating || filteredProducts.length === 0) return;
    setIsGenerating(true);
    setDownloadProgress('Preparando...');

    try {
      const container = document.getElementById('pdf-print-root');
      if (!container) throw new Error('Sin contenedor PDF');
      const pageElements = container.querySelectorAll<HTMLElement>('.print-page');
      if (pageElements.length === 0) throw new Error('Sin páginas');

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter', compress: true });
      const pdfWidth = 215.9;
      const pdfHeight = 279.4;

      for (let i = 0; i < pageElements.length; i++) {
        setDownloadProgress(`Página ${i + 1}/${pageElements.length}`);
        const imgData = await toJpeg(pageElements[i], {
          quality: 0.88,
          pixelRatio: 2,
          backgroundColor: '#ffffff',
          cacheBust: false,
        });
        if (i > 0) pdf.addPage('letter', 'portrait');
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
      }

      pdf.save(`${getPdfFileName()}.pdf`);
      setTimeout(() => {
        setIsGenerating(false);
        setDownloadProgress('');
        onClose();
      }, 400);
    } catch (err) {
      console.error('Error PDF:', err);
      setIsGenerating(false);
      setDownloadProgress('');
    }
  };

  const brandCoverTitle = whiteLabelMode ? (resellerConfig?.brandTitle || 'CATÁLOGO') : safeCompany.name;
  const activeResellerCostList =
    effectivePriceLists.find((l) => l.id === resellerConfig?.sourceCostListId) || effectivePriceLists[0];

  const renderProductPriceBadge = (prod: Product) => {
    if (whiteLabelMode) {
      if (selectedListId === 'no_price') return null;
      const cost = resolveProductPriceForList(prod, activeResellerCostList || 'wholesale', branchSlug, effectivePriceLists);
      const sale = resolveResellerPrice(cost, prod, resellerConfig);
      return (
        <div className="bg-[#3C5866] text-white rounded-full px-3.5 py-1 shadow-lg flex items-center justify-center gap-1.5 text-[9.5px] font-black whitespace-nowrap">
          <span className="text-[#FFF3CD] uppercase">Precio:</span>
          <span className="text-white text-[10.5px]">
            {formatCurrency(sale, safeCompany.currencySymbol || '$')}
          </span>
        </div>
      );
    }

    if (selectedListId === 'all' && effectivePriceLists.length > 1) {
      return (
        <div className="bg-[#3C5866] text-white rounded-full px-3 py-1 shadow-lg flex items-center justify-center gap-2 text-[9px] font-extrabold whitespace-nowrap">
          {effectivePriceLists.slice(0, 3).map((l, idx) => (
            <React.Fragment key={l.id}>
              {idx > 0 && <span className="text-slate-400">|</span>}
              <span className="flex items-center gap-0.5">
                <span className="text-[#FFF3CD] font-black">{l.name.charAt(0).toUpperCase()}:</span>
                <span>{formatCurrency(resolveProductPriceForList(prod, l, branchSlug, effectivePriceLists), safeCompany.currencySymbol || '$')}</span>
              </span>
            </React.Fragment>
          ))}
        </div>
      );
    }

    const listObj = effectivePriceLists.find((l) => l.id === selectedListId) || effectivePriceLists[0];
    if (!listObj) return null;
    const price = resolveProductPriceForList(prod, listObj, branchSlug, effectivePriceLists);
    return (
      <div className="bg-[#3C5866] text-white rounded-full px-3.5 py-1 shadow-lg flex items-center justify-center gap-1.5 text-[9.5px] font-black whitespace-nowrap">
        <span className="text-[#FFF3CD] uppercase">{listObj.name}:</span>
        <span className="text-white text-[10.5px]">
          {formatCurrency(price, safeCompany.currencySymbol || '$')}
        </span>
      </div>
    );
  };

  const pdfDocumentTree = (
    <div id="pdf-print-root" className="space-y-8 pdf-font-brand">
      {/* 1. PORTADA */}
      <div
        className="print-page bg-[#FAFCFF] mx-auto relative flex flex-col justify-between overflow-hidden box-border border border-slate-200"
        style={{ width: '215.9mm', height: '279.4mm', boxSizing: 'border-box' }}
      >
        <svg className="absolute top-0 left-0 w-[78mm] h-[78mm] pointer-events-none z-0" viewBox="0 0 300 300" fill="none">
          <path d="M 0,0 L 260,0 C 180,55 85,135 0,260 Z" fill="#0A2540" />
          <path d="M 0,260 C 85,135 180,55 260,0 L 278,0 C 192,62 92,145 0,278 Z" fill="#F05A24" />
        </svg>
        <svg className="absolute bottom-0 right-0 w-[55mm] h-[55mm] pointer-events-none z-0" viewBox="0 0 300 300" fill="none">
          <path d="M 300,300 L 300,90 C 230,160 160,230 90,300 Z" fill="#0A2540" />
          <path d="M 90,300 C 160,230 230,160 300,90 L 300,72 C 218,148 148,218 72,300 Z" fill="#F05A24" />
        </svg>

        <div className="relative z-10 flex-1 flex flex-col justify-between p-8 text-center">
          <div className="pt-4 flex flex-col items-center">
            {!whiteLabelMode && (
              <div className="relative w-28 h-28 mb-2 rounded-full p-1.5 bg-white shadow-xl border-2 border-slate-100 flex items-center justify-center overflow-hidden">
                <img src={logoImageSrc} alt={safeCompany.name} className="w-full h-full object-contain p-1" />
              </div>
            )}
            <h2 className="text-2xl font-black text-[#0A2540] tracking-widest uppercase mb-1">
              {brandCoverTitle}
            </h2>
            <h1 className="text-6xl font-black text-[#0A2540] tracking-tight uppercase leading-none">
              CATÁLOGO
            </h1>
            <h1 className="text-5xl font-black text-[#F05A24] tracking-tight uppercase mt-1 mb-3">
              DE PELUCHES
            </h1>
            <p className="text-xs font-black text-[#0A2540] tracking-[0.3em] uppercase mt-1">
              CALIDAD • VARIEDAD • DISEÑO
            </p>
          </div>

          <div className="my-auto py-2 relative w-full h-[280px] flex items-center justify-center overflow-hidden">
            <img src={heroImageSrc} alt="Colección" className="max-w-full max-h-[280px] object-contain mx-auto" />
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 px-6 mb-4 text-center border-t border-slate-200/80">
            <div className="flex flex-col items-center gap-1.5">
              <Award className="w-6 h-6 text-[#0A2540]" />
              <span className="text-[11px] font-black text-[#0A2540] uppercase">CALIDAD GARANTIZADA</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 border-x border-slate-300/60 px-2">
              <Package className="w-6 h-6 text-[#F05A24]" />
              <span className="text-[11px] font-black text-[#0A2540] uppercase">AMPLIO SURTIDO</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Truck className="w-6 h-6 text-[#0A2540]" />
              <span className="text-[11px] font-black text-[#0A2540] uppercase">ENVÍOS SEGUROS</span>
            </div>
          </div>
        </div>

        <div className="relative z-20 bg-[#0A2540] h-16 px-8 flex items-center justify-between">
          <span className="text-xs font-black text-slate-200 tracking-wider">
            {whiteLabelMode ? 'Catálogo de Referencias' : `${safeCompany.name} • Catálogo Oficial`}
          </span>
          {!whiteLabelMode && (
            <div className="bg-white text-[#0A2540] rounded-full px-6 py-2 flex items-center gap-2 font-black text-sm">
              <Phone className="w-4 h-4 text-[#F05A24]" />
              <span>{safeCompany.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. PÁGINAS DE PRODUCTOS */}
      {pages.map((pageItems, pageIdx) => (
        <div
          key={pageIdx}
          className="print-page bg-white mx-auto flex flex-col justify-between p-5 border border-slate-200 overflow-hidden box-border"
          style={{ width: '215.9mm', height: '279.4mm', boxSizing: 'border-box' }}
        >
          <div className="flex items-center justify-between border-b-2 border-[#3C5866] pb-2.5 mb-2 px-1">
            {whiteLabelMode ? (
              <span className="font-black text-sm text-[#3C5866] uppercase tracking-wide">
                {brandCoverTitle}
              </span>
            ) : (
              <>
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src={logoImageSrc} alt={safeCompany.name} className="w-10 h-10 object-contain" />
                  <div className="min-w-0">
                    <span className="font-black text-sm text-[#3C5866] uppercase block truncate">{safeCompany.name}</span>
                    {safeCompany.slogan && <p className="text-[9px] text-slate-500 font-bold truncate">{safeCompany.slogan}</p>}
                  </div>
                </div>
                <div className="text-right text-[8.5px] text-slate-700 font-medium shrink-0">
                  <p className="font-extrabold text-[#3C5866] flex items-center justify-end gap-1">
                    <Phone className="w-3 h-3 text-[#C37D41]" />
                    <span>{safeCompany.phone}</span>
                  </p>
                  {safeCompany.address && (
                    <p className="flex items-center justify-end gap-1">
                      <MapPin className="w-3 h-3 text-[#C37D41]" />
                      <span>{safeCompany.address}</span>
                    </p>
                  )}
                  {safeCompany.socialMedia && (
                    <p className="text-[#C37D41] font-bold flex items-center justify-end gap-1">
                      <Share2 className="w-3 h-3" />
                      <span>{safeCompany.socialMedia}</span>
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 grid-rows-3 gap-2.5 flex-1 overflow-hidden p-0.5">
            {pageItems.map((prod) => {
              const rawSrc = getProductImageUrl(prod);
              const displaySrc = rawSrc ? compressedImages[rawSrc] || rawSrc : '';
              return (
                <div key={prod.id} className="bg-white rounded-xl border border-slate-200 relative flex flex-col justify-between overflow-hidden">
                  <div className="relative w-full h-full min-h-[220px] flex-1 overflow-hidden flex items-center justify-center bg-white">
                    {displaySrc ? (
                      <img src={displaySrc} alt={prod.name} className="w-full h-full object-cover object-center" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-300" />
                    )}
                  </div>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 w-full flex flex-col items-center gap-1 px-2">
                    <div className="bg-white rounded-full px-3 py-0.5 shadow-md border border-slate-200 flex items-center gap-2 max-w-[95%] overflow-hidden">
                      <span className="bg-[#3C5866] text-white text-[8.5px] font-black px-2 py-0.5 rounded-full uppercase shrink-0">
                        {prod.sku}
                      </span>
                      <span className="text-[9.5px] font-black text-[#3C5866] uppercase truncate">
                        {prod.size ? `${prod.name} - ${formatSize(prod.size)}` : prod.name}
                      </span>
                    </div>
                    {renderProductPriceBadge(prod)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200 pt-1.5 mt-1 flex justify-between items-center text-[8.5px] text-slate-400 font-bold px-1">
            <span>{whiteLabelMode ? 'Catálogo Digital' : safeCompany.name}</span>
            <span>Página {pageIdx + 2} de {totalPdfPages}</span>
          </div>
        </div>
      ))}

      {/* 3. CONTRAPORTADA */}
      <div
        className="print-page last-page bg-[#FAFCFF] mx-auto relative flex flex-col justify-between overflow-hidden box-border border border-slate-200"
        style={{ width: '215.9mm', height: '279.4mm', boxSizing: 'border-box' }}
      >
        <div className="relative z-10 flex-1 flex flex-col justify-between p-8 text-center">
          <div className="pt-4 flex flex-col items-center">
            {!whiteLabelMode && (
              <div className="relative w-24 h-24 mb-2 rounded-full p-1.5 bg-white shadow-xl border-2 border-slate-100 flex items-center justify-center overflow-hidden">
                <img src={logoImageSrc} alt={safeCompany.name} className="w-full h-full object-contain p-1" />
              </div>
            )}
            <h1 className="text-5xl font-black text-[#0A2540] tracking-tight uppercase mt-4">¡GRACIAS!</h1>
            <p className="text-sm font-bold text-slate-700 mt-2 flex items-center gap-2">
              <span>Productos seleccionados con calidad y dedicación</span>
              <Heart className="w-4 h-4 text-[#F05A24] fill-[#F05A24]" />
            </p>
          </div>
          <div className="my-auto py-2 relative w-full h-[260px] flex items-center justify-center overflow-hidden">
            <img src={heroImageSrc} alt="Colección" className="max-w-full max-h-[260px] object-contain mx-auto" />
          </div>
        </div>
        <div className="relative z-20 bg-[#0A2540] py-4 px-8 flex flex-col items-center gap-1 text-center">
          {!whiteLabelMode && (
            <div className="bg-white text-[#0A2540] rounded-full px-6 py-1.5 flex items-center gap-2 font-black text-sm">
              <Phone className="w-4 h-4 text-[#F05A24]" />
              <span>{safeCompany.phone}</span>
            </div>
          )}
          <span className="text-[11px] font-black text-[#F05A24] tracking-widest uppercase">
            {whiteLabelMode ? brandCoverTitle : safeCompany.name}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div className="relative bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-auto">
          <div className="bg-[#3C5866] text-white p-4 sm:p-5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-[#FFF3CD]" />
              <h3 className="font-extrabold text-sm sm:text-base">
                {whiteLabelMode ? 'PDF Sin Marca' : 'Exportar PDF'}
              </h3>
            </div>
            <button type="button" onClick={onClose} className="text-slate-300 hover:text-white p-1.5 rounded-full cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            {/* Selector de Precios en PDF */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-[#C37D41]" />
                <span>Lista de Precios</span>
              </label>

              {whiteLabelMode ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedListId('reseller')}
                    className={`p-3 rounded-2xl border text-left cursor-pointer ${
                      selectedListId === 'reseller'
                        ? 'bg-[#3C5866] text-white border-[#3C5866]'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs">Mis Precios</span>
                      {selectedListId === 'reseller' && <CheckCircle2 className="w-3.5 h-3.5 text-[#FFF3CD]" />}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedListId('no_price')}
                    className={`p-3 rounded-2xl border text-left cursor-pointer ${
                      selectedListId === 'no_price'
                        ? 'bg-[#3C5866] text-white border-[#3C5866]'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-xs">Sin Precios</span>
                      {selectedListId === 'no_price' && <CheckCircle2 className="w-3.5 h-3.5 text-[#FFF3CD]" />}
                    </div>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {effectivePriceLists.map((list) => {
                    const isSelected = selectedListId === list.id;
                    return (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => setSelectedListId(list.id)}
                        className={`p-2.5 rounded-2xl border text-left cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-[#3C5866] text-white border-[#3C5866]'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        <span className="font-black text-xs">{list.name}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-[#FFF3CD]" />}
                      </button>
                    );
                  })}
                  {effectivePriceLists.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSelectedListId('all')}
                      className={`p-2.5 rounded-2xl border text-left cursor-pointer flex items-center justify-between ${
                        selectedListId === 'all'
                          ? 'bg-[#3C5866] text-white border-[#3C5866]'
                          : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span className="font-black text-xs">Todas</span>
                      {selectedListId === 'all' && <CheckCircle2 className="w-3.5 h-3.5 text-[#FFF3CD]" />}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Selector de Categorías */}
            <div className="space-y-2">
              <label className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-[#C37D41]" />
                <span>Categorías</span>
              </label>

              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => toggleCategory('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer ${
                    isAllCategories ? 'bg-[#3C5866] text-white' : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  {isAllCategories && <Check className="w-3 h-3 text-[#FFF3CD]" />}
                  <span>Todas ({effectiveProducts.filter((p) => p.status !== 'disabled').length})</span>
                </button>
                {availableCategories.map((cat) => {
                  const sel = selectedCats.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                        sel ? 'bg-[#3C5866] text-white' : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-amber-50/80 rounded-2xl p-3 border border-amber-200 flex items-center justify-between text-xs font-bold text-[#3C5866]">
              <span>{filteredProducts.length} referencias</span>
              <span>{totalPdfPages} páginas</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 px-4 rounded-2xl text-xs font-bold text-slate-600 bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDownloadPDF}
                disabled={isGenerating || filteredProducts.length === 0}
                className="flex-2 py-3 px-4 bg-[#3C5866] hover:bg-[#263842] text-white font-black text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{downloadProgress}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 text-[#FFF3CD]" />
                    <span>Descargar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {mounted &&
        createPortal(
          <div
            id="pdf-print-root"
            className="fixed -left-[9999px] top-0 z-[-100] w-[215.9mm] pointer-events-none"
            style={{ width: '215.9mm' }}
          >
            {pdfDocumentTree}
          </div>,
          document.body
        )}
    </>
  );
};
