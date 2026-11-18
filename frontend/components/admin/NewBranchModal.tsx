'use client';

import React, { useState } from 'react';
import { Branch } from '@/lib/types';
import { Building2, X, Plus, Save, Globe, Eye, EyeOff, Package } from 'lucide-react';

interface NewBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (branch: Partial<Branch> & { slug: string }) => void;
}

export const NewBranchModal: React.FC<NewBranchModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [country, setCountry] = useState('');
  const [orderPrefix, setOrderPrefix] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [phone, setPhone] = useState('');
  const [showStock, setShowStock] = useState(true);

  if (!isOpen) return null;

  const handleNameChange = (val: string) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]/g, '')) {
      const generated = val
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
      setSlug(generated);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;

    const cleanPrefix = (orderPrefix || country.substring(0, 2) || 'CR').toUpperCase().trim();

    onSave({
      id: slug,
      slug: slug.toLowerCase(),
      name,
      country: country || 'Internacional',
      orderPrefix: cleanPrefix,
      currencySymbol: currencySymbol || '$',
      currencyCode: currencyCode.toUpperCase() || 'USD',
      phone: phone || '+1000000000',
      isActive: true,
      showStock,
    });

    onClose();
  };


  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 my-6 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#3C5866] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#C37D41]" />
            <h3 className="font-bold text-sm">Registrar Nueva Sucursal / País</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-full hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Nombre de la Sucursal *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ej: KYG Distribuciones Guatemala"
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-[#3C5866]"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Identificador URL (Slug) *
            </label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
              placeholder="guatemala"
              className="w-full px-3 py-2 bg-amber-50/70 border border-amber-200 rounded-xl font-extrabold text-amber-900"
            />
            <p className="text-[10px] text-slate-400 mt-1">
              Link: /v/{slug || 'guatemala'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                País *
              </label>
              <input
                type="text"
                required
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value);
                  if (!orderPrefix && e.target.value) {
                    setOrderPrefix(e.target.value.substring(0, 2).toUpperCase());
                  }
                }}
                placeholder="Guatemala"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Indicativo / Prefijo Pedidos *
              </label>
              <input
                type="text"
                required
                maxLength={5}
                value={orderPrefix}
                onChange={(e) => setOrderPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                placeholder="Ej: GT, CR, HN, MX"
                className="w-full px-3 py-2 bg-amber-50 text-amber-900 border border-amber-300 rounded-xl font-black text-xs uppercase"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Folio: <strong className="text-[#3C5866]">#{orderPrefix || 'GT'}-0001</strong>
              </p>
            </div>
          </div>



          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Símbolo Moneda *
              </label>
              <input
                type="text"
                required
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                placeholder="$, ₡, Q., €, S/"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-[#3C5866]"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 uppercase mb-1">
                Código Moneda *
              </label>
              <input
                type="text"
                required
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                placeholder="GTQ, COP, CRC"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-[#3C5866] uppercase"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              WhatsApp de Pedidos *
            </label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+50212345678"
              className="w-full px-3.5 py-2 bg-emerald-50/50 border border-emerald-200 rounded-xl font-extrabold text-emerald-800"
            />
          </div>

          {/* Visibilidad de Stock en Catálogo */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                showStock ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
              }`}>
                {showStock ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-slate-800 text-xs">
                    Mostrar Stock en Catálogo
                  </span>
                  <span className={`text-[9.5px] font-black px-1.5 py-0.2 rounded-full uppercase ${
                    showStock
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-200 text-slate-700'
                  }`}>
                    {showStock ? 'Visible' : 'Oculto'}
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-500 mt-0.5 leading-snug">
                  {showStock
                    ? 'Los clientes podrán ver la cantidad de stock disponible.'
                    : 'El stock estará oculto y el código se mostrará centrado.'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowStock(!showStock)}
              className={`relative inline-flex h-5.5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                showStock ? 'bg-[#3C5866]' : 'bg-slate-300'
              }`}
              role="switch"
              aria-checked={showStock}
            >
              <span
                className={`pointer-events-none inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  showStock ? 'translate-x-4.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#3C5866] hover:bg-[#263842] text-white font-extrabold rounded-xl flex items-center gap-1.5 shadow-md active:scale-95"
            >
              <Save className="w-4 h-4 text-[#C37D41]" />
              <span>Crear Sucursal</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
