'use client';

import React from 'react';
import { CompanyInfo, SocialLinks } from '@/lib/types';
import {
  X,
  Globe,
  ExternalLink,
  MapPin,
  Sparkles,
} from 'lucide-react';

interface SocialMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyInfo;
}

export const SocialMediaModal: React.FC<SocialMediaModalProps> = ({
  isOpen,
  onClose,
  company,
}) => {
  if (!isOpen) return null;

  const links: SocialLinks = company.socialLinks || {};

  // Formatear enlace de WhatsApp
  const cleanPhone = (company.phone || links.whatsapp || '').replace(/[^0-9]/g, '');
  const whatsappUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(
        `¡Hola! Estoy visitando el catálogo digital de ${company.name} y me gustaría recibir más información.`
      )}`
    : '';

  // Formatear Instagram
  let instagramUrl = links.instagram || '';
  if (instagramUrl && !instagramUrl.startsWith('http')) {
    const handle = instagramUrl.replace(/^@/, '');
    instagramUrl = `https://instagram.com/${handle}`;
  }

  // Formatear Facebook
  let facebookUrl = links.facebook || '';
  if (facebookUrl && !facebookUrl.startsWith('http')) {
    facebookUrl = `https://facebook.com/${facebookUrl.replace(/^@/, '')}`;
  }

  // Formatear TikTok
  let tiktokUrl = links.tiktok || '';
  if (tiktokUrl && !tiktokUrl.startsWith('http')) {
    const handle = tiktokUrl.startsWith('@') ? tiktokUrl : `@${tiktokUrl}`;
    tiktokUrl = `https://tiktok.com/${handle}`;
  }

  // Formatear Web
  let websiteUrl = links.website || '';
  if (websiteUrl && !websiteUrl.startsWith('http')) {
    websiteUrl = `https://${websiteUrl}`;
  }

  // Fallback si venía en socialMedia antiguo
  if (!instagramUrl && !facebookUrl && !tiktokUrl && !websiteUrl && company.socialMedia) {
    if (company.socialMedia.startsWith('http')) {
      websiteUrl = company.socialMedia;
    } else {
      const h = company.socialMedia.replace(/^@/, '');
      instagramUrl = `https://instagram.com/${h}`;
    }
  }

  // Enlace a Google Maps para la dirección física
  const mapsQuery = [company.address, company.country].filter(Boolean).join(', ');
  const googleMapsUrl = company.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[28px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#3C5866] text-white p-5 relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/15 shadow-inner shrink-0">
              <Sparkles className="w-5 h-5 text-[#FFF3CD]" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                Conéctate con Nosotros
              </h3>
              <p className="text-xs text-slate-200">
                {company.name} ({company.country || 'Oficial'})
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: Buttons List */}
        <div className="p-5 space-y-2.5 bg-slate-50/50">
          {/* WhatsApp Directo con Icono Auténtico */}
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 bg-white hover:bg-emerald-50/80 border border-emerald-200/80 hover:border-emerald-300 rounded-2xl transition-all shadow-2xs group cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#25D366] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                  </svg>
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 group-hover:text-emerald-700">
                    WhatsApp de Atención
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">{company.phone}</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
            </a>
          )}

          {/* Instagram */}
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 bg-white hover:bg-rose-50/80 border border-rose-200/80 hover:border-rose-300 rounded-2xl transition-all shadow-2xs group cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 group-hover:text-rose-700">
                    Instagram Oficial
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">Síguenos para novedades</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-rose-600" />
            </a>
          )}

          {/* Facebook */}
          {facebookUrl && (
            <a
              href={facebookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 bg-white hover:bg-blue-50/80 border border-blue-200/80 hover:border-blue-300 rounded-2xl transition-all shadow-2xs group cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1877F2] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 group-hover:text-[#1877F2]">
                    Facebook
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">Página Oficial</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#1877F2]" />
            </a>
          )}

          {/* TikTok */}
          {tiktokUrl && (
            <a
              href={tiktokUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-2xl transition-all shadow-2xs group cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-950 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.86 4.43 5.92 5.92 0 0 0 1.54-4.09V8.65a8.28 8.28 0 0 0 4.19 1.5z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 group-hover:text-slate-950">
                    TikTok
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">Videos y Catálogo en Vivo</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-slate-800" />
            </a>
          )}

          {/* Página Web */}
          {websiteUrl && (
            <a
              href={websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 bg-white hover:bg-amber-50/80 border border-amber-200/80 hover:border-amber-300 rounded-2xl transition-all shadow-2xs group cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#C37D41] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-xs text-slate-800 group-hover:text-[#C37D41]">
                    Sitio Web Oficial
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium">Visita nuestra web</p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#C37D41]" />
            </a>
          )}

          {/* Botón interactivo de Dirección en Google Maps */}
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 bg-white hover:bg-amber-50/70 border border-slate-200/90 hover:border-amber-300/80 rounded-2xl transition-all shadow-2xs group cursor-pointer active:scale-[0.98]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#C37D41]/10 text-[#C37D41] flex items-center justify-center shrink-0 border border-[#C37D41]/20 shadow-2xs">
                  <MapPin className="w-5 h-5 text-[#C37D41]" />
                </div>
                <div className="min-w-0">
                  <h4 className="font-extrabold text-xs text-slate-800 group-hover:text-[#C37D41]">
                    Ubicación en Google Maps
                  </h4>
                  <p className="text-[11px] text-slate-500 font-medium truncate">
                    {company.address}
                  </p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-[#C37D41] shrink-0 ml-2" />
            </a>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-white border-t border-slate-100 text-center">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
