'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Customer,
  CustomerOrder,
  Branch,
  CompanyInfo,
  Product,
  PriceList,
  AccessStatus,
  UserRole,
} from '@/lib/types';
import { useModalHistory } from '@/lib/useModalHistory';
import { downloadOrderExcel } from '@/lib/excelExport';
import { OrderPaymentModal } from './OrderPaymentModal';
import {
  User,
  Building,
  Phone,
  Mail,
  MapPin,
  Tag,
  Package,
  Calendar,
  DollarSign,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Clock,
  Layers,
  Truck,
  X,
  Save,
  Trash2,
  ChevronRight,
  FileSpreadsheet,
  LayoutGrid,
  List,
  MessageCircle,
  Shield,
  ShieldCheck,
  Crown,
  Briefcase,
  Lock,
  Store,
  Sparkles,
  Ban,
} from 'lucide-react';
import {
  isAuthorizedAdminEmail,
  isAuthorizedSuperAdminEmail,
  resolveAccessStatus,
} from '@/lib/auth';
import {
  getDefaultPriceListsForBranch,
  mapLegacyTierToListId,
  mapListIdToLegacyTier,
} from '@/lib/pricing';
import { useAdminAuth } from '@/lib/AdminAuthContext';

interface CustomerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  orders: CustomerOrder[];
  products: Product[];
  branches: Branch[];
  priceLists?: PriceList[];
  company: CompanyInfo;
  onSaveCustomer: (customerData: Partial<Customer>) => Promise<void>;
  onDeleteCustomer?: (customerId: string, uid?: string) => Promise<void>;
  onOpenOrderEditor: (order: CustomerOrder) => void;
  onUpdateOrder: (orderId: string, updatedOrder: Partial<CustomerOrder>) => Promise<void>;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  isOpen,
  onClose,
  customer,
  orders,
  products,
  branches = [],
  priceLists = [],
  company,
  onSaveCustomer,
  onDeleteCustomer,
  onOpenOrderEditor,
  onUpdateOrder,
}) => {
  const isEditing = !!customer;
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'payments'>('profile');
  const [ordersViewMode, setOrdersViewMode] = useState<'cards' | 'table'>('cards');

  // Customer Form State
  const { isSuperAdmin: currentAdminIsSuper } = useAdminAuth();

  // Verificación de nivel de acceso del usuario objetivo
  const isTargetSuperAdmin = useMemo(() => {
    if (!customer) return false;
    return customer.rol === 'superadmin' || isAuthorizedSuperAdminEmail(customer.email);
  }, [customer]);

  const isTargetAdmin = useMemo(() => {
    if (!customer) return false;
    return (customer.rol === 'admin' || isAuthorizedAdminEmail(customer.email)) && !isTargetSuperAdmin;
  }, [customer, isTargetSuperAdmin]);

  // Permiso para modificar datos del perfil
  const canEditProfile = useMemo(() => {
    if (!isEditing) return true; // Creando un nuevo usuario
    if (currentAdminIsSuper) return true; // SuperAdmin tiene control total
    if (isTargetSuperAdmin || isTargetAdmin) return false; // Admin de sede NO puede editar SuperAdmin ni Admin
    return true; // Admin de sede puede editar clientes y vendedores
  }, [isEditing, currentAdminIsSuper, isTargetSuperAdmin, isTargetAdmin]);

  // Permiso para cambiar roles
  const canEditRole = useMemo(() => {
    if (currentAdminIsSuper) return true; // SuperAdmin puede asignar cualquier rol
    if (isTargetSuperAdmin || isTargetAdmin) return false; // Admin de sede NUNCA puede tocar roles de SuperAdmin ni Admin
    return true; // Para usuarios normales, Admin de sede solo puede alternar entre vendedor y cliente
  }, [currentAdminIsSuper, isTargetSuperAdmin, isTargetAdmin]);

  // Permiso para eliminar usuario
  const canDelete = useMemo(() => {
    if (!isEditing || !onDeleteCustomer) return false;
    if (currentAdminIsSuper) return true; // SuperAdmin puede eliminar cualquier registro
    if (isTargetSuperAdmin || isTargetAdmin) return false; // Admin de sede NO puede eliminar usuarios administrativos
    return true; // Admin de sede puede eliminar clientes y vendedores locales
  }, [isEditing, onDeleteCustomer, currentAdminIsSuper, isTargetSuperAdmin, isTargetAdmin]);

  const [nombre, setNombre] = useState('');
  const [negocio, setNegocio] = useState('');
  const [telefonos, setTelefonos] = useState('');
  const [email, setEmail] = useState('');
  const [cedula, setCedula] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [direccion, setDireccion] = useState('');
  const [pais, setPais] = useState('Costa Rica');
  const [sucursal, setSucursal] = useState('costarica');
  const [allowedPriceLists, setAllowedPriceLists] = useState<string[]>(['unit']);
  const [defaultPriceList, setDefaultPriceList] = useState<string>('unit');
  const [estadoAcceso, setEstadoAcceso] = useState<AccessStatus>('aprobado');
  const [whiteLabelEnabled, setWhiteLabelEnabled] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    NonNullable<Customer['subscriptionStatus']>
  >('none');
  const [rol, setRol] = useState<UserRole>('cliente');
  const [assignedBranches, setAssignedBranches] = useState<string[]>([]);
  const [loadingSave, setLoadingSave] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const availableBranchLists = useMemo(() => {
    const fallback = getDefaultPriceListsForBranch(sucursal);
    const branchFiltered = priceLists.filter(
      (l) => !l.branchSlug || l.branchSlug === sucursal || l.branchSlug === 'global'
    );
    const base = branchFiltered.length > 0 ? branchFiltered : fallback;
    const map = new Map<string, PriceList>();
    base.forEach((l) => map.set(l.id, l));
    allowedPriceLists.forEach((id) => {
      if (!map.has(id)) {
        map.set(id, {
          id,
          name: id,
          branchSlug: sucursal,
          mode: 'manual',
          isActive: true,
          sortOrder: 99,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }, [priceLists, sucursal, allowedPriceLists]);

  // Payment Modal state
  const [paymentOrder, setPaymentOrder] = useState<CustomerOrder | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  useModalHistory(isOpen, onClose, 'adminCustomerDetailModal');

  // Filter orders for this customer
  const customerOrders = useMemo(() => {
    if (!customer) return [];
    return orders.filter(
      (o) =>
        o.cliente_id === customer.id ||
        o.cliente_id === customer.uid ||
        (customer.telefonos && o.cliente_telefono === customer.telefonos)
    );
  }, [customer, orders]);

  // Financial calculations
  const totalFacturado = useMemo(() => {
    return customerOrders.reduce((sum, o) => sum + (o.total_factura || 0), 0);
  }, [customerOrders]);

  const totalAbonado = useMemo(() => {
    return customerOrders.reduce((sum, o) => sum + (o.monto_abonado || 0), 0);
  }, [customerOrders]);

  const totalSaldoPendiente = useMemo(() => {
    return customerOrders.reduce((sum, o) => {
      if (o.estado === 'pendiente' || o.estado === 'cancelado') return sum;
      const saldo = o.saldo !== undefined ? o.saldo : Math.max(0, (o.total_factura || 0) - (o.monto_abonado || 0));
      return sum + saldo;
    }, 0);
  }, [customerOrders]);

  const pendingPaymentOrdersCount = useMemo(() => {
    return customerOrders.filter((o) => {
      if (o.estado === 'pendiente' || o.estado === 'cancelado') return false;
      const saldo = o.saldo !== undefined ? o.saldo : Math.max(0, (o.total_factura || 0) - (o.monto_abonado || 0));
      return saldo > 0;
    }).length;
  }, [customerOrders]);

  useEffect(() => {
    if (customer) {
      setNombre(customer.nombre || '');
      setNegocio(customer.negocio || '');
      setTelefonos(customer.telefonos || '');
      setEmail(customer.email || '');
      setCedula(customer.cedula || '');
      setCiudad(customer.ciudad || '');
      setDireccion(customer.direccion || '');
      setPais(customer.pais || 'Costa Rica');
      setSucursal(customer.sucursal || 'costarica');

      const resolvedRol: UserRole =
        customer.rol ||
        (isAuthorizedSuperAdminEmail(customer.email)
          ? 'superadmin'
          : isAuthorizedAdminEmail(customer.email)
          ? 'admin'
          : 'cliente');
      setRol(resolvedRol);

      const legacyDefault = customer.defaultPriceList || mapLegacyTierToListId(customer.lista_precio);
      const initialAllowed =
        Array.isArray(customer.allowedPriceLists) && customer.allowedPriceLists.length > 0
          ? customer.allowedPriceLists
          : legacyDefault
          ? [legacyDefault]
          : ['unit'];
      setAllowedPriceLists(initialAllowed);
      setDefaultPriceList(initialAllowed.includes(legacyDefault) ? legacyDefault : initialAllowed[0] || 'unit');
      const resolvedAccess = resolveAccessStatus(customer);
      setEstadoAcceso(resolvedAccess === 'visitante' ? 'pendiente' : resolvedAccess);
      setWhiteLabelEnabled(Boolean(customer.whiteLabelEnabled));
      setSubscriptionStatus(customer.subscriptionStatus || 'none');

      setAssignedBranches(
        customer.assigned_branches && customer.assigned_branches.length > 0
          ? customer.assigned_branches
          : customer.sucursal
          ? [customer.sucursal]
          : ['costarica']
      );
    } else {
      setNombre('');
      setNegocio('');
      setTelefonos('');
      setEmail('');
      setCedula('');
      setCiudad('');
      setDireccion('');
      setPais('Costa Rica');
      setSucursal('costarica');
      setAllowedPriceLists(['unit']);
      setDefaultPriceList('unit');
      setEstadoAcceso('aprobado');
      setWhiteLabelEnabled(false);
      setSubscriptionStatus('none');
      setRol('cliente');
      setAssignedBranches(['costarica']);
      setActiveTab('profile');
    }
    setFeedback(null);
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const isPrivilegedRole = (r: UserRole) => r === 'superadmin' || r === 'admin' || r === 'vendedor';

  const toggleAllowedList = (listId: string) => {
    if (!canEditProfile) return;
    setAllowedPriceLists((prev) => {
      const exists = prev.includes(listId);
      const next = exists ? prev.filter((id) => id !== listId) : [...prev, listId];
      if (!exists && next.length === 1) {
        setDefaultPriceList(listId);
      } else if (exists && defaultPriceList === listId) {
        setDefaultPriceList(next[0] || 'unit');
      }
      return next;
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setFeedback({ type: 'error', text: 'El nombre es obligatorio.' });
      return;
    }

    if (!canEditProfile) {
      setFeedback({ type: 'error', text: 'Sin permisos para modificar este perfil administrativo.' });
      return;
    }

    if (!currentAdminIsSuper && (rol === 'superadmin' || rol === 'admin')) {
      setFeedback({ type: 'error', text: 'Solo un SuperAdmin puede asignar roles administrativos.' });
      return;
    }

    const effectiveAllowed = isPrivilegedRole(rol)
      ? availableBranchLists.filter((l) => l.isActive).map((l) => l.id)
      : allowedPriceLists;

    if (!isPrivilegedRole(rol) && estadoAcceso === 'aprobado' && effectiveAllowed.length === 0) {
      setFeedback({ type: 'error', text: 'Activa al menos una lista de precios para aprobar.' });
      return;
    }

    const effectiveDefault =
      effectiveAllowed.includes(defaultPriceList)
        ? defaultPriceList
        : effectiveAllowed[0] || 'unit';

    setLoadingSave(true);
    setFeedback(null);

    try {
      await onSaveCustomer({
        id: customer?.id || `CL-${Date.now().toString().slice(-6)}`,
        uid: customer?.uid,
        nombre: nombre.trim(),
        negocio: negocio.trim() || undefined,
        telefonos: telefonos.trim() || undefined,
        email: email.trim() || undefined,
        cedula: cedula.trim() || undefined,
        ciudad: ciudad.trim() || undefined,
        direccion: direccion.trim() || undefined,
        pais: pais.trim(),
        sucursal: sucursal.trim(),
        assigned_branches: rol === 'admin' ? assignedBranches : undefined,
        allowedPriceLists: isPrivilegedRole(rol) ? undefined : effectiveAllowed,
        defaultPriceList: effectiveDefault,
        lista_precio: mapListIdToLegacyTier(effectiveDefault),
        estado_acceso: isPrivilegedRole(rol) ? 'aprobado' : estadoAcceso,
        whiteLabelEnabled: rol === 'emprendedor' ? whiteLabelEnabled : false,
        subscriptionStatus: rol === 'emprendedor' ? subscriptionStatus : 'none',
        rol,
      });

      setFeedback({ type: 'success', text: 'Perfil actualizado correctamente.' });
      setTimeout(() => {
        setLoadingSave(false);
      }, 450);
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', text: err.message || 'Error al guardar usuario.' });
      setLoadingSave(false);
    }
  };

  const handleDelete = async () => {
    if (!customer || !onDeleteCustomer) return;

    if (!canDelete) {
      alert('No tienes permisos para eliminar a este usuario administrativo.');
      return;
    }

    if (!confirm(`¿Estás seguro de que deseas eliminar permanentemente al usuario "${customer.nombre}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      setLoadingSave(true);
      await onDeleteCustomer(customer.id, customer.uid);
      onClose();
    } catch (err: any) {
      alert('Error al eliminar usuario: ' + (err.message || 'Error desconocido'));
      setLoadingSave(false);
    }
  };

  const getStatusBadge = (status: CustomerOrder['estado']) => {
    switch (status) {
      case 'pendiente':
        return { label: 'Pendiente', bg: 'bg-amber-100 text-amber-800 border-amber-300', icon: Clock };
      case 'proceso':
      case 'bodega':
        return { label: 'En Proceso', bg: 'bg-blue-100 text-blue-800 border-blue-300', icon: Layers };
      case 'empaque':
        return { label: 'En Empaque', bg: 'bg-cyan-100 text-cyan-800 border-cyan-300', icon: Package };
      case 'despacho':
        return { label: 'Despachado', bg: 'bg-purple-100 text-purple-800 border-purple-300', icon: Truck };
      case 'entrega':
        return { label: 'En Entrega', bg: 'bg-indigo-100 text-indigo-800 border-indigo-300', icon: Clock };
      case 'entregado':
        return { label: 'Entregado', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle };
      case 'cancelado':
        return { label: 'Cancelado', bg: 'bg-rose-100 text-rose-800 border-rose-300', icon: X };
      default:
        return { label: 'Pendiente', bg: 'bg-slate-100 text-slate-800 border-slate-300', icon: Clock };
    }
  };

  const cleanPhone = telefonos ? telefonos.replace(/[^\d]/g, '') : '';
  const waMsg =
    estadoAcceso === 'aprobado'
      ? `Hola ${nombre || ''}, ya habilitamos tu acceso de precios en nuestro catálogo digital.`
      : `Hola ${nombre || ''}, recibimos tu solicitud en nuestro catálogo digital.`;
  const waUrl = cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waMsg)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-100 w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#3C5866] text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/15 text-lg font-black text-[#FFF3CD]">
              {customer?.nombre ? customer.nombre.charAt(0).toUpperCase() : <User className="w-5 h-5 text-[#FFF3CD]" />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold text-sm sm:text-base text-white">
                  {isEditing ? customer.nombre : 'Nuevo Usuario'}
                </h3>
                {isEditing && customer.negocio && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold bg-[#FFF3CD] text-[#3C5866] px-2.5 py-0.5 rounded-full border border-[#EBD89F] shadow-2xs">
                    <Building className="w-3 h-3 text-[#C37D41]" />
                    <span>{customer.negocio}</span>
                  </span>
                )}
                {isEditing && (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                    (rol === 'superadmin' || isAuthorizedSuperAdminEmail(customer?.email))
                      ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-xs'
                      : (rol === 'admin' || isAuthorizedAdminEmail(customer?.email))
                      ? 'bg-blue-100 text-blue-900 border-blue-300 shadow-xs'
                      : rol === 'vendedor'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-xs'
                      : rol === 'emprendedor'
                      ? 'bg-[#FFF3CD] text-[#263842] border-[#C37D41]'
                      : 'bg-white/15 text-slate-100 border-white/20'
                  }`}>
                    {(rol === 'superadmin' || isAuthorizedSuperAdminEmail(customer?.email)) ? (
                      <>
                        <Crown className="w-3.5 h-3.5 text-amber-900" />
                        <span>SuperAdmin</span>
                      </>
                    ) : (rol === 'admin' || isAuthorizedAdminEmail(customer?.email)) ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-800" />
                        <span>Admin Sede</span>
                      </>
                    ) : rol === 'vendedor' ? (
                      <>
                        <Briefcase className="w-3.5 h-3.5 text-emerald-800" />
                        <span>Vendedor</span>
                      </>
                    ) : rol === 'emprendedor' ? (
                      <>
                        <Store className="w-3.5 h-3.5 text-[#C37D41]" />
                        <span>Emprendedor</span>
                      </>
                    ) : (
                      <>
                        <User className="w-3.5 h-3.5 text-[#FFF3CD]" />
                        <span>Cliente</span>
                      </>
                    )}
                  </span>
                )}
                {isEditing && !isPrivilegedRole(rol) && (
                  <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                    estadoAcceso === 'aprobado'
                      ? 'bg-emerald-500/20 text-emerald-100 border-emerald-300/40'
                      : estadoAcceso === 'pendiente'
                      ? 'bg-amber-400/25 text-[#FFF3CD] border-amber-300/50'
                      : 'bg-rose-500/25 text-rose-100 border-rose-300/40'
                  }`}>
                    {estadoAcceso === 'aprobado'
                      ? 'Aprobado'
                      : estadoAcceso === 'pendiente'
                      ? 'Pendiente'
                      : estadoAcceso === 'rechazado'
                      ? 'Rechazado'
                      : 'Suspendido'}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-200 flex items-center gap-3 mt-0.5">
                {customer?.telefonos && <span>📞 {customer.telefonos}</span>}
                {customer?.email && <span>✉️ {customer.email}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">WhatsApp</span>
              </a>
            )}
            {isEditing && canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loadingSave}
                className="text-rose-200 hover:text-white hover:bg-rose-600/30 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-rose-400/30 active:scale-95"
                title="Eliminar usuario permanentemente"
              >
                <Trash2 className="w-4 h-4 text-rose-300" />
                <span className="hidden sm:inline">Eliminar</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-300 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        {isEditing && (
          <div className="bg-white px-4 sm:px-6 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
            <div className="flex items-center gap-3 sm:gap-6">
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`py-3.5 text-xs font-black border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'profile'
                    ? 'border-[#3C5866] text-[#3C5866]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Datos del Usuario</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className={`py-3.5 text-xs font-black border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'orders'
                    ? 'border-[#3C5866] text-[#3C5866]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Package className="w-4 h-4" />
                <span>Historial de Pedidos</span>
                <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black border shadow-2xs ${
                  activeTab === 'orders' ? 'bg-[#3C5866] text-white border-[#3C5866]' : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}>
                  {customerOrders.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('payments')}
                className={`py-3.5 text-xs font-black border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'payments'
                    ? 'border-[#3C5866] text-[#3C5866]'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Gestión de Pagos</span>
                {pendingPaymentOrdersCount > 0 ? (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-2 rounded-full text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                    {pendingPaymentOrdersCount} {pendingPaymentOrdersCount === 1 ? 'pendiente' : 'pendientes'}
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-2 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                    ✓ Al día
                  </span>
                )}
              </button>
            </div>

            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Contactar WhatsApp</span>
              </a>
            )}
          </div>
        )}

        {/* Tab Content Body */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: DATOS DEL CLIENTE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              {!canEditProfile && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2.5">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <p className="font-black">
                      {isTargetSuperAdmin
                        ? 'Perfil de SuperAdmin Protegido'
                        : 'Perfil de Administrador Protegido'}
                    </p>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Solo lectura. Únicamente un SuperAdmin puede modificar este usuario.
                    </p>
                  </div>
                </div>
              )}

              {canEditProfile && !isPrivilegedRole(rol) && (
                <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-extrabold border ${
                        estadoAcceso === 'aprobado'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : estadoAcceso === 'pendiente'
                          ? 'bg-[#FFF3CD] text-[#9A5B13] border-[#C37D41]/40'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      Estado: {estadoAcceso.toUpperCase()}
                    </span>
                    {customer?.perfil_solicitado && (
                      <span className="text-[11px] font-bold text-slate-500">
                        Solicitó: <strong className="text-[#3C5866] uppercase">{customer.perfil_solicitado}</strong>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEstadoAcceso('aprobado')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 border transition-colors ${
                        estadoAcceso === 'aprobado'
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                      }`}
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEstadoAcceso('rechazado')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 border transition-colors ${
                        estadoAcceso === 'rechazado'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                      Rechazar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEstadoAcceso('suspendido')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 border transition-colors ${
                        estadoAcceso === 'suspendido'
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Suspender
                    </button>
                  </div>
                </div>
              )}
              {feedback && (
                <div
                  className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
                <h4 className="text-xs font-black text-[#3C5866] uppercase mb-3 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-[#3C5866]" />
                  Información Personal y Comercial
                </h4>

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
                        disabled={!canEditProfile}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej. Cristian Restrepo"
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
                        disabled={!canEditProfile}
                        onChange={(e) => setNegocio(e.target.value)}
                        placeholder="Ej. Novedades Mary / Peluches CR"
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
                      disabled={!canEditProfile}
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
                        disabled={!canEditProfile}
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
                        disabled={!canEditProfile}
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
                      disabled={!canEditProfile}
                      onChange={(e) => {
                        setSucursal(e.target.value);
                        const b = branches.find((item) => item.slug === e.target.value);
                        if (b && b.country) setPais(b.country);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866] disabled:opacity-60"
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
                      Ciudad
                    </label>
                    <input
                      type="text"
                      value={ciudad}
                      disabled={!canEditProfile}
                      onChange={(e) => setCiudad(e.target.value)}
                      placeholder="Ej. San José / Alajuela"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                    />
                  </div>

                  <div className="sm:col-span-2 bg-[#F8FAFC] p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="text-[11px] font-bold text-[#263842] uppercase flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-[#3C5866]" />
                        <span>Listas de Precios Habilitadas</span>
                      </label>
                      {isPrivilegedRole(rol) && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Acceso completo por rol
                        </span>
                      )}
                    </div>

                    {isPrivilegedRole(rol) ? (
                      <p className="text-[11px] text-slate-600">
                        Este perfil visualiza automáticamente todas las listas activas de la sede.
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {availableBranchLists.map((list) => {
                            const checked = allowedPriceLists.includes(list.id);
                            return (
                              <label
                                key={list.id}
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer transition-colors ${
                                  checked
                                    ? 'bg-[#3C5866] text-white border-[#3C5866]'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                } ${!canEditProfile ? 'opacity-60 pointer-events-none' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={!canEditProfile}
                                  checked={checked}
                                  onChange={() => toggleAllowedList(list.id)}
                                  className="hidden"
                                />
                                <span>{list.name}</span>
                                {!list.isActive && (
                                  <span className="text-[9px] opacity-75">(Inactiva)</span>
                                )}
                              </label>
                            );
                          })}
                        </div>

                        {allowedPriceLists.length > 0 && (
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[10px] font-bold text-slate-500 uppercase">
                              Lista inicial:
                            </span>
                            <select
                              value={defaultPriceList}
                              disabled={!canEditProfile}
                              onChange={(e) => setDefaultPriceList(e.target.value)}
                              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-xs font-bold text-[#263842]"
                            >
                              {availableBranchLists
                                .filter((l) => allowedPriceLists.includes(l.id))
                                .map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {l.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </>
                    )}
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
                        disabled={!canEditProfile}
                        onChange={(e) => setDireccion(e.target.value)}
                        placeholder="Ej. San José, Barrio La Castellana, frente al parque..."
                        className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                      />
                    </div>
                  </div>

                  {/* Selector de Rol y Permisos */}
                  <div className="sm:col-span-2 bg-slate-50/90 p-4 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="text-[11px] font-black text-slate-700 uppercase flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-[#C37D41]" />
                        <span>Perfil y Permisos</span>
                      </label>
                      <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                        rol === 'superadmin'
                          ? 'bg-amber-100 text-amber-950 border-amber-300'
                          : rol === 'admin'
                          ? 'bg-blue-100 text-blue-900 border-blue-300'
                          : rol === 'vendedor'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          : rol === 'emprendedor'
                          ? 'bg-[#FFF3CD] text-[#263842] border-[#C37D41]'
                          : 'bg-slate-200 text-slate-700 border-slate-300'
                      }`}>
                        {rol === 'superadmin'
                          ? 'SuperAdmin'
                          : rol === 'admin'
                          ? 'Admin de Sede'
                          : rol === 'vendedor'
                          ? 'Vendedor'
                          : rol === 'emprendedor'
                          ? 'Emprendedor'
                          : 'Cliente'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {/* CARD 1: SUPERADMIN */}
                      <button
                        type="button"
                        disabled={!currentAdminIsSuper}
                        onClick={() => setRol('superadmin')}
                        className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                          rol === 'superadmin'
                            ? 'bg-amber-100/70 border-amber-400 ring-2 ring-amber-400/40 shadow-xs'
                            : currentAdminIsSuper
                            ? 'bg-white/70 border-slate-200 hover:bg-white text-slate-700'
                            : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg shrink-0 ${rol === 'superadmin' ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-400'}`}>
                          <Crown className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-black text-slate-900">SuperAdmin</p>
                            {!currentAdminIsSuper && <Lock className="w-3 h-3 text-slate-400" />}
                          </div>
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                            Acceso global y módulo financiero.
                          </p>
                        </div>
                      </button>

                      {/* CARD 2: ADMIN DE SUCURSAL */}
                      <button
                        type="button"
                        disabled={!currentAdminIsSuper}
                        onClick={() => setRol('admin')}
                        className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                          rol === 'admin'
                            ? 'bg-blue-50/90 border-blue-400 ring-2 ring-blue-400/40 shadow-xs'
                            : currentAdminIsSuper
                            ? 'bg-white/70 border-slate-200 hover:bg-white text-slate-700'
                            : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg shrink-0 ${rol === 'admin' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-black text-slate-900">Admin Sede</p>
                            {!currentAdminIsSuper && <Lock className="w-3 h-3 text-slate-400" />}
                          </div>
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                            Gestión operativa en sus sedes.
                          </p>
                        </div>
                      </button>

                      {/* CARD 3: VENDEDOR */}
                      <button
                        type="button"
                        disabled={!canEditRole}
                        onClick={() => {
                          setRol('vendedor');
                          setEstadoAcceso('aprobado');
                        }}
                        className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                          rol === 'vendedor'
                            ? 'bg-emerald-50/90 border-emerald-400 ring-2 ring-emerald-400/40 shadow-xs'
                            : canEditRole
                            ? 'bg-white/70 border-slate-200 hover:bg-white text-slate-700'
                            : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg shrink-0 ${rol === 'vendedor' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <Briefcase className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-black text-slate-900">Vendedor</p>
                            {!canEditRole && <Lock className="w-3 h-3 text-slate-400" />}
                          </div>
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                            Catálogo completo y asignación de pedidos.
                          </p>
                        </div>
                      </button>

                      {/* CARD 4: EMPRENDEDOR */}
                      <button
                        type="button"
                        disabled={!canEditRole}
                        onClick={() => {
                          setRol('emprendedor');
                          if (allowedPriceLists.length === 0) {
                            setAllowedPriceLists(['wholesale', 'dozen']);
                            setDefaultPriceList('wholesale');
                          }
                        }}
                        className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                          rol === 'emprendedor'
                            ? 'bg-[#FFF3CD]/60 border-[#C37D41] ring-2 ring-[#C37D41]/30 shadow-xs'
                            : canEditRole
                            ? 'bg-white/70 border-slate-200 hover:bg-white text-slate-700'
                            : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg shrink-0 ${rol === 'emprendedor' ? 'bg-[#C37D41] text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <Store className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-black text-slate-900">Emprendedor</p>
                            {!canEditRole && <Lock className="w-3 h-3 text-slate-400" />}
                          </div>
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                            Mayorista con marca blanca opcional.
                          </p>
                        </div>
                      </button>

                      {/* CARD 5: CLIENTE */}
                      <button
                        type="button"
                        disabled={!canEditRole}
                        onClick={() => {
                          setRol('cliente');
                          if (allowedPriceLists.length === 0) {
                            setAllowedPriceLists(['unit']);
                            setDefaultPriceList('unit');
                          }
                        }}
                        className={`p-3 rounded-xl border text-left flex items-start gap-2.5 transition-all cursor-pointer ${
                          rol === 'cliente'
                            ? 'bg-white border-[#3C5866] ring-2 ring-[#3C5866]/30 shadow-xs'
                            : canEditRole
                            ? 'bg-white/70 border-slate-200 hover:bg-white text-slate-700'
                            : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <div className={`p-1.5 rounded-lg shrink-0 ${rol === 'cliente' ? 'bg-[#3C5866] text-white' : 'bg-slate-100 text-slate-400'}`}>
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-black text-slate-900">Cliente</p>
                            {!canEditRole && <Lock className="w-3 h-3 text-slate-400" />}
                          </div>
                          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
                            Catálogo con listas asignadas y pedidos.
                          </p>
                        </div>
                      </button>
                    </div>

                    {!currentAdminIsSuper && (isTargetSuperAdmin || isTargetAdmin) && (
                      <p className="text-[11px] text-amber-900 bg-amber-100 border border-amber-300 p-2.5 rounded-xl flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>Solo un SuperAdmin puede modificar usuarios administrativos.</span>
                      </p>
                    )}

                    {!currentAdminIsSuper && !isTargetSuperAdmin && !isTargetAdmin && (
                      <p className="text-[10.5px] text-slate-600 bg-slate-100 border border-slate-200 p-2 rounded-xl flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#3C5866] shrink-0" />
                        <span>Puedes clasificar entre Cliente, Emprendedor o Vendedor en tu sede.</span>
                      </p>
                    )}

                    {/* SUBPANEL: MARCA BLANCA PARA EMPRENDEDOR */}
                    {rol === 'emprendedor' && (
                      <div className="mt-2 p-3.5 bg-white rounded-xl border border-[#C37D41]/40 flex flex-wrap items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            disabled={!canEditProfile}
                            checked={whiteLabelEnabled}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setWhiteLabelEnabled(checked);
                              if (checked && subscriptionStatus === 'none') {
                                setSubscriptionStatus('active');
                              } else if (!checked) {
                                setSubscriptionStatus('none');
                              }
                            }}
                            className="w-4 h-4 accent-[#C37D41]"
                          />
                          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#263842]">
                            <Sparkles className="w-3.5 h-3.5 text-[#C37D41]" />
                            Catálogo Marca Blanca (Modo Reventa)
                          </span>
                        </label>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase">
                            Plan:
                          </span>
                          <select
                            disabled={!canEditProfile}
                            value={subscriptionStatus}
                            onChange={(e) => {
                              const val = e.target.value as NonNullable<Customer['subscriptionStatus']>;
                              setSubscriptionStatus(val);
                              setWhiteLabelEnabled(val === 'active' || val === 'trial');
                            }}
                            className="px-2.5 py-1 rounded-lg border border-slate-300 bg-slate-50 text-xs font-bold text-[#263842]"
                          >
                            <option value="none">Sin plan</option>
                            <option value="trial">Prueba</option>
                            <option value="active">Activo</option>
                            <option value="expired">Vencido</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* SUBPANEL: ASIGNACIÓN MULTI-SUCURSAL SI ES ADMIN */}
                    {rol === 'admin' && (
                      <div className="mt-3 p-3 bg-white rounded-xl border border-blue-200 space-y-2">
                        <p className="text-[11px] font-extrabold text-blue-900 flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-blue-600" />
                          <span>Sucursales Autorizadas para este Administrador (Multi-Sucursal):</span>
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {branches.length > 0 ? (
                            branches.map((b) => {
                              const isAssigned = assignedBranches.includes(b.slug);
                              return (
                                <label
                                  key={b.slug}
                                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                    isAssigned
                                      ? 'bg-blue-50 border-blue-400 text-blue-900 ring-1 ring-blue-300'
                                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                  } ${!currentAdminIsSuper ? 'opacity-70 pointer-events-none' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={!currentAdminIsSuper}
                                    checked={isAssigned}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setAssignedBranches((prev) => [...prev, b.slug]);
                                      } else {
                                        setAssignedBranches((prev) => prev.filter((s) => s !== b.slug));
                                      }
                                    }}
                                    className="rounded text-blue-600 focus:ring-blue-500"
                                  />
                                  <span>{b.name} ({b.country || 'Internacional'})</span>
                                </label>
                              );
                            })
                          ) : (
                            <span className="text-xs text-slate-500 italic">No hay sucursales registradas aún.</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Botones de acción del formulario */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200 mt-4">
                <div>
                  {isEditing && canDelete && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={loadingSave}
                      className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Eliminar Usuario</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!canEditProfile || loadingSave}
                    className="bg-[#3C5866] hover:bg-[#2c424e] text-white px-5 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4 text-[#FFF3CD]" />
                    <span>{loadingSave ? 'Guardando...' : 'Guardar Cambios'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TAB 2: HISTORIAL DE PEDIDOS */}
          {activeTab === 'orders' && (
            <div className="space-y-3.5">
              {/* Toolbar */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs font-extrabold text-slate-700">
                  {customerOrders.length} pedido(s) registrado(s)
                </span>

                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setOrdersViewMode('cards')}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      ordersViewMode === 'cards'
                        ? 'bg-white text-[#3C5866] shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Vista en Tarjetas"
                  >
                    <LayoutGrid className="w-4 h-4" />
                    <span className="hidden sm:inline">Tarjetas</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOrdersViewMode('table')}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                      ordersViewMode === 'table'
                        ? 'bg-white text-[#3C5866] shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                    title="Vista en Tabla"
                  >
                    <List className="w-4 h-4" />
                    <span className="hidden sm:inline">Tabla</span>
                  </button>
                </div>
              </div>

              {customerOrders.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-white rounded-3xl border border-slate-200 p-8">
                  <Package className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="font-bold text-slate-600 text-sm">Este cliente aún no registra pedidos.</p>
                </div>
              ) : ordersViewMode === 'cards' ? (
                /* Compact Cards Grid */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {customerOrders.map((order) => {
                    const badge = getStatusBadge(order.estado);
                    const StatusIcon = badge.icon;
                    const itemsCount = order.items?.reduce((s, i) => s + i.cantidad, 0) || 0;
                    const totalAmount = order.total_factura || 0;
                    const saldo = order.saldo !== undefined ? order.saldo : Math.max(0, totalAmount - (order.monto_abonado || 0));

                    return (
                      <div
                        key={order.id}
                        onClick={() => onOpenOrderEditor(order)}
                        className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-[#3C5866] hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="font-extrabold text-sm text-[#3C5866] group-hover:text-[#C37D41] transition-colors">
                              #{order.id}
                            </span>
                            <span className={`inline-flex items-center gap-1 text-[10.5px] font-extrabold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                              <StatusIcon className="w-3 h-3" />
                              {badge.label}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 my-2">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {new Date(order.creado_en).toLocaleDateString('es-ES')}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package className="w-3.5 h-3.5 text-slate-400" />
                              {itemsCount} uds. ({order.items?.length || 0} ref.)
                            </span>
                          </div>
                        </div>

                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                          <div>
                            <span className="font-black text-sm text-slate-900 block">
                              {company.currencySymbol || '$'} {totalAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            {order.estado === 'pendiente' ? (
                              <span className="text-[10px] text-amber-700 font-bold block">
                                Por Confirmar
                              </span>
                            ) : saldo > 0 ? (
                              <span className="text-[10px] text-rose-600 font-bold block">
                                Saldo: {company.currencySymbol || '$'} {saldo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-600 font-bold block">
                                ✓ Al día
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadOrderExcel({ order, company, isAdmin: true });
                              }}
                              className="p-1.5 text-emerald-800 hover:bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                              title="Descargar Excel de Producción"
                            >
                              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                            </button>
                            <button className="flex items-center gap-0.5 text-xs font-extrabold text-[#3C5866] group-hover:text-[#C37D41]">
                              <span>Ver</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Clean Table View */
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-700 uppercase">
                          <th className="py-2.5 px-3">Folio / Fecha</th>
                          <th className="py-2.5 px-3">Artículos</th>
                          <th className="py-2.5 px-3 text-center">Estado</th>
                          <th className="py-2.5 px-3 text-right">Total Factura</th>
                          <th className="py-2.5 px-3 text-right">Saldo</th>
                          <th className="py-2.5 px-3 text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {customerOrders.map((order) => {
                          const badge = getStatusBadge(order.estado);
                          const totalUnits = order.items?.reduce((s, i) => s + i.cantidad, 0) || 0;
                          const totalFactura = order.total_factura || 0;
                          const saldo = order.saldo !== undefined ? order.saldo : Math.max(0, totalFactura - (order.monto_abonado || 0));

                          return (
                            <tr
                              key={order.id}
                              onClick={() => onOpenOrderEditor(order)}
                              className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                            >
                              <td className="py-2.5 px-3">
                                <span className="font-black text-[#3C5866] group-hover:text-[#C37D41] block">
                                  #{order.id}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(order.creado_en).toLocaleDateString('es-ES')}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-bold text-slate-800 block">
                                  {totalUnits} unidades
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  {order.items?.length || 0} referencias
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${badge.bg}`}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-black text-slate-900">
                                {company.currencySymbol || '$'} {totalFactura.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                {order.estado === 'pendiente' ? (
                                  <span className="text-[10px] text-amber-700 font-bold block">
                                    Por Confirmar
                                  </span>
                                ) : saldo > 0 ? (
                                  <span className="text-[10px] text-rose-600 font-bold block">
                                    {company.currencySymbol || '$'} {saldo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-emerald-600 font-bold block">
                                    ✓ Al día
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => downloadOrderExcel({ order, company, isAdmin: true })}
                                    className="p-1 text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-200 transition-colors"
                                    title="Descargar Excel de Producción"
                                  >
                                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onOpenOrderEditor(order)}
                                    className="p-1 text-[#3C5866] hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                                    title="Ver / Editar Pedido"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GESTIÓN DE PAGOS & ESTADO DE CUENTA */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              {/* Financial KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-[10.5px] font-bold text-slate-400 uppercase block">Total Facturado</span>
                  <span className="text-lg font-black text-slate-900 block mt-0.5">
                    {company.currencySymbol || '$'} {totalFacturado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-[10.5px] font-bold text-slate-400 uppercase block">Total Abonado / Pagado</span>
                  <span className="text-lg font-black text-emerald-700 block mt-0.5">
                    {company.currencySymbol || '$'} {totalAbonado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <span className="text-[10.5px] font-bold text-slate-400 uppercase block">Saldo Pendiente Activo</span>
                  <span className={`text-lg font-black block mt-0.5 ${totalSaldoPendiente > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {company.currencySymbol || '$'} {totalSaldoPendiente.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Invoices and Payments List */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                <div className="p-3.5 bg-slate-50/80 border-b border-slate-200">
                  <h4 className="text-xs font-black text-slate-800 uppercase flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    Detalle de Pedidos, Facturas y Abonos
                  </h4>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-extrabold text-slate-700 uppercase">
                        <th className="py-2.5 px-3">Pedido / Fecha</th>
                        <th className="py-2.5 px-3 text-right">Total Factura</th>
                        <th className="py-2.5 px-3 text-right">Abonado</th>
                        <th className="py-2.5 px-3 text-right">Saldo Pendiente</th>
                        <th className="py-2.5 px-3 text-center">Estado Pago</th>
                        <th className="py-2.5 px-3">Promesa Pago</th>
                        <th className="py-2.5 px-3 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {customerOrders.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400 font-semibold">
                            No hay facturas registradas.
                          </td>
                        </tr>
                      ) : (
                        customerOrders.map((order) => {
                          const totalFactura = order.total_factura || 0;
                          const abonado = order.monto_abonado || 0;
                          const saldo = order.saldo !== undefined ? order.saldo : Math.max(0, totalFactura - abonado);
                          const isPendienteAprobacion = order.estado === 'pendiente';

                          return (
                            <tr key={order.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-3">
                                <span className="font-extrabold text-[#3C5866] block">#{order.id}</span>
                                <span className="text-[10px] text-slate-400">{new Date(order.creado_en).toLocaleDateString('es-ES')}</span>
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                                {company.currencySymbol || '$'} {totalFactura.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                                {company.currencySymbol || '$'} {abonado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="py-2.5 px-3 text-right font-black">
                                {isPendienteAprobacion ? (
                                  <span className="text-amber-700 text-[10.5px]">Por Confirmar</span>
                                ) : saldo > 0 ? (
                                  <span className="text-rose-600">
                                    {company.currencySymbol || '$'} {saldo.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600 text-[10.5px]">✓ Pagado</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                <span
                                  className={`inline-block text-[9.5px] font-black px-2 py-0.5 rounded-full border ${
                                    order.estado_pago === 'pagado'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : order.estado_pago === 'parcial'
                                      ? 'bg-blue-50 text-blue-800 border-blue-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}
                                >
                                  {order.estado_pago === 'pagado' ? 'Pagado' : order.estado_pago === 'parcial' ? 'Abono Parcial' : 'Pendiente Pago'}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                {order.fecha_promesa_pago ? (
                                  <span className="text-[11px] font-bold text-slate-700 block">
                                    {new Date(order.fecha_promesa_pago).toLocaleDateString('es-ES')}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPaymentOrder(order);
                                    setIsPaymentModalOpen(true);
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl flex items-center gap-1 ml-auto transition-colors cursor-pointer"
                                >
                                  <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Abonar</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-5 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>

      {/* Payment & Abono Modal */}
      <OrderPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => {
          setIsPaymentModalOpen(false);
          setPaymentOrder(null);
        }}
        order={paymentOrder}
        company={company}
        onSavePayment={async (orderId, paymentData) => {
          await onUpdateOrder(orderId, paymentData);
          if (paymentOrder && paymentOrder.id === orderId) {
            setPaymentOrder((prev) => (prev ? { ...prev, ...paymentData } : null));
          }
        }}
      />
    </div>
  );
};