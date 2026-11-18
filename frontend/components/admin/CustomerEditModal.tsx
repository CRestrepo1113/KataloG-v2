'use client';

import React, { useState, useEffect } from 'react';
import { AccessStatus, Customer, Branch, UserRole } from '@/lib/types';
import { mapLegacyTierToListId } from '@/lib/pricing';
import { resolveAccessStatus } from '@/lib/auth';
import { useModalHistory } from '@/lib/useModalHistory';
import { User, Building, Phone, Mail, MapPin, Tag, X, Save, AlertCircle, CheckCircle } from 'lucide-react';

interface CustomerEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onSaveCustomer: (customerData: Partial<Customer>) => Promise<void>;
  branches?: Branch[];
}

export const CustomerEditModal: React.FC<CustomerEditModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSaveCustomer,
  branches = [],
}) => {
  const isEditing = !!customer;

  const [nombre, setNombre] = useState('');
  const [negocio, setNegocio] = useState('');
  const [telefonos, setTelefonos] = useState('');
  const [email, setEmail] = useState('');
  const [cedula, setCedula] = useState('');
  const [direccion, setDireccion] = useState('');
  const [pais, setPais] = useState('Costa Rica');
  const [sucursal, setSucursal] = useState('costarica');
  const [listaPrecio, setListaPrecio] = useState<'unidad' | 'docena' | 'mayoreo'>('mayoreo');
  const [rol, setRol] = useState<UserRole>('cliente');
  const [estadoAcceso, setEstadoAcceso] = useState<AccessStatus>('aprobado');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useModalHistory(isOpen, onClose, 'adminCustomerEditModal');

  useEffect(() => {
    if (customer) {
      setNombre(customer.nombre || '');
      setNegocio(customer.negocio || '');
      setTelefonos(customer.telefonos || '');
      setEmail(customer.email || '');
      setCedula(customer.cedula || '');
      setDireccion(customer.direccion || '');
      setPais(customer.pais || 'Costa Rica');
      setSucursal(customer.sucursal || 'costarica');
      setListaPrecio(customer.lista_precio || 'mayoreo');
      setRol(customer.rol || 'cliente');
      const resolvedAccess = resolveAccessStatus(customer);
      setEstadoAcceso(resolvedAccess === 'visitante' ? 'pendiente' : resolvedAccess);
    } else {
      setNombre('');
      setNegocio('');
      setTelefonos('');
      setEmail('');
      setCedula('');
      setDireccion('');
      setPais('Costa Rica');
      setSucursal('costarica');
      setListaPrecio('mayoreo');
      setRol('cliente');
      setEstadoAcceso('aprobado');
    }
    setErrorMessage('');
    setSuccessMessage('');
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorMessage('El nombre del cliente es obligatorio.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const mappedDefault = mapLegacyTierToListId(listaPrecio);
      const existingAllowed = customer?.allowedPriceLists || [];
      const syncedAllowed = existingAllowed.includes(mappedDefault)
        ? existingAllowed
        : [mappedDefault, ...existingAllowed];

      await onSaveCustomer({
        id: customer?.id || `CL-${Date.now().toString().slice(-6)}`,
        uid: customer?.uid,
        nombre: nombre.trim(),
        negocio: negocio.trim() || undefined,
        telefonos: telefonos.trim() || undefined,
        email: email.trim() || undefined,
        cedula: cedula.trim() || undefined,
        direccion: direccion.trim() || undefined,
        pais: pais.trim(),
        sucursal: sucursal.trim(),
        lista_precio: listaPrecio,
        defaultPriceList: mappedDefault,
        allowedPriceLists: syncedAllowed,
        rol,
        estado_acceso: estadoAcceso,
      });

      setSuccessMessage('¡Cliente guardado correctamente!');
      setTimeout(() => {
        setLoading(false);
        onClose();
      }, 500);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error al guardar los datos del cliente.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-[#3C5866] text-white p-4.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
              <User className="w-4 h-4 text-[#FFF3CD]" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">
                {isEditing ? `Editar Cliente: ${customer.nombre}` : 'Registrar Nuevo Cliente'}
              </h3>
              <p className="text-[11px] text-slate-200">
                {isEditing ? `ID: ${customer.id}` : 'Agrega un cliente al CRM de KataloG & KYG'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-3 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Nombre Completo *
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej. María Elena Rodríguez"
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Nombre Negocio / Tienda
              </label>
              <div className="relative">
                <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={negocio}
                  onChange={(e) => setNegocio(e.target.value)}
                  placeholder="Ej. Novedades Mary"
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Cédula / Identificación / RTN
              </label>
              <input
                type="text"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="Ej. 1-1234-0567"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                WhatsApp / Teléfono
              </label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="tel"
                  value={telefonos}
                  onChange={(e) => setTelefonos(e.target.value)}
                  placeholder="Ej. +506 8888-8888"
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cliente@ejemplo.com"
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Sucursal / País
              </label>
              <select
                value={sucursal}
                onChange={(e) => {
                  setSucursal(e.target.value);
                  const b = branches.find((item) => item.slug === e.target.value);
                  if (b && b.country) setPais(b.country);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              >
                {branches.length > 0 ? (
                  branches.map((b) => (
                    <option key={b.slug} value={b.slug}>
                      {b.name} ({b.country || 'Internacional'})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="costarica">Costa Rica</option>
                    <option value="honduras">Honduras</option>
                    <option value="mexico">México</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Tarifa de Precios
              </label>
              <div className="relative">
                <Tag className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={listaPrecio}
                  onChange={(e) => setListaPrecio(e.target.value as any)}
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                >
                  <option value="mayoreo">Tarifa Mayorista</option>
                  <option value="docena">Tarifa Docena</option>
                  <option value="unidad">Tarifa Unidad (Detalle)</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                Dirección de Entrega / Despacho
              </label>
              <div className="relative">
                <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                <textarea
                  rows={2}
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Ej. San José, Barrio La Castellana, frente al parque..."
                  className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                />
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-extrabold text-white bg-[#3C5866] hover:bg-[#2c424e] rounded-xl flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4 text-[#FFF3CD]" />
              <span>{loading ? 'Guardando...' : 'Guardar Cliente'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
