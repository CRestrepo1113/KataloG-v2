import React, { useState } from 'react';
import { Branch } from '@/lib/types';
import { Building2, X, Plus, Edit2, Trash2, Globe, Check, Save, Copy, Package, Eye, EyeOff } from 'lucide-react';

interface BranchManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: Branch[];
  currentBranchSlug: string;
  onSelectBranch: (slug: string) => void;
  onSaveBranch: (branch: Partial<Branch> & { slug: string }) => void;
  onDeleteBranch: (slug: string) => void;
}

export const BranchManagerModal: React.FC<BranchManagerModalProps> = ({
  isOpen,
  onClose,
  branches,
  currentBranchSlug,
  onSelectBranch,
  onSaveBranch,
  onDeleteBranch,
}) => {
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Form fields for create/edit
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [country, setCountry] = useState('');
  const [orderPrefix, setOrderPrefix] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [slogan, setSlogan] = useState('');
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [website, setWebsite] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [showStock, setShowStock] = useState(true);

  if (!isOpen) return null;

  const handleStartEdit = (b: Branch) => {
    setEditingBranch(b);
    setIsCreatingNew(false);
    setName(b.name || '');
    setSlug(b.slug || '');
    setCountry(b.country || '');
    setOrderPrefix(b.orderPrefix || (b.slug === 'costarica' ? 'CR' : b.slug === 'mexico' ? 'MX' : b.slug === 'default' ? 'CO' : (b.country ? b.country.substring(0, 2).toUpperCase() : 'HN')));
    setCurrencySymbol(b.currencySymbol || '$');
    setCurrencyCode(b.currencyCode || 'USD');
    setPhone(b.phone || '');
    setAddress(b.address || '');
    setSlogan(b.slogan || '');
    setInstagram(b.socialLinks?.instagram || (b.socialMedia?.includes('instagram') ? b.socialMedia : '') || '');
    setFacebook(b.socialLinks?.facebook || (b.socialMedia?.includes('facebook') ? b.socialMedia : '') || '');
    setTiktok(b.socialLinks?.tiktok || (b.socialMedia?.includes('tiktok') ? b.socialMedia : '') || '');
    setWebsite(b.socialLinks?.website || (b.socialMedia?.startsWith('http') ? b.socialMedia : '') || '');
    setLogoUrl(b.logoUrl || '');
    setShowStock(b.showStock !== undefined ? b.showStock : true);
  };

  const handleStartCreate = () => {
    setEditingBranch(null);
    setIsCreatingNew(true);
    setName('');
    setSlug('');
    setCountry('');
    setOrderPrefix('');
    setCurrencySymbol('$');
    setCurrencyCode('USD');
    setPhone('');
    setAddress('');
    setSlogan('');
    setInstagram('');
    setFacebook('');
    setTiktok('');
    setWebsite('');
    setLogoUrl('');
    setShowStock(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (isCreatingNew) {
      const generated = val
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
      setSlug(generated);
    }
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !slug) return;

    const socialLinks = {
      whatsapp: phone,
      instagram: instagram.trim(),
      facebook: facebook.trim(),
      tiktok: tiktok.trim(),
      website: website.trim(),
    };

    const primarySocial = instagram || facebook || tiktok || website || '@kygdistribuciones';
    const cleanPrefix = (orderPrefix || country.substring(0, 2) || 'CR').toUpperCase().trim();

    onSaveBranch({
      id: editingBranch ? editingBranch.id : slug.toLowerCase(),
      slug: slug.toLowerCase(),
      name,
      country: country || 'Internacional',
      orderPrefix: cleanPrefix,
      currencySymbol: currencySymbol || '$',
      currencyCode: currencyCode.toUpperCase() || 'USD',
      phone: phone || '+100000000',
      address,
      slogan,
      socialMedia: primarySocial,
      socialLinks,
      logoUrl,
      isActive: true,
      showStock,
    });

    setEditingBranch(null);
    setIsCreatingNew(false);
  };


  const handleCopyUrl = (slug: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://katalog-lime.vercel.app';
    const url = `${origin}/v/${slug}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedSlug(slug);
      setTimeout(() => setCopiedSlug(null), 2500);
    }
  };

  const handleDelete = (b: Branch) => {
    if (branches.length <= 1) {
      alert('Debe existir al menos una sucursal registrada en la aplicación.');
      return;
    }
    if (confirm(`¿Estás seguro de eliminar la sucursal "${b.name}"?`)) {
      onDeleteBranch(b.slug);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-100 my-6 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-[#3C5866] text-white p-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-[#C37D41]" />
            <div>
              <h3 className="font-extrabold text-sm sm:text-base">
                Gestión de Sucursales y Países
              </h3>
              <p className="text-[11px] text-slate-200">
                Crea, edita o elimina cualquier sede registrada en la plataforma.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCreatingNew && !editingBranch && (
              <button
                onClick={handleStartCreate}
                className="bg-[#C37D41] hover:bg-[#a86832] text-white px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 shadow-sm active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Sucursal</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="text-slate-300 hover:text-white p-1 rounded-full hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Create or Edit Form */}
          {(isCreatingNew || editingBranch) ? (
            <form onSubmit={handleSubmitForm} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4 text-xs animate-in fade-in">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <h4 className="font-extrabold text-[#3C5866] text-sm flex items-center gap-1.5">
                  <Edit2 className="w-4 h-4 text-[#C37D41]" />
                  <span>{editingBranch ? `Editar Sucursal: ${editingBranch.name}` : 'Registrar Nueva Sucursal'}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => { setEditingBranch(null); setIsCreatingNew(false); }}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  Cancelar Edición
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Nombre de Sucursal *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="KYG Distribuciones Costa Rica"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-[#3C5866]"
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
                    placeholder="costarica"
                    className="w-full px-3 py-2 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl font-extrabold"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    URL pública: /v/{slug || 'costarica'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      if (isCreatingNew && !orderPrefix && e.target.value) {
                        setOrderPrefix(e.target.value.substring(0, 2).toUpperCase());
                      }
                    }}
                    placeholder="Costa Rica"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Indicativo / Prefijo de Pedidos *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    value={orderPrefix}
                    onChange={(e) => setOrderPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="Ej: CR, HN, CO, MX"
                    className="w-full px-3 py-2 bg-amber-50 text-amber-900 border border-amber-300 rounded-xl font-black text-xs uppercase"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Código de pedido: <strong className="text-[#3C5866]">#{orderPrefix || 'CR'}-0001</strong>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    Código ISO Moneda *
                  </label>
                  <input
                    type="text"
                    required
                    value={currencyCode}
                    onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                    placeholder="CRC, COP, USD"
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
                  placeholder="+50671338445"
                  className="w-full px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl font-extrabold text-emerald-800"
                />
              </div>

              {/* Redes Sociales y Canales Digitales */}
              <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-[#C37D41]" />
                    <span>Redes Sociales y Enlaces Oficiales</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Se sincronizan en el Catálogo y PDF</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Instagram
                    </label>
                    <input
                      type="text"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="@kygdistribuciones o URL"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-[#3C5866]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Facebook
                    </label>
                    <input
                      type="text"
                      value={facebook}
                      onChange={(e) => setFacebook(e.target.value)}
                      placeholder="facebook.com/kyg... o nombre"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-[#3C5866]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      TikTok
                    </label>
                    <input
                      type="text"
                      value={tiktok}
                      onChange={(e) => setTiktok(e.target.value)}
                      placeholder="@kygdistribuciones o URL"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-[#3C5866]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">
                      Página Web Oficial
                    </label>
                    <input
                      type="text"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://kygdistribuciones.com"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-[#3C5866]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Lema o Slogan
                  </label>
                  <input
                    type="text"
                    value={slogan}
                    onChange={(e) => setSlogan(e.target.value)}
                    placeholder="Distribución y Venta Mayorista"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 uppercase mb-1">
                    Dirección Física
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Avenida 10, San José"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                  />
                </div>
              </div>

              {/* Visibilidad de Stock en Catálogo */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    showStock ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {showStock ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-slate-800 text-xs">
                        Mostrar Stock en Catálogo Digital
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                        showStock
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {showStock ? 'Visible' : 'Oculto'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {showStock
                        ? 'Los clientes podrán ver la cantidad de stock disponible en cada tarjeta de producto.'
                        : 'El stock estará oculto para clientes y el código de producto se mostrará centrado arriba.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowStock(!showStock)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    showStock ? 'bg-[#3C5866]' : 'bg-slate-300'
                  }`}
                  role="switch"
                  aria-checked={showStock}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      showStock ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => { setEditingBranch(null); setIsCreatingNew(false); }}
                  className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-200"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#3C5866] hover:bg-[#263842] text-white font-extrabold rounded-xl flex items-center gap-1.5 shadow-md active:scale-95"
                >
                  <Save className="w-4 h-4 text-[#C37D41]" />
                  <span>{editingBranch ? 'Guardar Cambios' : 'Crear Sucursal'}</span>
                </button>
              </div>
            </form>
          ) : null}

          {/* Branches List Table */}
          <div className="space-y-3">
            <h4 className="font-extrabold text-[#3C5866] text-xs uppercase tracking-wider flex items-center justify-between">
              <span>Sucursales Registradas ({branches.length})</span>
              <span className="text-[11px] text-slate-400 font-normal">
                Catálogo Maestro Compartido
              </span>
            </h4>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {branches.map((b) => {
                const isCurrent = b.slug === currentBranchSlug || b.id === currentBranchSlug;
                const publicUrl = `/v/${b.slug}`;
                const isStockVisible = b.showStock !== false;

                return (
                  <div
                    key={b.id}
                    className={`p-3.5 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                      isCurrent ? 'bg-amber-50/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[#3C5866] text-[#FFF3CD] flex items-center justify-center font-black text-sm border border-white/10 shrink-0">
                        {b.orderPrefix || b.country.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h5 className="font-extrabold text-xs text-[#3C5866] truncate">
                            {b.name}
                          </h5>
                          {b.orderPrefix && (
                            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black px-1.5 py-0.2 rounded-full uppercase">
                              Prefijo: #{b.orderPrefix}
                            </span>
                          )}
                          {isCurrent && (
                            <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> En Edición
                            </span>
                          )}
                          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase flex items-center gap-1 ${
                            isStockVisible
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {isStockVisible ? <Eye className="w-2.5 h-2.5" /> : <EyeOff className="w-2.5 h-2.5" />}
                            {isStockVisible ? 'Stock Visible' : 'Stock Oculto'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                          {b.country} • Folios: <strong className="text-[#3C5866]">#{b.orderPrefix || 'CR'}-XXXX</strong> • Moneda: <span className="font-bold text-[#3C5866]">{b.currencySymbol} ({b.currencyCode})</span> • Tel: {b.phone}
                        </p>
                      </div>
                    </div>


                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Select active branch for editing */}
                      {!isCurrent && (
                        <button
                          onClick={() => { onSelectBranch(b.slug); onClose(); }}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-[#3C5866] font-bold text-[11px] rounded-xl transition-all"
                        >
                          Seleccionar
                        </button>
                      )}

                      {/* Copy Public Link Button */}
                      <button
                        onClick={() => handleCopyUrl(b.slug)}
                        className={`p-2 rounded-xl transition-all ${
                          copiedSlug === b.slug
                            ? 'bg-emerald-50 text-emerald-600 font-bold'
                            : 'text-slate-400 hover:text-[#C37D41] hover:bg-amber-50'
                        }`}
                        title="Copiar enlace público de esta sucursal para compartir con clientes"
                      >
                        {copiedSlug === b.slug ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>

                      {/* View Public Catalog URL */}
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                        title="Ver Catálogo Público de esta sucursal"
                      >
                        <Globe className="w-4 h-4" />
                      </a>

                      {/* Edit Button */}
                      <button
                        onClick={() => handleStartEdit(b)}
                        className="p-2 text-slate-400 hover:text-[#3C5866] hover:bg-slate-100 rounded-xl transition-colors"
                        title="Editar Sucursal"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>

                      {/* Delete Button */}
                      {branches.length > 1 && (
                        <button
                          onClick={() => handleDelete(b)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                          title="Eliminar Sucursal"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
