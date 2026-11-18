'use client';

import React, { useState, useMemo } from 'react';
import {
  AccessRequest,
  Customer,
  CustomerOrder,
  Branch,
  CompanyInfo,
  PriceList,
  Product,
  UserRole,
} from '@/lib/types';
import {
  Search,
  User,
  Building,
  Phone,
  Mail,
  MapPin,
  Tag,
  Package,
  Plus,
  UserPlus,
  X,
  MessageCircle,
  Clock,
  CheckCircle,
  Users,
  CreditCard,
  Layers,
  AlertCircle,
  DollarSign,
  ShieldCheck,
  Shield,
  Crown,
  Briefcase,
  Store,
  Sparkles,
  BellRing,
} from 'lucide-react';
import {
  isAuthorizedAdminEmail,
  isAuthorizedSuperAdminEmail,
  resolveAccessStatus,
} from '@/lib/auth';
import { getDefaultPriceListsForBranch } from '@/lib/pricing';
import { useAdminAuth } from '@/lib/AdminAuthContext';
import { CustomerDetailModal } from './CustomerDetailModal';
import { CustomerOrdersAdminModal } from './CustomerOrdersAdminModal';

type CustomerFilterKey =
  | 'all'
  | 'solicitudes'
  | 'pendientes'
  | 'superadmins'
  | 'admins'
  | 'vendedores'
  | 'emprendedores'
  | 'clientes'
  | 'pago_pendiente'
  | 'entrega_pendiente';

interface CustomerTableProps {
  customers: Customer[];
  orders: CustomerOrder[];
  products: Product[];
  branches: Branch[];
  priceLists?: PriceList[];
  accessRequests?: AccessRequest[];
  company: CompanyInfo;
  currentBranchSlug: string;
  onSaveCustomer: (customerData: Partial<Customer>) => Promise<void>;
  onDeleteCustomer: (customerId: string, uid?: string) => Promise<void>;
  onUpdateOrder: (orderId: string, updatedOrder: Partial<CustomerOrder>) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  onApproveRequest?: (
    request: AccessRequest,
    payload: {
      rol: Customer['rol'];
      allowedPriceLists: string[];
      defaultPriceList?: string;
      whiteLabelEnabled?: boolean;
      note?: string;
    }
  ) => Promise<void>;
  onRejectRequest?: (request: AccessRequest, note?: string) => Promise<void>;
}

export const CustomerTable: React.FC<CustomerTableProps> = ({
  customers,
  orders,
  products,
  branches,
  priceLists = [],
  accessRequests = [],
  company,
  currentBranchSlug,
  onSaveCustomer,
  onDeleteCustomer,
  onUpdateOrder,
  onDeleteOrder,
  onApproveRequest,
  onRejectRequest,
}) => {
  const { isSuperAdmin } = useAdminAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<CustomerFilterKey>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [orderToEdit, setOrderToEdit] = useState<CustomerOrder | null>(null);
  const [isOrderEditModalOpen, setIsOrderEditModalOpen] = useState(false);

  // Per-request inline quick-approval drafts
  const [requestDrafts, setRequestDrafts] = useState<
    Record<
      string,
      {
        rol: UserRole;
        allowedPriceLists: string[];
        whiteLabelEnabled: boolean;
      }
    >
  >({});
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  // Map orders per customer
  const customerOrdersMap = useMemo(() => {
    const map = new Map<string, CustomerOrder[]>();
    orders.forEach((o) => {
      if (o.cliente_id) {
        const list = map.get(o.cliente_id) || [];
        list.push(o);
        map.set(o.cliente_id, list);
      }
      if (o.cliente_telefono) {
        const list = map.get(o.cliente_telefono) || [];
        if (!o.cliente_id || !list.some((existing) => existing.id === o.id)) {
          list.push(o);
          map.set(o.cliente_telefono, list);
        }
      }
    });
    return map;
  }, [orders]);

  // Counts for filter pills
  const pendingPaymentCustomersCount = useMemo(() => {
    return customers.filter((c) => {
      const custOrders = customerOrdersMap.get(c.id) || (c.uid ? customerOrdersMap.get(c.uid) : []) || (c.telefonos ? customerOrdersMap.get(c.telefonos) : []) || [];
      return custOrders.some((o) => {
        if (o.estado === 'pendiente' || o.estado === 'cancelado') return false;
        const saldo = o.saldo !== undefined ? o.saldo : Math.max(0, (o.total_factura || 0) - (o.monto_abonado || 0));
        return saldo > 0;
      });
    }).length;
  }, [customers, customerOrdersMap]);

  const pendingDeliveryCustomersCount = useMemo(() => {
    return customers.filter((c) => {
      const custOrders = customerOrdersMap.get(c.id) || (c.uid ? customerOrdersMap.get(c.uid) : []) || (c.telefonos ? customerOrdersMap.get(c.telefonos) : []) || [];
      return custOrders.some((o) => o.estado !== 'entregado' && o.estado !== 'cancelado');
    }).length;
  }, [customers, customerOrdersMap]);

  const superAdminCustomersCount = useMemo(() => {
    return customers.filter((c) => c.rol === 'superadmin' || isAuthorizedSuperAdminEmail(c.email)).length;
  }, [customers]);

  const adminCustomersCount = useMemo(() => {
    return customers.filter(
      (c) =>
        (c.rol === 'admin' || isAuthorizedAdminEmail(c.email)) &&
        c.rol !== 'superadmin' &&
        !isAuthorizedSuperAdminEmail(c.email)
    ).length;
  }, [customers]);

  const sellerCustomersCount = useMemo(() => {
    return customers.filter((c) => c.rol === 'vendedor').length;
  }, [customers]);

  const entrepreneurCustomersCount = useMemo(() => {
    return customers.filter((c) => c.rol === 'emprendedor').length;
  }, [customers]);

  const pendingCustomersCount = useMemo(() => {
    return customers.filter((c) => resolveAccessStatus(c) === 'pendiente').length;
  }, [customers]);

  const pendingRequests = useMemo(() => {
    return accessRequests.filter((r) => r.estado === 'pendiente');
  }, [accessRequests]);

  const branchActiveLists = useMemo(() => {
    const filtered = priceLists.filter(
      (l) => l.isActive && (!l.branchSlug || l.branchSlug === currentBranchSlug || l.branchSlug === 'global')
    );
    return filtered.length > 0 ? filtered : getDefaultPriceListsForBranch(currentBranchSlug);
  }, [priceLists, currentBranchSlug]);

  const regularCustomersCount = useMemo(() => {
    return customers.filter(
      (c) =>
        (!c.rol || c.rol === 'cliente') &&
        !isAuthorizedAdminEmail(c.email) &&
        !isAuthorizedSuperAdminEmail(c.email)
    ).length;
  }, [customers]);

  // Filtered customers
  const filteredCustomers = useMemo(() => {
    let result = [...customers];

    if (statusFilter === 'pendientes') {
      result = result.filter((c) => resolveAccessStatus(c) === 'pendiente');
    } else if (statusFilter === 'superadmins') {
      result = result.filter((c) => c.rol === 'superadmin' || isAuthorizedSuperAdminEmail(c.email));
    } else if (statusFilter === 'admins') {
      result = result.filter(
        (c) =>
          (c.rol === 'admin' || isAuthorizedAdminEmail(c.email)) &&
          c.rol !== 'superadmin' &&
          !isAuthorizedSuperAdminEmail(c.email)
      );
    } else if (statusFilter === 'vendedores') {
      result = result.filter((c) => c.rol === 'vendedor');
    } else if (statusFilter === 'emprendedores') {
      result = result.filter((c) => c.rol === 'emprendedor');
    } else if (statusFilter === 'clientes') {
      result = result.filter(
        (c) =>
          (!c.rol || c.rol === 'cliente') &&
          !isAuthorizedAdminEmail(c.email) &&
          !isAuthorizedSuperAdminEmail(c.email)
      );
    } else if (statusFilter === 'pago_pendiente') {
      result = result.filter((c) => {
        const custOrders = customerOrdersMap.get(c.id) || (c.uid ? customerOrdersMap.get(c.uid) : []) || (c.telefonos ? customerOrdersMap.get(c.telefonos) : []) || [];
        return custOrders.some((o) => {
          if (o.estado === 'pendiente' || o.estado === 'cancelado') return false;
          const saldo = o.saldo !== undefined ? o.saldo : Math.max(0, (o.total_factura || 0) - (o.monto_abonado || 0));
          return saldo > 0;
        });
      });
    } else if (statusFilter === 'entrega_pendiente') {
      result = result.filter((c) => {
        const custOrders = customerOrdersMap.get(c.id) || (c.uid ? customerOrdersMap.get(c.uid) : []) || (c.telefonos ? customerOrdersMap.get(c.telefonos) : []) || [];
        return custOrders.some((o) => o.estado !== 'entregado' && o.estado !== 'cancelado');
      });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((c) => {
        return (
          c.nombre.toLowerCase().includes(q) ||
          (c.negocio && c.negocio.toLowerCase().includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)) ||
          (c.telefonos && c.telefonos.toLowerCase().includes(q)) ||
          (c.id && c.id.toLowerCase().includes(q)) ||
          (c.pais && c.pais.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [customers, statusFilter, searchTerm, customerOrdersMap]);

  const filteredRequests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const list = [...accessRequests].sort((a, b) => {
      if (a.estado === 'pendiente' && b.estado !== 'pendiente') return -1;
      if (b.estado === 'pendiente' && a.estado !== 'pendiente') return 1;
      return new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime();
    });
    if (!q) return list;
    return list.filter(
      (r) =>
        (r.nombre || '').toLowerCase().includes(q) ||
        (r.negocio || '').toLowerCase().includes(q) ||
        (r.telefonos || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.ciudad || '').toLowerCase().includes(q)
    );
  }, [accessRequests, searchTerm]);

  const getDraftForRequest = (req: AccessRequest) => {
    if (requestDrafts[req.id]) return requestDrafts[req.id];
    const defaultRole: UserRole =
      req.perfil_solicitado === 'emprendedor' ? 'emprendedor' : 'cliente';
    const fallbackLists =
      req.listas_solicitadas && req.listas_solicitadas.length > 0
        ? req.listas_solicitadas
        : defaultRole === 'emprendedor'
        ? branchActiveLists
            .filter((l) => l.id === 'wholesale' || l.id === 'dozen')
            .map((l) => l.id)
        : [branchActiveLists[0]?.id || 'unit'];
    return {
      rol: defaultRole,
      allowedPriceLists: fallbackLists.length > 0 ? fallbackLists : ['unit'],
      whiteLabelEnabled: false,
    };
  };

  const handleQuickApprove = async (req: AccessRequest) => {
    if (!onApproveRequest || processingRequestId) return;
    const draft = getDraftForRequest(req);
    const lists =
      draft.rol === 'vendedor'
        ? branchActiveLists.map((l) => l.id)
        : draft.allowedPriceLists.length > 0
        ? draft.allowedPriceLists
        : ['unit'];

    setProcessingRequestId(req.id);
    try {
      await onApproveRequest(req, {
        rol: draft.rol,
        allowedPriceLists: lists,
        defaultPriceList: lists[0],
        whiteLabelEnabled: draft.rol === 'emprendedor' ? draft.whiteLabelEnabled : false,
      });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleQuickReject = async (req: AccessRequest) => {
    if (!onRejectRequest || processingRequestId) return;
    if (!confirm(`¿Rechazar la solicitud de ${req.nombre}?`)) return;
    setProcessingRequestId(req.id);
    try {
      await onRejectRequest(req);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleOpenNewCustomer = () => {
    setSelectedCustomer(null);
    setIsDetailModalOpen(true);
  };

  const handleOpenCustomerDetail = (cust: Customer) => {
    setSelectedCustomer(cust);
    setIsDetailModalOpen(true);
  };

  const handleOpenOrderEditor = (order: CustomerOrder) => {
    setOrderToEdit(order);
    setIsOrderEditModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Top Search & Actions Bar (Completamente Responsivo) */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3.5">
        {/* Fila 1: Búsqueda amplia y Botón de Acción Principal */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar usuario por nombre, email, teléfono, tienda, país..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3C5866] focus:bg-white transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition-colors cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenNewCustomer}
              className="w-full sm:w-auto bg-[#3C5866] hover:bg-[#2c424e] text-white px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs active:scale-95 transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-[#FFF3CD]" />
              <span>Nuevo Usuario</span>
            </button>
          </div>
        </div>

        {/* Fila 2: Barra de Filtros Dividida (Roles y Cartera de Pedidos) */}
        <div className="pt-3 border-t border-slate-100 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          {/* Grupo A: Filtros por Rol y Solicitudes */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0 scrollbar-none no-scrollbar">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 hidden sm:inline">
              Vista:
            </span>
            <button
              onClick={() => setStatusFilter('solicitudes')}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                statusFilter === 'solicitudes'
                  ? 'bg-[#C37D41] text-white shadow-xs'
                  : pendingRequests.length > 0
                  ? 'bg-[#FFF3CD] text-[#9A5B13] border border-[#C37D41]/40 hover:bg-[#ffe9a6]'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Solicitudes ({pendingRequests.length})</span>
            </button>
            <button
              onClick={() => setStatusFilter('pendientes')}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                statusFilter === 'pendientes'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pendientes ({pendingCustomersCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('all')}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-[#3C5866] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
              }`}
            >
              Todos ({customers.length})
            </button>
            {isSuperAdmin && (
              <>
                <button
                  onClick={() => setStatusFilter('superadmins')}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                    statusFilter === 'superadmins'
                      ? 'bg-amber-400 text-amber-950 font-black shadow-xs ring-1 ring-amber-500'
                      : 'bg-amber-50 text-amber-900 border border-amber-200/80 hover:bg-amber-100'
                  }`}
                >
                  <Crown className="w-3.5 h-3.5 text-amber-600" />
                  <span>SuperAdmins ({superAdminCustomersCount})</span>
                </button>
                <button
                  onClick={() => setStatusFilter('admins')}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                    statusFilter === 'admins'
                      ? 'bg-blue-600 text-white font-black shadow-xs'
                      : 'bg-blue-50 text-blue-900 border border-blue-200/80 hover:bg-blue-100'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Admins ({adminCustomersCount})</span>
                </button>
              </>
            )}
            <button
              onClick={() => setStatusFilter('vendedores')}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                statusFilter === 'vendedores'
                  ? 'bg-emerald-600 text-white font-black shadow-xs'
                  : 'bg-emerald-50 text-emerald-900 border border-emerald-200/80 hover:bg-emerald-100'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5 text-emerald-600" />
              <span>Vendedores ({sellerCustomersCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('emprendedores')}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                statusFilter === 'emprendedores'
                  ? 'bg-[#C37D41] text-white font-black shadow-xs'
                  : 'bg-amber-50/70 text-[#9A5B13] border border-[#C37D41]/30 hover:bg-amber-100/70'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Emprendedores ({entrepreneurCustomersCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('clientes')}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                statusFilter === 'clientes'
                  ? 'bg-slate-800 text-white font-black shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span>Clientes ({regularCustomersCount})</span>
            </button>
          </div>

          {/* Grupo B: Filtros por Cartera de Pedidos */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0 scrollbar-none no-scrollbar shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 hidden sm:inline">
              Cartera:
            </span>
            <button
              onClick={() => setStatusFilter('pago_pendiente')}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                statusFilter === 'pago_pendiente'
                  ? 'bg-rose-600 text-white font-black shadow-xs'
                  : 'bg-rose-50 text-rose-800 border border-rose-200/80 hover:bg-rose-100'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${statusFilter === 'pago_pendiente' ? 'bg-white' : 'bg-rose-500'}`} />
              <span>Saldo Pendiente ({pendingPaymentCustomersCount})</span>
            </button>
            <button
              onClick={() => setStatusFilter('entrega_pendiente')}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                statusFilter === 'entrega_pendiente'
                  ? 'bg-sky-600 text-white font-black shadow-xs'
                  : 'bg-sky-50 text-sky-800 border border-sky-200/80 hover:bg-sky-100'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${statusFilter === 'entrega_pendiente' ? 'bg-white' : 'bg-sky-500'}`} />
              <span>Entrega Pendiente ({pendingDeliveryCustomersCount})</span>
            </button>
          </div>
        </div>

        {/* Barra de Resumen cuando hay filtros aplicados */}
        {(statusFilter !== 'all' || searchTerm.trim()) && (
          <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 px-3.5 py-2 rounded-2xl border border-slate-100">
            <span>
              Mostrando <strong className="text-slate-800">{filteredCustomers.length}</strong> de <strong className="text-slate-800">{customers.length}</strong> usuarios
            </span>
            <button
              type="button"
              onClick={() => {
                setStatusFilter('all');
                setSearchTerm('');
              }}
              className="text-[#3C5866] hover:text-[#2c424e] font-extrabold text-xs underline cursor-pointer"
            >
              Restablecer filtros
            </button>
          </div>
        )}
      </div>

      {/* Vista de Solicitudes de Acceso OR Tabla de Usuarios */}
      {statusFilter === 'solicitudes' ? (
        <div className="space-y-3">
          {filteredRequests.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200/80 p-10 text-center text-slate-400 text-xs font-semibold">
              <BellRing className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              Sin solicitudes de acceso registradas.
            </div>
          ) : (
            filteredRequests.map((req) => {
              const draft = getDraftForRequest(req);
              const cleanReqPhone = req.telefonos ? req.telefonos.replace(/[^\d]/g, '') : '';
              const reqWaUrl = cleanReqPhone
                ? `https://wa.me/${cleanReqPhone}?text=${encodeURIComponent(
                    `Hola ${req.nombre}, te contactamos por tu solicitud en el catálogo.`
                  )}`
                : null;
              const isPending = req.estado === 'pendiente';
              const matchingCust = customers.find(
                (c) => c.id === req.customerId || c.uid === req.uid
              );

              return (
                <div
                  key={req.id}
                  className={`bg-white rounded-2xl border p-4 shadow-xs space-y-3 ${
                    isPending ? 'border-[#C37D41]/50 ring-1 ring-[#FFF3CD]' : 'border-slate-200 opacity-80'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-[#263842]">{req.nombre}</span>
                        {req.negocio && (
                          <span className="px-2 py-0.5 rounded-full bg-[#FFF3CD] text-[#9A5B13] text-[10px] font-bold">
                            {req.negocio}
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            req.estado === 'pendiente'
                              ? 'bg-amber-100 text-amber-800'
                              : req.estado === 'aprobado'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {req.estado}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                          Solicitó: {req.perfil_solicitado.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                        {req.telefonos && <span>📱 {req.telefonos}</span>}
                        {req.email && <span>✉️ {req.email}</span>}
                        {req.ciudad && <span>📍 {req.ciudad}</span>}
                        <span>📅 {new Date(req.creado_en).toLocaleDateString('es-ES')}</span>
                      </div>
                      {req.mensaje && (
                        <p className="text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                          &ldquo;{req.mensaje}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {reqWaUrl && (
                        <a
                          href={reqWaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          WhatsApp
                        </a>
                      )}
                      {matchingCust && (
                        <button
                          type="button"
                          onClick={() => handleOpenCustomerDetail(matchingCust)}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                        >
                          Ver Perfil
                        </button>
                      )}
                    </div>
                  </div>

                  {isPending && onApproveRequest && (
                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1">
                          {(['cliente', 'emprendedor', 'vendedor'] as UserRole[]).map((roleOpt) => (
                            <button
                              key={roleOpt}
                              type="button"
                              onClick={() =>
                                setRequestDrafts((prev) => ({
                                  ...prev,
                                  [req.id]: {
                                    ...draft,
                                    rol: roleOpt,
                                  },
                                }))
                              }
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize border transition-colors ${
                                draft.rol === roleOpt
                                  ? 'bg-[#3C5866] text-white border-[#3C5866]'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {roleOpt}
                            </button>
                          ))}
                        </div>

                        {draft.rol !== 'vendedor' && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {branchActiveLists.map((list) => {
                              const checked = draft.allowedPriceLists.includes(list.id);
                              return (
                                <button
                                  key={list.id}
                                  type="button"
                                  onClick={() => {
                                    const nextLists = checked
                                      ? draft.allowedPriceLists.filter((id) => id !== list.id)
                                      : [...draft.allowedPriceLists, list.id];
                                    setRequestDrafts((prev) => ({
                                      ...prev,
                                      [req.id]: { ...draft, allowedPriceLists: nextLists },
                                    }));
                                  }}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${
                                    checked
                                      ? 'bg-[#FFF3CD] text-[#263842] border-[#C37D41]'
                                      : 'bg-slate-50 text-slate-500 border-slate-200'
                                  }`}
                                >
                                  {list.name}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {draft.rol === 'emprendedor' && (
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#263842] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={draft.whiteLabelEnabled}
                              onChange={(e) =>
                                setRequestDrafts((prev) => ({
                                  ...prev,
                                  [req.id]: {
                                    ...draft,
                                    whiteLabelEnabled: e.target.checked,
                                  },
                                }))
                              }
                              className="w-3.5 h-3.5 accent-[#C37D41]"
                            />
                            <span>Marca Blanca</span>
                          </label>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {onRejectRequest && (
                          <button
                            type="button"
                            disabled={processingRequestId === req.id}
                            onClick={() => handleQuickReject(req)}
                            className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold disabled:opacity-50"
                          >
                            Rechazar
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={processingRequestId === req.id}
                          onClick={() => handleQuickApprove(req)}
                          className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          {processingRequestId === req.id ? 'Procesando...' : 'Aprobar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Usuario</th>
                  <th className="py-3.5 px-3">Contacto Directo</th>
                  <th className="py-3.5 px-3">Tienda / País</th>
                  <th className="py-3.5 px-3 text-center">Listas / Estado</th>
                  <th className="py-3.5 px-3 text-center">Pedidos / Saldo</th>
                  <th className="py-3.5 px-4 text-right">Último Acceso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 font-semibold">
                      <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      No se encontraron usuarios coincidentes.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => {
                    const custOrders = customerOrdersMap.get(cust.id) || (cust.uid ? customerOrdersMap.get(cust.uid) : []) || (cust.telefonos ? customerOrdersMap.get(cust.telefonos) : []) || [];
                    const ordersCount = custOrders.length;
                    const totalPendingBalance = custOrders.reduce((sum, o) => {
                      if (o.estado === 'pendiente' || o.estado === 'cancelado') return sum;
                      const saldo = o.saldo !== undefined ? o.saldo : Math.max(0, (o.total_factura || 0) - (o.monto_abonado || 0));
                      return sum + saldo;
                    }, 0);

                    const cleanPhone = cust.telefonos ? cust.telefonos.replace(/[^\d+]/g, '') : '';
                    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.replace('+', '')}` : null;
                    const isCustSuperAdmin = cust.rol === 'superadmin' || isAuthorizedSuperAdminEmail(cust.email);
                    const isCustBranchAdmin = !isCustSuperAdmin && (cust.rol === 'admin' || isAuthorizedAdminEmail(cust.email));
                    const isCustSeller = cust.rol === 'vendedor';
                    const isCustEntrepreneur = cust.rol === 'emprendedor';
                    const accessStatus = resolveAccessStatus(cust);
                    const assignedListIds =
                      isCustSuperAdmin || isCustBranchAdmin || isCustSeller
                        ? ['Todas']
                        : cust.allowedPriceLists && cust.allowedPriceLists.length > 0
                        ? cust.allowedPriceLists
                        : cust.lista_precio
                        ? [cust.lista_precio]
                        : [];

                    return (
                      <tr
                        key={cust.id}
                        onClick={() => handleOpenCustomerDetail(cust)}
                        className="hover:bg-slate-50/90 transition-colors group cursor-pointer"
                        title="Clic para ver datos, historial de pedidos y gestión de pagos"
                      >
                        {/* Cliente */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 font-black text-xs ${
                              isCustSuperAdmin
                                ? 'bg-amber-200 border border-amber-400 text-amber-950 font-black shadow-xs'
                                : isCustBranchAdmin
                                ? 'bg-blue-100 border border-blue-300 text-blue-900 font-extrabold'
                                : isCustSeller
                                ? 'bg-emerald-100 border border-emerald-300 text-emerald-800 font-extrabold'
                                : isCustEntrepreneur
                                ? 'bg-[#FFF3CD] border border-[#C37D41]/50 text-[#9A5B13] font-extrabold'
                                : 'bg-amber-50 border border-amber-200/80 text-[#C37D41]'
                            }`}>
                              {cust.nombre.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-extrabold text-slate-900 group-hover:text-[#3C5866] transition-colors text-xs">
                                  {cust.nombre}
                                </span>
                                {isCustSuperAdmin ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-950 border border-amber-300 font-black text-[9.5px]">
                                    <Crown className="w-3 h-3 text-amber-600" />
                                    SuperAdmin
                                  </span>
                                ) : isCustBranchAdmin ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-900 border border-blue-200 font-extrabold text-[9.5px]">
                                    <ShieldCheck className="w-3 h-3 text-blue-600" />
                                    Admin Sede
                                  </span>
                                ) : isCustSeller ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-200 font-extrabold text-[9.5px]">
                                    <Briefcase className="w-3 h-3 text-emerald-600" />
                                    Vendedor
                                  </span>
                                ) : isCustEntrepreneur ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#FFF3CD] text-[#9A5B13] border border-[#C37D41]/40 font-extrabold text-[9.5px]">
                                    <Store className="w-3 h-3 text-[#C37D41]" />
                                    Emprendedor
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 font-semibold text-[9.5px]">
                                    <User className="w-2.5 h-2.5 text-slate-400" />
                                    Cliente
                                  </span>
                                )}
                                {cust.whiteLabelEnabled && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#263842] text-[#FFF3CD] font-bold text-[9px]">
                                    <Sparkles className="w-2.5 h-2.5" />
                                    Marca Blanca
                                  </span>
                                )}
                                {accessStatus !== 'aprobado' && (
                                  <span
                                    className={`inline-flex items-center px-1.5 py-0.5 rounded-md font-extrabold text-[9px] uppercase border ${
                                      accessStatus === 'pendiente'
                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                        : 'bg-rose-100 text-rose-700 border-rose-200'
                                    }`}
                                  >
                                    {accessStatus}
                                  </span>
                                )}
                              </div>
                              {cust.cedula && (
                                <span className="text-[10px] text-slate-400 font-medium block">
                                  Cédula: {cust.cedula}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Contacto */}
                        <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-1">
                            {cust.telefonos ? (
                              <div className="flex items-center gap-1.5">
                                {waUrl ? (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200 transition-colors"
                                    title="Enviar mensaje por WhatsApp"
                                  >
                                    <MessageCircle className="w-3 h-3 text-emerald-600" />
                                    <span>{cust.telefonos}</span>
                                  </a>
                                ) : (
                                  <span className="text-[11px] text-slate-700 font-medium flex items-center gap-1">
                                    <Phone className="w-3 h-3 text-slate-400" />
                                    {cust.telefonos}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">Sin teléfono</span>
                            )}

                            {cust.email && (
                              <a
                                href={`mailto:${cust.email}`}
                                className="text-[10.5px] text-slate-500 hover:text-[#3C5866] font-medium flex items-center gap-1 truncate max-w-[170px]"
                                title={cust.email}
                              >
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{cust.email}</span>
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Tienda / País */}
                        <td className="py-3 px-3">
                          <div>
                            {cust.negocio ? (
                              <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1">
                                <Building className="w-3.5 h-3.5 text-[#C37D41]" />
                                {cust.negocio}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 font-medium italic">
                                Cliente Individual
                              </span>
                            )}
                            <span className="text-[11px] text-slate-600 font-bold flex items-center gap-1 mt-0.5">
                              <MapPin className="w-3 h-3 text-[#3C5866]" />
                              {cust.ciudad ? `${cust.ciudad}, ` : ''}{cust.pais || 'Costa Rica'}
                            </span>
                          </div>
                        </td>

                        {/* Listas / Tarifa */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex flex-wrap justify-center gap-1">
                            {assignedListIds.length === 0 ? (
                              <span className="text-[10px] font-bold text-slate-400">Sin acceso</span>
                            ) : (
                              assignedListIds.map((listId) => {
                                const listMeta = branchActiveLists.find((l) => l.id === listId);
                                const label = listMeta?.name || listId;
                                return (
                                  <span
                                    key={listId}
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border bg-slate-100 text-[#263842] border-slate-200"
                                  >
                                    {label}
                                  </span>
                                );
                              })
                            )}
                          </div>
                        </td>

                        {/* Pedidos & Estado de Saldo */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="font-extrabold text-xs text-slate-800">
                              {ordersCount} pedido(s)
                            </span>
                            {totalPendingBalance > 0 ? (
                              <span className="text-[10px] font-extrabold text-rose-600 bg-rose-50 px-2 py-0.2 rounded-md border border-rose-200">
                                Saldo: {company.currencySymbol || '$'} {totalPendingBalance.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </span>
                            ) : ordersCount > 0 ? (
                              <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.2 rounded-md border border-emerald-200">
                                ✓ Al día
                              </span>
                            ) : (
                              <span className="text-[9.5px] text-slate-400">Sin historial</span>
                            )}
                          </div>
                        </td>

                        {/* Último Acceso */}
                        <td className="py-3 px-4 text-right">
                          <div className="text-[11px] text-slate-600 font-medium">
                            {cust.ultimo_acceso ? (
                              new Date(cust.ultimo_acceso).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            ) : (
                              cust.creado_en ? new Date(cust.creado_en).toLocaleDateString('es-ES') : '-'
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Unified Customer Profile Hub Modal (Datos, Historial, Pagos) */}
      <CustomerDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        customer={selectedCustomer}
        orders={orders}
        products={products}
        branches={branches}
        priceLists={priceLists}
        company={company}
        onSaveCustomer={onSaveCustomer}
        onDeleteCustomer={onDeleteCustomer}
        onOpenOrderEditor={handleOpenOrderEditor}
        onUpdateOrder={onUpdateOrder}
      />

      {/* Specific Order Editor Modal */}
      <CustomerOrdersAdminModal
        isOpen={isOrderEditModalOpen}
        onClose={() => {
          setIsOrderEditModalOpen(false);
          setOrderToEdit(null);
        }}
        customer={selectedCustomer}
        orders={orders}
        initialOrder={orderToEdit}
        products={products}
        company={company}
        onUpdateOrder={onUpdateOrder}
        onDeleteOrder={onDeleteOrder}
      />
    </div>
  );
};
