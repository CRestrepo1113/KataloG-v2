'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  AccessStatus,
  Customer,
  CustomerOrder,
  CartItem,
  CompanyInfo,
  PriceList,
  Product,
} from '@/lib/types';
import {
  fetchCustomerOrders,
  getSharedProductImage,
  submitUpgradeAccessRequest,
} from '@/lib/firestore';
import { resolveResellerPrice } from '@/lib/pricing';
import { formatCurrency } from '@/lib/theme';
import { useModalHistory } from '@/lib/useModalHistory';
import { downloadOrderPdf } from '@/lib/pdfExport';
import {
  ShoppingBag,
  Package,
  Clock,
  CheckCircle2,
  RefreshCw,
  X,
  Image as ImageIcon,
  ChevronRight,
  LogOut,
  ShoppingCart,
  User,
  Download,
  Briefcase,
  ShieldCheck,
  Store,
  MessageCircle,
  Sparkles,
  Check,
} from 'lucide-react';
import { isAuthorizedAdminEmail, canUseWhiteLabel } from '@/lib/auth';

interface CustomerOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
  accessStatus: AccessStatus | 'visitante';
  company: CompanyInfo;
  allBranchPriceLists?: PriceList[];
  onRepeatOrder: (items: CartItem[]) => void;
  onLogoutCustomer: () => void;
  catalogProducts?: Product[];
}

export const CustomerOrdersModal: React.FC<CustomerOrdersModalProps> = ({
  isOpen,
  onClose,
  customer,
  accessStatus,
  company,
  allBranchPriceLists = [],
  onRepeatOrder,
  onLogoutCustomer,
  catalogProducts = [],
}) => {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);

  // Upgrade / additional price list request state
  const [showUpgradeBox, setShowUpgradeBox] = useState(false);
  const [reqPerfil, setReqPerfil] = useState<'cliente' | 'emprendedor'>(
    customer.rol === 'emprendedor' ? 'emprendedor' : 'cliente'
  );
  const [reqLists, setReqLists] = useState<string[]>([]);
  const [reqNote, setReqNote] = useState('');
  const [sendingUpgrade, setSendingUpgrade] = useState(false);
  const [upgradeSent, setUpgradeSent] = useState(false);

  const isCustomerAdmin = Boolean(
    customer &&
      accessStatus === 'aprobado' &&
      (customer.rol === 'admin' ||
        customer.rol === 'superadmin' ||
        isAuthorizedAdminEmail(customer.email))
  );

  const hasWhiteLabel = canUseWhiteLabel(customer);
  const isApproved = accessStatus === 'aprobado';

  useModalHistory(Boolean(selectedOrder), () => setSelectedOrder(null), 'customerOrderDetailModal');

  useEffect(() => {
    if (isOpen && customer) {
      setShowUpgradeBox(false);
      setUpgradeSent(false);
      setReqLists(customer.allowedPriceLists || []);
      if (isApproved) {
        setLoading(true);
        fetchCustomerOrders(customer)
          .then((res) => setOrders(res))
          .finally(() => setLoading(false));
      } else {
        setOrders([]);
        setLoading(false);
      }
    }
  }, [isOpen, customer, isApproved]);

  if (!isOpen) return null;

  const cleanWaPhone = (company.phone || '').replace(/[^0-9]/g, '');
  const salesWhatsappUrl = cleanWaPhone
    ? `https://api.whatsapp.com/send/?phone=${cleanWaPhone}&text=${encodeURIComponent(
        `¡Hola! Soy ${customer.nombre} (${customer.email || ''}) y solicito activación de precios en ${company.name}.`
      )}`
    : '';

  const getStatusBadge = (estado: string) => {
    switch (estado?.toLowerCase()) {
      case 'pendiente':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-300 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
            <Clock className="w-3 h-3 text-amber-600" />
            Pendiente
          </span>
        );
      case 'proceso':
      case 'bodega':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-800 border border-blue-300 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
            <Package className="w-3 h-3 text-blue-600" />
            En Proceso
          </span>
        );
      case 'empacado':
      case 'empaque':
      case 'despacho':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-800 border border-purple-300 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
            <Package className="w-3 h-3 text-purple-600" />
            Empacado
          </span>
        );
      case 'entrega':
      case 'entregado':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-300 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Entregado
          </span>
        );
      case 'cancelado':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-800 border border-rose-300 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
            <X className="w-3 h-3 text-rose-600" />
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold">
            Pendiente
          </span>
        );
    }
  };

  const handleRepeatOrderClick = (order: CustomerOrder) => {
    const restoredItems: CartItem[] = order.items.map((item) => {
      const matchInCatalog = catalogProducts.find(
        (p) => p.sku.toUpperCase() === item.referencia.toUpperCase()
      );
      const productObj: Product = matchInCatalog || {
        id: `legacy-${item.referencia}`,
        sku: item.referencia,
        name: item.descripcion,
        category: 'Peluches',
        stock: 999,
        size: item.medida,
        status: 'active',
        prices: {
          unit: item.precio_unitario,
          dozen: item.precio_unitario,
          wholesale: item.precio_unitario,
        },
        processedImageUrl: item.imagen_url || getSharedProductImage(item.referencia, '') || '',
        tags: [],
      };
      return { product: productObj, quantity: item.cantidad, comment: item.comentario };
    });
    onRepeatOrder(restoredItems);
    onClose();
  };

  const handleDownloadWhiteLabelOrderPdf = async (order: CustomerOrder) => {
    const cfg = customer.resellerConfig || { defaultMarkupPercent: 30, roundingStep: 0 };
    const resellerItems = order.items.map((it) => {
      const matched = catalogProducts.find((p) => p.sku.toUpperCase() === it.referencia.toUpperCase());
      const unitSale = resolveResellerPrice(
        it.precio_unitario,
        matched || { id: it.referencia, sku: it.referencia },
        cfg
      );
      return {
        ...it,
        precio_unitario: unitSale,
        subtotal: unitSale * it.cantidad,
      };
    });
    const newTotal = resellerItems.reduce((s, it) => s + it.subtotal, 0);
    const resellerOrder: CustomerOrder = {
      ...order,
      items: resellerItems,
      total_factura: newTotal,
      descuento_total: 0,
      descuento_general: 0,
    };

    await downloadOrderPdf({
      order: resellerOrder,
      company,
      isAdmin: false,
      whiteLabel: true,
      documentTitle: 'COMPROBANTE DE PEDIDO',
    });
  };

  const handleSendUpgradeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingUpgrade(true);
    try {
      await submitUpgradeAccessRequest(customer, {
        tipo_solicitud: reqPerfil === 'emprendedor' && customer.rol !== 'emprendedor' ? 'cambio_perfil' : 'ampliar_listas',
        perfil_solicitado: reqPerfil,
        listas_solicitadas: reqLists,
        mensaje: reqNote,
      });
      setUpgradeSent(true);
      setShowUpgradeBox(false);
    } finally {
      setSendingUpgrade(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[88dvh]">
        {/* Header */}
        <div className="bg-[#3C5866] text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5 text-[#FFF3CD]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-extrabold text-base text-white">Mi Cuenta</h3>
                {isCustomerAdmin ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" />
                    Admin
                  </span>
                ) : customer.rol === 'vendedor' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black bg-emerald-400 text-slate-950 px-2 py-0.5 rounded-full">
                    <Briefcase className="w-3 h-3" />
                    Vendedor
                  </span>
                ) : customer.rol === 'emprendedor' ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black bg-[#FFF3CD] text-[#3C5866] px-2 py-0.5 rounded-full">
                    <Store className="w-3 h-3 text-[#C37D41]" />
                    Emprendedor
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-white/20 text-[#FFF3CD] px-2 py-0.5 rounded-full">
                    <User className="w-3 h-3" />
                    Cliente
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-200 truncate">
                {customer.nombre}{customer.negocio ? ` • ${customer.negocio}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                onLogoutCustomer();
                onClose();
              }}
              className="text-slate-300 hover:text-rose-300 p-2 rounded-xl hover:bg-white/10 cursor-pointer text-xs font-bold flex items-center gap-1"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Salir</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-300 hover:text-white p-2 rounded-full hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {isCustomerAdmin && (
            <div className="bg-slate-900 text-white p-3.5 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0" />
                <span className="font-extrabold text-xs truncate">Panel Administrativo</span>
              </div>
              <a
                href="/admin/inventory"
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black px-3.5 py-1.5 rounded-xl text-xs shrink-0"
              >
                Abrir Panel
              </a>
            </div>
          )}

          {/* Estado Pendiente o Rechazado */}
          {!isApproved ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center space-y-3">
              <Clock className="w-10 h-10 mx-auto text-[#C37D41]" />
              <h4 className="text-sm font-black text-[#3C5866]">
                {accessStatus === 'pendiente' ? 'Solicitud en Revisión' : 'Acceso Restringido'}
              </h4>
              <p className="text-xs text-slate-600 font-medium">
                {accessStatus === 'pendiente'
                  ? 'Nuestro equipo de ventas te contactará pronto para activar tus precios y pedidos.'
                  : 'Comunícate con ventas para revisar el estado de tu cuenta.'}
              </p>
              {salesWhatsappUrl && (
                <a
                  href={salesWhatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Contactar Ventas</span>
                </a>
              )}
            </div>
          ) : (
            <>
              {/* Opción de solicitar más listas o cambio a Emprendedor */}
              {(customer.rol === 'cliente' || customer.rol === 'emprendedor') && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#3C5866] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-[#C37D41]" />
                      {upgradeSent ? 'Solicitud enviada a Ventas' : 'Tarifas y Perfil'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowUpgradeBox((p) => !p)}
                      className="text-xs font-extrabold text-[#C37D41] hover:underline cursor-pointer"
                    >
                      {showUpgradeBox ? 'Cerrar' : 'Solicitar Ampliación'}
                    </button>
                  </div>

                  {showUpgradeBox && (
                    <form onSubmit={handleSendUpgradeRequest} className="space-y-2.5 pt-2 border-t border-slate-200/80">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setReqPerfil('cliente')}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                            reqPerfil === 'cliente' ? 'bg-[#3C5866] text-white border-[#3C5866]' : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Cliente
                        </button>
                        <button
                          type="button"
                          onClick={() => setReqPerfil('emprendedor')}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border cursor-pointer ${
                            reqPerfil === 'emprendedor' ? 'bg-[#3C5866] text-white border-[#3C5866]' : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Emprendedor
                        </button>
                      </div>

                      {allBranchPriceLists.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {allBranchPriceLists.map((l) => {
                            const active = reqLists.includes(l.id);
                            return (
                              <button
                                key={l.id}
                                type="button"
                                onClick={() =>
                                  setReqLists((prev) =>
                                    prev.includes(l.id) ? prev.filter((id) => id !== l.id) : [...prev, l.id]
                                  )
                                }
                                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border flex items-center gap-1 cursor-pointer ${
                                  active ? 'bg-amber-50 text-[#C37D41] border-amber-300' : 'bg-white text-slate-600 border-slate-200'
                                }`}
                              >
                                {active && <Check className="w-3 h-3" />}
                                {l.name}
                              </button>
                            );
                          })}
                        </div>
                      )}

                      <input
                        type="text"
                        value={reqNote}
                        onChange={(e) => setReqNote(e.target.value)}
                        placeholder="Nota opcional para ventas..."
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                      />

                      <button
                        type="submit"
                        disabled={sendingUpgrade}
                        className="w-full py-2 bg-[#3C5866] text-white font-extrabold text-xs rounded-xl cursor-pointer"
                      >
                        {sendingUpgrade ? 'Enviando...' : 'Enviar Petición'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {selectedOrder ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="text-xs font-bold text-[#3C5866] hover:text-[#C37D41] cursor-pointer"
                  >
                    ← Volver
                  </button>

                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                      <div>
                        <span className="text-[11px] font-black text-[#C37D41] uppercase">#{selectedOrder.id}</span>
                        <h4 className="text-sm font-bold text-slate-800">
                          {selectedOrder.cliente_nombre} • {new Date(selectedOrder.creado_en).toLocaleDateString()}
                        </h4>
                      </div>
                      {getStatusBadge(selectedOrder.estado)}
                    </div>

                    <div className="bg-white p-3 rounded-xl border border-slate-200 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Total</span>
                        <span className="font-black text-slate-900 text-sm">
                          {formatCurrency(selectedOrder.total_factura, company.currencySymbol || '$')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Abonado</span>
                        <span className="font-bold text-emerald-700 text-xs">
                          {formatCurrency(selectedOrder.monto_abonado || 0, company.currencySymbol || '$')}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Saldo</span>
                        <span className="font-black text-xs text-slate-700">
                          {selectedOrder.estado === 'pendiente'
                            ? 'Por confirmar'
                            : formatCurrency(
                                selectedOrder.saldo ?? (selectedOrder.total_factura - (selectedOrder.monto_abonado || 0)),
                                company.currencySymbol || '$'
                              )}
                        </span>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-200/60 bg-white rounded-xl border border-slate-200/70 p-2 max-h-56 overflow-y-auto">
                      {selectedOrder.items.map((it, idx) => {
                        const itemImg =
                          (it.imagen_url && !it.imagen_url.includes('REF_1.jpg') ? it.imagen_url : '') ||
                          catalogProducts.find((p) => p.sku === it.referencia)?.processedImageUrl ||
                          getSharedProductImage(it.referencia, '');
                        return (
                          <div key={idx} className="py-2 flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="relative w-10 h-10 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                                {itemImg ? (
                                  <Image src={itemImg} alt={it.descripcion} fill className="object-contain" />
                                ) : (
                                  <ImageIcon className="w-4 h-4 text-slate-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="font-extrabold text-[#C37D41] text-[10px] block">{it.referencia}</span>
                                <span className="font-bold text-slate-800 truncate block">{it.descripcion}</span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-black text-slate-800 block">
                                {it.cantidad} × {formatCurrency(it.precio_unitario, company.currencySymbol || '$')}
                              </span>
                              <span className="text-[11px] font-extrabold text-[#3C5866]">
                                {formatCurrency(it.subtotal, company.currencySymbol || '$')}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
                      <button
                        type="button"
                        onClick={() => downloadOrderPdf({ order: selectedOrder, company, isAdmin: false })}
                        className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl flex items-center gap-1.5 border border-slate-300 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-[#3C5866]" />
                        <span>{hasWhiteLabel ? 'PDF KYG (Costo)' : 'Descargar PDF'}</span>
                      </button>

                      {hasWhiteLabel && (
                        <button
                          type="button"
                          onClick={() => handleDownloadWhiteLabelOrderPdf(selectedOrder)}
                          className="py-2 px-3 bg-[#3C5866] hover:bg-[#263842] text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-[#FFF3CD]" />
                          <span>PDF Cliente</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRepeatOrderClick(selectedOrder)}
                        className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Repetir</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : loading ? (
                <div className="text-center py-12 text-slate-400">
                  <RefreshCw className="w-7 h-7 mx-auto animate-spin text-[#3C5866]" />
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-10 text-slate-400 space-y-2">
                  <Package className="w-10 h-10 mx-auto text-slate-300 stroke-1" />
                  <p className="text-xs font-bold text-slate-600">Sin pedidos registrados</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {orders.map((ord) => (
                    <div
                      key={ord.id}
                      onClick={() => setSelectedOrder(ord)}
                      className="p-3.5 bg-slate-50 hover:bg-amber-50/50 border border-slate-200/80 rounded-2xl transition-all cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
                          <ShoppingCart className="w-5 h-5 text-[#3C5866]" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-black text-[#3C5866]">#{ord.id}</span>
                            <span className="text-[11px] text-slate-400">
                              {new Date(ord.creado_en).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 font-medium truncate">
                            {ord.cliente_nombre} •{' '}
                            <strong className="text-slate-900">
                              {formatCurrency(ord.total_factura, company.currencySymbol || '$')}
                            </strong>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {getStatusBadge(ord.estado)}
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
