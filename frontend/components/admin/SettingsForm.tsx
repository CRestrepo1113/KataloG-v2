'use client';

import React, { useState } from 'react';
import { CompanyInfo } from '@/lib/types';
import { Settings, Save, Phone, MapPin, Share2, Building, CheckCircle2, Coins } from 'lucide-react';

interface SettingsFormProps {
  company: CompanyInfo;
  onSave: (updated: Partial<CompanyInfo>) => void;
}

export const SettingsForm: React.FC<SettingsFormProps> = ({ company, onSave }) => {
  const [name, setName] = useState(company.name || 'KYG DISTRIBUCIONES');
  const [slogan, setSlogan] = useState(company.slogan || '');
  const [phone, setPhone] = useState(company.phone || '');
  const [address, setAddress] = useState(company.address || '');
  const [socialMedia, setSocialMedia] = useState(company.socialMedia || '');
  const [currencySymbol, setCurrencySymbol] = useState(company.currencySymbol || '$');
  const [currencyCode, setCurrencyCode] = useState(company.currencyCode || 'COP');
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      slogan,
      phone,
      address,
      socialMedia,
      currencySymbol,
      currencyCode: currencyCode.toUpperCase(),
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 md:p-8 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <div className="p-3 bg-[#ECE4F0] text-[#3C5866] rounded-2xl">
          <Settings className="w-6 h-6 text-[#C37D41]" />
        </div>
        <div>
          <h2 className="text-lg font-black text-[#3C5866]">
            Configuración de Empresa & WhatsApp
          </h2>
          <p className="text-xs text-slate-500">
            Define el número oficial de pedidos y datos de contacto para el catálogo web y PDF.
          </p>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl text-xs font-bold text-emerald-700 flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>¡Configuración guardada exitosamente! Los cambios se aplicaron al catálogo.</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
            <Building className="w-3.5 h-3.5 text-[#C37D41]" />
            Nombre Comercial de la Empresa
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-[#3C5866]"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-emerald-600" />
            Número de WhatsApp Receptor de Pedidos *
          </label>
          <input
            type="text"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+573001234567"
            className="w-full px-4 py-2.5 bg-emerald-50/50 border border-emerald-200 rounded-2xl text-xs font-extrabold text-emerald-800"
          />
          <p className="text-[11px] text-slate-400 mt-1">
            Formato recomendado con código de país, ejemplo: +573001234567. Aquí llegarán los pedidos formateados.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
            Slogan Comercial
          </label>
          <input
            type="text"
            value={slogan}
            onChange={(e) => setSlogan(e.target.value)}
            placeholder="Distribución y Venta Mayorista"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
          />
        </div>

        {/* Currency & Symbol Settings Section */}
        <div className="p-4 bg-amber-50/60 border border-amber-100 rounded-2xl space-y-3">
          <label className="block text-xs font-black text-amber-900 uppercase flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-[#C37D41]" />
            Moneda Oficial de la Empresa
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Símbolo de la Moneda *
              </label>
              <input
                type="text"
                required
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                placeholder="$, ₡, €, US$, S/, Q."
                className="w-full px-4 py-2 bg-white border border-amber-200 rounded-xl text-xs font-black text-[#3C5866]"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Ejemplos: $ (Pesos/Dólares), ₡ (Colones), € (Euros), S/ (Soles), Q. (Quetzales)
              </p>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Código ISO de Moneda *
              </label>
              <input
                type="text"
                required
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                placeholder="CRC, COP, USD, EUR, MXN"
                className="w-full px-4 py-2 bg-white border border-amber-200 rounded-xl text-xs font-black text-[#3C5866] uppercase"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Aparecerá en el pie del catálogo PDF (ejemplo: CRC, COP, USD).
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#C37D41]" />
              Dirección Física
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5 text-[#C37D41]" />
              Redes Sociales
            </label>
            <input
              type="text"
              value={socialMedia}
              onChange={(e) => setSocialMedia(e.target.value)}
              placeholder="@kygdistribuciones"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium"
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            className="px-6 py-3 bg-[#3C5866] hover:bg-[#2c424e] text-white text-xs font-extrabold rounded-2xl flex items-center gap-2 shadow-md active:scale-95 transition-all"
          >
            <Save className="w-4 h-4 text-[#C37D41]" />
            <span>Guardar Configuración</span>
          </button>
        </div>
      </form>
    </div>
  );
};
