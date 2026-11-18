'use client';

import React, { useState, useMemo } from 'react';
import { CustomerOrder, OrderStatus, Product, CompanyInfo, Customer } from '@/lib/types';
import {
  Search,
  Package,
  Calendar,
  DollarSign,
  Clock,
  Truck,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Edit2,
  Trash2,
  CreditCard,
  MessageCircle,
  Scale,
  Plus,
  Layers,
  Phone,
  Building,
  Check,
  X,
  FileText,
  FileSpreadsheet,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { CustomerOrdersAdminModal } from './CustomerOrdersAdminModal';
import { OrderPaymentModal } from './OrderPaymentModal';
import { downloadOrderExcel } from '@/lib/excelExport';

interface OrdersTableProps {
  orders: CustomerOrder[];
  products: Product[];
  customers: Customer[];
  company: CompanyInfo;
  currentBranchSlug: string;
  onUpdateOrder: (orderId: string, updatedOrder: Partial<CustomerOrder>) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
  onDeductStock: (order: CustomerOrder) => Promise<void>;
  onRestoreStock: (order: CustomerOrder) => Promise<void>;
  onRefreshOrders?: () => Promise<void> | void;
  isSyncing?: boolean;
}

export const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
  products,
  customers,
  company,
  currentBranchSlug,
  onUpdateOrder,
  onDeleteOrder,
  onDeductStock,
  onRestoreStock,
  onRefreshOrders,
  isSyncing,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [selectedOrderForEdit, setSelectedOrderForEdit] = useState<CustomerOrder | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<CustomerOrder | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  // Counts and metrics
  const pendingOrdersCount = useMemo(() => {
    return orders.filter((o) => o.estado === 'pendiente').length;
  }, [orders]);

  const inProcessCount = useMemo(() => {
    return orders.filter((o) => o.estado === 'proceso' || o.estado === 'bodega').length;
  }, [orders]);

  const packedOrdersCount = useMemo(() => {
    return orders.filter((o) => o.estado === 'empacado' || o.estado === 'empaque' || o.estado === 'despacho').length;
  }, [orders]);

  const deliveredCount = useMemo(() => {
    return orders.filter((o) => o.estado === 'entregado' || o.estado === 'entrega').length;
  }, [orders]);

  const totalInvoiced = useMemo(() => {
    return orders.reduce((sum, o) => sum + (o.total_factura || 0), 0);
  }, [orders]);

  const totalIngresos = useMemo(() => {
    return orders.reduce((sum, o) => sum + (o.monto_abonado || 0), 0);
  }, [orders]);

  const totalPendingBalance = useMemo(() => {
    return orders.reduce((sum, o) => {
      if (o.estado === 'pendiente' || o.estado === 'cancelado') return sum;
      const s = o.saldo !== undefined ? o.saldo : Math.max(0, (o.total_factura || 0) - (o.monto_abonado || 0));
      return sum + s;
    }, 0);
  }, [orders]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (statusFilter !== 'all') {
      result = result.filter((o) => {
        if (statusFilter === 'proceso') {
          return o.estado === 'proceso' || o.estado === 'bodega';
        }
        if (statusFilter === 'empacado') {
          return o.estado === 'empacado' || o.estado === 'empaque' || o.estado === 'despacho';
        }
        if (statusFilter === 'entregado') {
          return o.estado === 'entregado' || o.estado === 'entrega';
        }
        return o.estado === statusFilter;
      });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter((o) => {
        return (
          o.id.toLowerCase().includes(q) ||
          (o.numero_factura && o.numero_factura.toLowerCase().includes(q)) ||
          o.cliente_nombre.toLowerCase().includes(q) ||
          (o.negocio && o.negocio.toLowerCase().includes(q)) ||
          (o.cliente_tienda && o.cliente_tienda.toLowerCase().includes(q)) ||
          (o.cliente_telefono && o.cliente_telefono.toLowerCase().includes(q)) ||
          (o.sucursal && o.sucursal.toLowerCase().includes(q)) ||
          (o.pais && o.pais.toLowerCase().includes(q))
        );
      });
    }

    return result;
  }, [orders, statusFilter, searchTerm]);

  // Handle status change with smart stock lifecycle
  const handleStatusChange = async (order: CustomerOrder, newStatus: OrderStatus) => {
    const prevStatus = order.estado;
    if (prevStatus === newStatus) return;

    // Moving TO active status from 'pendiente' or 'cancelado':
    const isNowActive = newStatus === 'proceso' || newStatus === 'bodega' || newStatus === 'empacado' || newStatus === 'empaque' || newStatus === 'despacho' || newStatus === 'entregado' || newStatus === 'entrega';
    const wasInactive = prevStatus === 'pendiente' || prevStatus === 'cancelado';

    // Moving TO 'cancelado' or 'pendiente' from active:
    const isNowInactive = newStatus === 'cancelado' || newStatus === 'pendiente';
    const wasActive = prevStatus === 'proceso' || prevStatus === 'bodega' || prevStatus === 'empacado' || prevStatus === 'empaque' || prevStatus === 'despacho' || prevStatus === 'entregado' || prevStatus === 'entrega';

    if (isNowActive && !order.stock_descontado) {
      // Deduct stock
      await onDeductStock({ ...order, estado: newStatus });
    } else if (isNowInactive && order.stock_descontado) {
      // Restore stock
      await onRestoreStock({ ...order, estado: newStatus });
    } else {
      await onUpdateOrder(order.id, { estado: newStatus });
    }
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'pendiente':
        return {
          label: 'PENDIENTE',
          textColor: 'text-amber-800',
          borderColor: 'border-amber-300',
          focusRing: 'focus:ring-amber-400',
          dot: 'bg-amber-500',
        };
      case 'proceso':
      case 'bodega':
        return {
          label: 'EN PROCESO',
          textColor: 'text-blue-800',
          borderColor: 'border-blue-300',
          focusRing: 'focus:ring-blue-400',
          dot: 'bg-blue-600',
        };
      case 'empacado':
      case 'empaque':
      case 'despacho':
        return {
          label: 'EMPACADO',
          textColor: 'text-purple-800',
          borderColor: 'border-purple-300',
          focusRing: 'focus:ring-purple-400',
          dot: 'bg-purple-600',
        };
      case 'entregado':
      case 'entrega':
        return {
          label: 'ENTREGADO',
          textColor: 'text-emerald-800',
          borderColor: 'border-emerald-300',
          focusRing: 'focus:ring-emerald-400',
          dot: 'bg-emerald-600',
        };
      case 'cancelado':
        return {
          label: 'CANCELADO',
          textColor: 'text-rose-800',
          borderColor: 'border-rose-300',
          focusRing: 'focus:ring-rose-400',
          dot: 'bg-rose-600',
        };
      default:
        return {
          label: 'PENDIENTE',
          textColor: 'text-slate-800',
          borderColor: 'border-slate-300',
          focusRing: 'focus:ring-slate-400',
          dot: 'bg-slate-500',
        };
    }
  };

  const getPaymentBadge = (status?: string, saldo?: number, total?: number) => {
    const pStatus = status || (saldo === 0 && (total || 0) > 0 ? 'pagado' : (saldo || 0) < (total || 0) && (saldo || 0) > 0 ? 'parcial' : 'pendiente');
    switch (pStatus) {
      case 'pagado':
        return { label: 'Pagado', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'parcial':
        return { label: 'Abono Parcial', bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'pendiente':
      default:
        return { label: 'Pendiente Pago', bg: 'bg-amber-50 text-amber-800 border-amber-200' };
    }
  };

  const handleOpenEdit = (order: CustomerOrder) => {
    setSelectedOrderForEdit(order);
    setIsEditModalOpen(true);
  };

  const handleOpenPayment = (order: CustomerOrder) => {
    setSelectedOrderForPayment(order);
    setIsPaymentModalOpen(true);
  };

  const handleDelete = async (order: CustomerOrder) => {
    if (!confirm(`¿Estás seguro de eliminar el pedido ${order.id}?`)) return;
    if (order.stock_descontado) {
      if (confirm('Este pedido ya había descontado stock del inventario. ¿Deseas restaurar las unidades al inventario antes de borrarlo?')) {
        await onRestoreStock(order);
      }
    }
    await onDeleteOrder(order.id);
  };

  return (
    <div className="space-y-4">
      {/* Metric Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10.5px] font-bold text-slate-400 uppercase block">Pendientes</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-black text-slate-900">{pendingOrdersCount}</span>
              {pendingOrdersCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              )}
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10.5px] font-bold text-slate-400 uppercase block">En Proceso</span>
            <span className="text-xl font-black text-slate-900">{inProcessCount}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10.5px] font-bold text-slate-400 uppercase block">Entregados</span>
            <span className="text-xl font-black text-slate-900">{deliveredCount}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10.5px] font-bold text-slate-400 uppercase block">Ingresos Totales</span>
            <span className="text-base font-black text-emerald-700">
              {company.currencySymbol || '$'} {totalIngresos.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10.5px] font-bold text-slate-400 uppercase block">Saldo por Cobrar</span>
            <span className="text-base font-black text-rose-600">
              {company.currencySymbol || '$'} {totalPendingBalance.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Status Filters Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3.5">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por folio, cliente, tienda o teléfono..."
            className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
          />
        </div>

        <div className="w-full md:w-auto flex flex-wrap items-center justify-between sm:justify-end gap-2">
          {onRefreshOrders && (
            <button
              type="button"
              onClick={() => onRefreshOrders()}
              disabled={isSyncing}
              className="shrink-0 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
              title="Sincronizar pedidos con la nube y verificar órdenes pendientes"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#3C5866] ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Actualizar'}</span>
            </button>
          )}

          {/* Quick Filter Status Badges */}
          <div className="flex items-center p-1 bg-slate-100/90 rounded-2xl gap-1 text-xs overflow-x-auto scrollbar-none no-scrollbar touch-pan-x">
            <button
              onClick={() => setStatusFilter('all')}
              className={`shrink-0 px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'all' ? 'bg-white text-[#3C5866] shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Todos ({orders.length})
            </button>
            <button
              onClick={() => setStatusFilter('pendiente')}
              className={`shrink-0 px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'pendiente' ? 'bg-white text-amber-800 shadow-2xs' : 'text-slate-500 hover:text-amber-700'
              }`}
            >
              Pendientes ({pendingOrdersCount})
            </button>
            <button
              onClick={() => setStatusFilter('proceso')}
              className={`shrink-0 px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'proceso' ? 'bg-white text-blue-800 shadow-2xs' : 'text-slate-500 hover:text-blue-700'
              }`}
            >
              Procesos ({inProcessCount})
            </button>
            <button
              onClick={() => setStatusFilter('empacado')}
              className={`shrink-0 px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'empacado' ? 'bg-white text-purple-800 shadow-2xs' : 'text-slate-500 hover:text-purple-700'
              }`}
            >
              Empacados ({packedOrdersCount})
            </button>
            <button
              onClick={() => setStatusFilter('entregado')}
              className={`shrink-0 px-3 py-1.5 rounded-xl font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'entregado' ? 'bg-white text-emerald-800 shadow-2xs' : 'text-slate-500 hover:text-emerald-700'
              }`}
            >
              Entregados ({deliveredCount})
            </button>
          </div>
        </div>
      </div>

      {/* Orders Table Container: Cards en Móvil y Tabla en Desktop */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Mobile View: Cards de Pedidos */}
        <div className="md:hidden divide-y divide-slate-100 p-2.5 space-y-3">
          {filteredOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-semibold">
              <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
              No se encontraron pedidos con los filtros seleccionados.
            </div>
          ) : (
            filteredOrders.map((order) => {
              const statusBadge = getStatusBadge(order.estado);
              const totalUnits = order.items?.reduce((s, i) => s + i.cantidad, 0) || 0;
              const totalFactura = order.total_factura || 0;
              const saldo = order.saldo !== undefined ? order.saldo : Math.max(0, totalFactura - (order.monto_abonado || 0));
              const paymentBadge = getPaymentBadge(order.estado_pago, saldo, totalFactura);
              const cleanPhone = order.cliente_telefono ? order.cliente_telefono.replace(/[^\d+]/g, '') : '';
              const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.replace('+', '')}` : null;

              return (
                <div
                  key={order.id}
                  onClick={() => handleOpenEdit(order)}
                  className="bg-slate-50/70 hover:bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 transition-all cursor-pointer space-y-3 active:scale-[0.99]"
                >
                  {/* Top: Folio, Fecha, Tipo, Factura y Estado */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-black text-sm text-[#3C5866]">#{order.id}</span>
                        <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.2 rounded border border-emerald-200">
                          PEDIDO
                        </span>
                        {order.facturado ? (
                          <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-black px-1.5 py-0.2 rounded inline-flex items-center gap-1" title="Factura oficial emitida">
                            🧾 Factura: #{order.numero_factura || 'S/N'}
                          </span>
                        ) : (
                          <span className="bg-slate-100 text-slate-400 border border-slate-200 text-[8.5px] font-semibold px-1 py-0.2 rounded">
                            Sin facturar
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium mt-0.5">
                        <Calendar className="w-3 h-3" />
                        {new Date(order.creado_en).toLocaleString('es-ES', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Estado Selector */}
                    <div onClick={(e) => e.stopPropagation()} className="relative inline-flex items-center">
                      <span className={`absolute left-2.5 w-2 h-2 rounded-full pointer-events-none ${statusBadge.dot}`} />
                      <select
                        value={order.estado}
                        onChange={(e) => handleStatusChange(order, e.target.value as OrderStatus)}
                        className={`pl-6 pr-6 py-1 text-[11px] font-black rounded-xl border bg-white ${statusBadge.textColor} ${statusBadge.borderColor} ${statusBadge.focusRing} focus:outline-none focus:ring-2 cursor-pointer shadow-2xs appearance-none`}
                      >
                        <option value="pendiente">PENDIENTE</option>
                        <option value="proceso">EN PROCESO</option>
                        <option value="empacado">EMPACADO</option>
                        <option value="entregado">ENTREGADO</option>
                        <option value="cancelado">CANCELADO</option>
                      </select>
                      <ChevronDown className="w-3 h-3 absolute right-1.5 text-slate-400 pointer-events-none" />
                    </div>
                  </div>

                  {/* Cliente & Negocio */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <div className="min-w-0">
                      <p className="font-extrabold text-xs text-slate-900 truncate">{order.cliente_nombre}</p>
                      {order.negocio || order.cliente_tienda ? (
                        <p className="text-[11px] text-[#3C5866] font-semibold flex items-center gap-1 truncate">
                          <Building className="w-3 h-3 text-slate-400 shrink-0" />
                          {order.negocio || order.cliente_tienda}
                        </p>
                      ) : null}
                    </div>

                    {waUrl && (
                      <div onClick={(e) => e.stopPropagation()}>
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-xl border border-emerald-200 transition-colors"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Resumen Financiero y Artículos */}
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200/80 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-bold block">Artículos</span>
                      <span className="font-black text-slate-800">
                        {totalUnits} ud. ({order.items?.length || 0} ref.)
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-bold block">Total Factura</span>
                      <div className="flex items-center gap-1.5 justify-end">
                        <span className="font-black text-sm text-[#3C5866]">
                          {company.currencySymbol || '$'} {totalFactura.toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        <span className={`text-[9.5px] font-black px-1.5 py-0.2 rounded border ${paymentBadge.bg}`}>
                          {paymentBadge.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Botones de acción rápida */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPayment(order);
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <CreditCard className="w-3 h-3 text-[#3C5866]" />
                      <span>{order.estado_pago === 'pagado' ? 'Ver Pago' : 'Registrar Pago'}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadOrderExcel({ order, company, isAdmin: true });
                        }}
                        className="px-2 py-1 text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl text-emerald-800 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Descargar Excel"
                      >
                        <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                        <span>Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(order);
                        }}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer"
                        title="Eliminar este pedido"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="flex items-center gap-0.5 text-xs font-black text-[#3C5866]">
                        <span>Editar</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop View: Tabla Completa */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-extrabold text-slate-700 uppercase tracking-wider">
                <th className="py-3.5 px-4">Folio / Fecha</th>
                <th className="py-3.5 px-3">Cliente / Negocio</th>
                <th className="py-3.5 px-3">Artículos / Ref.</th>
                <th className="py-3.5 px-3 text-right">Total & Pagos</th>
                <th className="py-3.5 px-3 text-center">Estado</th>
                <th className="py-3.5 px-4 text-right">Fecha Promesa Pago</th>
                <th className="py-3.5 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400 font-semibold">
                    <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    No se encontraron pedidos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const statusBadge = getStatusBadge(order.estado);
                  const totalUnits = order.items?.reduce((s, i) => s + i.cantidad, 0) || 0;
                  const totalFactura = order.total_factura || 0;
                  const saldo = order.saldo !== undefined ? order.saldo : Math.max(0, totalFactura - (order.monto_abonado || 0));
                  const paymentBadge = getPaymentBadge(order.estado_pago, saldo, totalFactura);

                  const cleanPhone = order.cliente_telefono ? order.cliente_telefono.replace(/[^\d+]/g, '') : '';
                  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.replace('+', '')}` : null;

                  return (
                    <tr
                      key={order.id}
                      onClick={() => handleOpenEdit(order)}
                      className="hover:bg-slate-50/90 transition-colors group cursor-pointer"
                      title="Clic para ver y editar el pedido completo"
                    >
                      {/* Folio / Fecha */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-extrabold text-sm text-[#3C5866] group-hover:text-[#C37D41] transition-colors block">
                              #{order.id}
                            </span>
                            {order.facturado ? (
                              <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[9.5px] font-black px-1.5 py-0.5 rounded inline-flex items-center gap-0.5" title={`Factura oficial: #${order.numero_factura || 'S/N'}`}>
                                🧾 #{order.numero_factura || 'S/N'}
                              </span>
                            ) : (
                              <span className="bg-slate-50 text-slate-400 border border-slate-200 text-[8.5px] font-medium px-1 py-0.2 rounded">
                                Sin facturar
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                            <Calendar className="w-3 h-3" />
                            {new Date(order.creado_en).toLocaleString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>

                      {/* Cliente / Negocio */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          <span className="font-bold text-slate-900 block text-xs">
                            {order.cliente_nombre}
                          </span>
                          {order.negocio || order.cliente_tienda ? (
                            <span className="text-[10.5px] text-[#3C5866] font-semibold flex items-center gap-1">
                              <Building className="w-3 h-3 text-slate-400" />
                              {order.negocio || order.cliente_tienda}
                            </span>
                          ) : null}

                          {order.cliente_telefono && (
                            <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                              {waUrl ? (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10.5px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-200 transition-colors"
                                  title="Abrir WhatsApp"
                                >
                                  <MessageCircle className="w-3 h-3 text-emerald-600" />
                                  <span>{order.cliente_telefono}</span>
                                </a>
                              ) : (
                                <span className="text-[10.5px] text-slate-500 font-medium">
                                  {order.cliente_telefono}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Artículos / Ref. */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          <span className="font-extrabold text-slate-900 text-xs block">
                            {totalUnits} {totalUnits === 1 ? 'artículo' : 'artículos'}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium block">
                            {order.items?.length || 0} {(order.items?.length || 0) === 1 ? 'referencia solicitada' : 'referencias solicitadas'}
                          </span>
                        </div>
                      </td>

                      {/* Total & Pagos */}
                      <td className="py-3 px-3 text-right">
                        <div className="space-y-0.5">
                          <span className="font-black text-sm text-slate-900 block">
                            {company.currencySymbol || '$'} {totalFactura.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className={`inline-block text-[9.5px] font-extrabold px-1.5 py-0.2 rounded border ${paymentBadge.bg}`}>
                            {paymentBadge.label}
                          </span>
                          {order.estado === 'pendiente' ? (
                            <span className="text-[10px] text-amber-700 font-bold block" title="El saldo pendiente se reflejará cuando el pedido ingrese a producción">
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
                      </td>

                      {/* Estado */}
                      <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-flex items-center">
                          <span className={`absolute left-3 w-2 h-2 rounded-full pointer-events-none ${statusBadge.dot}`} />
                          <select
                            value={order.estado}
                            onChange={(e) => handleStatusChange(order, e.target.value as OrderStatus)}
                            className={`pl-7 pr-8 py-1.5 text-xs font-black rounded-xl border bg-white ${statusBadge.textColor} ${statusBadge.borderColor} ${statusBadge.focusRing} focus:outline-none focus:ring-2 cursor-pointer shadow-2xs hover:bg-slate-50 transition-all appearance-none`}
                          >
                            <option value="pendiente" className="text-amber-800 font-bold">PENDIENTE</option>
                            <option value="proceso" className="text-blue-800 font-bold">EN PROCESO</option>
                            <option value="empacado" className="text-purple-800 font-bold">EMPACADO</option>
                            <option value="entregado" className="text-emerald-800 font-bold">ENTREGADO</option>
                            <option value="cancelado" className="text-rose-800 font-bold">CANCELADO</option>
                          </select>
                          <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 text-slate-400 pointer-events-none" />
                        </div>
                      </td>

                      {/* Fecha Promesa Pago */}
                      <td className="py-3 px-4 text-right">
                        {order.fecha_promesa_pago ? (
                          <div className="space-y-0.5">
                            <span className="text-[11px] font-bold text-slate-800 block">
                              {new Date(order.fecha_promesa_pago).toLocaleDateString('es-ES', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            {order.metodo_pago && (
                              <span className="text-[10px] text-slate-400 block">{order.metodo_pago}</span>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenPayment(order);
                            }}
                            className="text-[10.5px] text-[#3C5866] hover:text-[#C37D41] hover:underline font-bold"
                          >
                            + Fijar fecha/abono
                          </button>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => downloadOrderExcel({ order, company, isAdmin: true })}
                            className="p-1.5 text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                            title="Descargar Excel de Producción"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(order)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                            title="Eliminar este pedido permanentemente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Order References Editor Modal */}
      <CustomerOrdersAdminModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedOrderForEdit(null);
        }}
        initialOrder={selectedOrderForEdit}
        customer={null}
        orders={selectedOrderForEdit ? [selectedOrderForEdit] : []}
        products={products}
        company={company}
        onUpdateOrder={onUpdateOrder}
        onDeleteOrder={onDeleteOrder}
      />

      {/* Order Payment & Balance Modal */}
      <OrderPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        order={selectedOrderForPayment}
        company={company}
        onSavePayment={async (orderId, paymentData) => {
          await onUpdateOrder(orderId, paymentData);
        }}
      />
    </div>
  );
};
