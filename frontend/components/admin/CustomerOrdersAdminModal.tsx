'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { Customer, CustomerOrder, OrderItem, Product, CompanyInfo } from '@/lib/types';
import { useModalHistory } from '@/lib/useModalHistory';
import { downloadOrderExcel } from '@/lib/excelExport';
import { downloadOrderPdf } from '@/lib/pdfExport';
import { getBaseSku } from '@/lib/theme';
import { getLocalProducts, getBranchOverride, getSharedProductImage } from '@/lib/firestore';
import { OrderPaymentModal } from './OrderPaymentModal';
import {
  Package,
  Calendar,
  DollarSign,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  Clock,
  Truck,
  Layers,
  Search,
  ChevronRight,
  ArrowLeft,
  Scale,
  FileSpreadsheet,
  FileText,
  CreditCard,
  Wallet,
  MapPin,
  ChevronDown,
  Image as ImageIcon,
} from 'lucide-react';

interface CustomerOrdersAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  orders: CustomerOrder[];
  initialOrder?: CustomerOrder | null;
  products: Product[];
  company: CompanyInfo;
  onUpdateOrder: (orderId: string, updatedOrder: Partial<CustomerOrder>) => Promise<void>;
  onDeleteOrder: (orderId: string) => Promise<void>;
}

export const CustomerOrdersAdminModal: React.FC<CustomerOrdersAdminModalProps> = ({
  isOpen,
  onClose,
  customer,
  orders,
  initialOrder,
  products = [],
  company,
  onUpdateOrder,
  onDeleteOrder,
}) => {
  const [selectedOrder, setSelectedOrder] = useState<CustomerOrder | null>(null);
  const [editedItems, setEditedItems] = useState<OrderItem[]>([]);
  const [editedStatus, setEditedStatus] = useState<CustomerOrder['estado']>('pendiente');
  const editedTipoSolicitud = 'PEDIDO';
  const [editedFacturado, setEditedFacturado] = useState<boolean>(false);
  const [editedNumeroFactura, setEditedNumeroFactura] = useState<string>('');
  const [editedDescuentoGenTipo, setEditedDescuentoGenTipo] = useState<'porcentaje' | 'monto'>('porcentaje');
  const [editedDescuentoGenValor, setEditedDescuentoGenValor] = useState<number>(0);
  const [editedNota, setEditedNota] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Product Picker state
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  useModalHistory(isOpen, onClose, 'adminCustomerOrdersModal');

  // Filter orders for this customer if a customer is selected
  const customerOrders = useMemo(() => {
    if (!customer) return orders;
    return orders.filter(
      (o) =>
        o.cliente_id === customer.id ||
        o.cliente_id === customer.uid ||
        (customer.telefonos && o.cliente_telefono === customer.telefonos)
    );
  }, [customer, orders]);

  // Filtered products for search in product picker (Hook must be top-level)
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 15);
    const q = productSearch.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
      .slice(0, 20);
  }, [products, productSearch]);

  const resolveItemImage = (item: OrderItem): string => {
    if (item.imagen_url && item.imagen_url.trim() && item.imagen_url !== '/assets/REF_1.jpg' && !item.imagen_url.includes('REF_1.jpg')) {
      return item.imagen_url;
    }
    const found = products.find((p) => p.sku === item.referencia);
    if (found?.processedImageUrl && !found.processedImageUrl.includes('REF_1.jpg')) {
      return found.processedImageUrl;
    }
    if (found?.originalImageUrl && !found.originalImageUrl.includes('REF_1.jpg')) {
      return found.originalImageUrl;
    }
    return getSharedProductImage(item.referencia, '');
  };

  useEffect(() => {
    if (isOpen) {
      if (initialOrder) {
        setSelectedOrder(initialOrder);
      } else if (!customer && orders.length === 1) {
        setSelectedOrder(orders[0]);
      } else {
        setSelectedOrder(null);
      }
    } else {
      setSelectedOrder(null);
    }
  }, [isOpen, initialOrder, customer]);

  useEffect(() => {
    if (selectedOrder) {
      const masterProducts = getLocalProducts();
      setEditedItems(
        (selectedOrder.items || []).map((it) => {
          const discountPct = it.descuento_porcentaje || 0;
          const gross = (it.precio_unitario || 0) * (it.cantidad || 1);
          const discountAmt = it.descuento_monto !== undefined ? it.descuento_monto : gross * (discountPct / 100);

          let weight = it.gramos_relleno;
          if (!weight || weight <= 0) {
            const skuTarget = (it.referencia || '').trim().toUpperCase();
            const baseTarget = getBaseSku(skuTarget);
            const prod = masterProducts.find((p) => {
              const pSku = (p.sku || '').trim().toUpperCase();
              return pSku === skuTarget || (baseTarget && getBaseSku(pSku) === baseTarget);
            });
            if (prod) {
              const override = getBranchOverride(prod, selectedOrder.sucursal);
              weight =
                override?.filledWeight !== undefined && override?.filledWeight !== null && Number(override.filledWeight) > 0
                  ? override.filledWeight
                  : prod.filledWeight;
            }
          }

          return {
            ...it,
            gramos_relleno: Number(weight) || 0,
            descuento_porcentaje: discountPct,
            descuento_monto: discountAmt,
            subtotal: it.subtotal !== undefined ? it.subtotal : gross - discountAmt,
          };
        })
      );
      setEditedStatus(selectedOrder.estado || 'pendiente');
      setEditedNota(selectedOrder.nota || '');
      setEditedFacturado(selectedOrder.facturado || false);
      setEditedNumeroFactura(selectedOrder.numero_factura || '');

      if (selectedOrder.descuento_porcentaje_general && selectedOrder.descuento_porcentaje_general > 0) {
        setEditedDescuentoGenTipo('porcentaje');
        setEditedDescuentoGenValor(selectedOrder.descuento_porcentaje_general);
      } else if (selectedOrder.descuento_general && selectedOrder.descuento_general > 0) {
        setEditedDescuentoGenTipo('monto');
        setEditedDescuentoGenValor(selectedOrder.descuento_general);
      } else {
        setEditedDescuentoGenTipo('porcentaje');
        setEditedDescuentoGenValor(0);
      }

      setFeedbackMsg(null);
      setIsAddProductOpen(false);
      setProductSearch('');
    }
  }, [selectedOrder]);

  const handleBackToList = () => {
    if (!customer) {
      onClose();
    } else {
      setSelectedOrder(null);
    }
  };

  // Status visual helpers
  const getStatusBadge = (status: CustomerOrder['estado']) => {
    switch (status) {
      case 'pendiente':
        return { label: 'PENDIENTE', bg: 'bg-amber-100 text-amber-800 border-amber-300', icon: Clock };
      case 'proceso':
      case 'bodega':
        return { label: 'EN PROCESO', bg: 'bg-blue-100 text-blue-800 border-blue-300', icon: Layers };
      case 'empacado':
      case 'empaque':
      case 'despacho':
        return { label: 'EMPACADO', bg: 'bg-purple-100 text-purple-800 border-purple-300', icon: Package };
      case 'entregado':
      case 'entrega':
        return { label: 'ENTREGADO', bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', icon: CheckCircle };
      case 'cancelado':
        return { label: 'CANCELADO', bg: 'bg-rose-100 text-rose-800 border-rose-300', icon: X };
      default:
        return { label: 'PENDIENTE', bg: 'bg-slate-100 text-slate-800 border-slate-300', icon: Clock };
    }
  };


  // Recalculate totals for the currently edited order with memoization
  const {
    calculatedGrossSubtotal,
    calculatedItemDiscounts,
    subtotalAfterItemDiscounts,
    calculatedGeneralDiscount,
    calculatedTotalDiscount,
    calculatedTotal,
    calculatedTotalUnits,
    calculatedTotalGrams,
  } = useMemo(() => {
    const gross = editedItems.reduce((acc, it) => {
      const q = Math.max(1, Math.floor(Number(it.cantidad) || 1));
      const p = Math.max(0, Number(it.precio_unitario) || 0);
      return acc + p * q;
    }, 0);

    const itemsDisc = editedItems.reduce((acc, it) => {
      const q = Math.max(1, Math.floor(Number(it.cantidad) || 1));
      const p = Math.max(0, Number(it.precio_unitario) || 0);
      const lineGross = p * q;
      const pct = Math.max(0, Math.min(100, Number(it.descuento_porcentaje) || 0));
      const lineDiscount = pct > 0 ? lineGross * (pct / 100) : Math.max(0, Number(it.descuento_monto) || 0);
      return acc + lineDiscount;
    }, 0);

    const subtotalAfterItems = Math.max(0, gross - itemsDisc);

    const safeGenVal = Math.max(0, Number(editedDescuentoGenValor) || 0);
    const genDisc =
      editedDescuentoGenTipo === 'porcentaje'
        ? subtotalAfterItems * (Math.min(100, safeGenVal) / 100)
        : Math.min(subtotalAfterItems, safeGenVal);

    const totDisc = itemsDisc + genDisc;
    const tot = Math.max(0, gross - totDisc);

    const totUnits = editedItems.reduce((acc, it) => acc + Math.max(1, Math.floor(Number(it.cantidad) || 1)), 0);
    const totGrams = editedItems.reduce((acc, it) => {
      const q = Math.max(1, Math.floor(Number(it.cantidad) || 1));
      const w = Math.max(0, Number(it.gramos_relleno) || 0);
      return acc + w * q;
    }, 0);

    return {
      calculatedGrossSubtotal: gross,
      calculatedItemDiscounts: itemsDisc,
      subtotalAfterItemDiscounts: subtotalAfterItems,
      calculatedGeneralDiscount: genDisc,
      calculatedTotalDiscount: totDisc,
      calculatedTotal: tot,
      calculatedTotalUnits: totUnits,
      calculatedTotalGrams: totGrams,
    };
  }, [editedItems, editedDescuentoGenTipo, editedDescuentoGenValor]);

  const handleQuantityChange = (idx: number, newQty: number) => {
    const safeQty = Math.max(1, Math.min(999999, Math.floor(Number(newQty) || 1)));
    setEditedItems((prev) => {
      const copy = [...prev];
      const it = { ...copy[idx] };
      it.cantidad = safeQty;
      const lineGross = (it.precio_unitario || 0) * safeQty;
      const discountPct = Math.max(0, Math.min(100, Number(it.descuento_porcentaje) || 0));
      const discountAmount = lineGross * (discountPct / 100);
      it.descuento_monto = discountAmount;
      it.subtotal = lineGross - discountAmount;
      copy[idx] = it;
      return copy;
    });
  };

  const handlePriceChange = (idx: number, newPrice: number) => {
    const safePrice = Math.max(0, Math.min(999999999, Number(newPrice) || 0));
    setEditedItems((prev) => {
      const copy = [...prev];
      const it = { ...copy[idx] };
      it.precio_unitario = safePrice;
      const lineGross = safePrice * (it.cantidad || 1);
      const discountPct = Math.max(0, Math.min(100, Number(it.descuento_porcentaje) || 0));
      const discountAmount = lineGross * (discountPct / 100);
      it.descuento_monto = discountAmount;
      it.subtotal = lineGross - discountAmount;
      copy[idx] = it;
      return copy;
    });
  };

  const handleItemDiscountChange = (idx: number, discountPct: number) => {
    const validPct = Math.max(0, Math.min(100, Number(discountPct) || 0));
    setEditedItems((prev) => {
      const copy = [...prev];
      const it = { ...copy[idx] };
      const lineGross = (it.precio_unitario || 0) * (it.cantidad || 1);
      const discountAmount = lineGross * (validPct / 100);
      it.descuento_porcentaje = validPct;
      it.descuento_monto = discountAmount;
      it.subtotal = lineGross - discountAmount;
      copy[idx] = it;
      return copy;
    });
  };

  const handleCommentChange = (idx: number, newComment: string) => {
    setEditedItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], comentario: newComment };
      return copy;
    });
  };

  const handleRemoveItem = (idx: number) => {
    setEditedItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddProductToOrder = (prod: Product) => {
    // Determine unit price according to customer's tier or wholesale default
    const tier = customer?.lista_precio || selectedOrder?.tarifa_aplicada || 'mayoreo';
    let unitPrice = prod.prices?.wholesale || 0;
    if (tier === 'docena' && prod.prices?.dozen) unitPrice = prod.prices.dozen;
    if (tier === 'unidad' && prod.prices?.unit) unitPrice = prod.prices.unit;

    const newItem: OrderItem = {
      referencia: prod.sku,
      descripcion: prod.name,
      cantidad: 1,
      precio_unitario: unitPrice,
      descuento_porcentaje: 0,
      descuento_monto: 0,
      subtotal: unitPrice,
      gramos_relleno: prod.filledWeight || 0,
      imagen_url:
        (prod.processedImageUrl && !prod.processedImageUrl.startsWith('data:') && prod.processedImageUrl.length <= 2048)
          ? prod.processedImageUrl
          : (prod.originalImageUrl && !prod.originalImageUrl.startsWith('data:') && prod.originalImageUrl.length <= 2048)
          ? prod.originalImageUrl
          : '',
      medida: prod.size ? `${prod.size} cm` : '',
      comentario: '',
    };

    setEditedItems((prev) => [...prev, newItem]);
    setIsAddProductOpen(false);
    setProductSearch('');
  };

  const handleSaveChanges = async () => {
    if (!selectedOrder) return;
    setIsSaving(true);
    setFeedbackMsg(null);

    try {
      const abono = selectedOrder.monto_abonado || 0;
      const newSaldo = Math.max(0, calculatedTotal - abono);
      const newPaymentStatus = newSaldo === 0 && calculatedTotal > 0 ? 'pagado' : abono > 0 ? 'parcial' : 'pendiente';

      const updatedOrderData: Partial<CustomerOrder> = {
        items: editedItems,
        estado: editedStatus,
        tipo_solicitud: editedTipoSolicitud,
        nota: editedNota,
        facturado: editedFacturado,
        numero_factura: editedFacturado ? editedNumeroFactura.trim() : '',
        fecha_factura: editedFacturado ? (selectedOrder.fecha_factura || new Date().toISOString()) : undefined,
        subtotal_bruto: calculatedGrossSubtotal,
        descuento_items: calculatedItemDiscounts,
        descuento_porcentaje_general: editedDescuentoGenTipo === 'porcentaje' ? editedDescuentoGenValor : 0,
        descuento_general: editedDescuentoGenTipo === 'monto' ? editedDescuentoGenValor : calculatedGeneralDiscount,
        descuento_total: calculatedTotalDiscount,
        subtotal_gravado: subtotalAfterItemDiscounts,
        total_factura: calculatedTotal,
        saldo: newSaldo,
        estado_pago: newPaymentStatus,
      };

      await onUpdateOrder(selectedOrder.id, updatedOrderData);
      setSelectedOrder((prev) => (prev ? { ...prev, ...updatedOrderData } : null));
      setFeedbackMsg({ type: 'success', text: '¡Pedido actualizado correctamente!' });
    } catch (err: any) {
      console.error(err);
      setFeedbackMsg({ type: 'error', text: err.message || 'Error al actualizar el pedido.' });
    } finally {
      setIsSaving(false);
    }
  };


  const handleDeleteCurrentOrder = async () => {
    if (!selectedOrder) return;
    if (!confirm(`¿Estás seguro de eliminar el pedido ${selectedOrder.id}? Esta acción no se puede deshacer.`)) return;

    setIsSaving(true);
    try {
      await onDeleteOrder(selectedOrder.id);
      setSelectedOrder(null);
    } catch (err: any) {
      alert('Error al eliminar el pedido: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const formatCountryBranch = (branchOrCountry?: string) => {
    if (!branchOrCountry) return company.country || 'Costa Rica';
    const val = branchOrCountry.toLowerCase().trim();
    if (val === 'costarica' || val === 'costa-rica' || val.includes('costa')) return 'Costa Rica';
    if (val === 'mexico' || val.includes('mexic')) return 'México';
    if (val === 'honduras') return 'Honduras';
    if (val === 'guatemala') return 'Guatemala';
    if (val === 'panama') return 'Panamá';
    if (val === 'colombia') return 'Colombia';
    return branchOrCountry.charAt(0).toUpperCase() + branchOrCountry.slice(1);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden">
      <div className="bg-slate-100 w-full max-w-5xl rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[95vh] sm:h-auto sm:max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#3C5866] text-white p-3.5 sm:p-4.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {selectedOrder ? (
              <button
                type="button"
                onClick={handleBackToList}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer shrink-0"
                title={customer ? 'Volver al listado de pedidos' : 'Cerrar edición'}
              >
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/10 shrink-0">
                <Package className="w-4 h-4 text-[#FFF3CD]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-xs sm:text-base text-white truncate">
                  {selectedOrder
                    ? `Pedido #${selectedOrder.id}`
                    : `Historial: ${customer?.nombre || 'General'}`}
                </h3>
                {selectedOrder && (
                  <span className="shrink-0 text-[9px] sm:text-[9.5px] font-black px-1.5 sm:px-2 py-0.5 rounded-md border bg-emerald-400/20 text-emerald-200 border-emerald-400/30">
                    PEDIDO
                  </span>
                )}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-200 truncate">
                {selectedOrder
                  ? `${selectedOrder.cliente_nombre} ${selectedOrder.negocio ? '• ' + selectedOrder.negocio : ''}`
                  : `${customerOrders.length} pedido(s) registrado(s)`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {selectedOrder && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    const currentOrderData: CustomerOrder = {
                      ...selectedOrder,
                      items: editedItems,
                      estado: editedStatus,
                      tipo_solicitud: editedTipoSolicitud,
                      nota: editedNota,
                      facturado: editedFacturado,
                      numero_factura: editedFacturado ? editedNumeroFactura.trim() : '',
                      subtotal_bruto: calculatedGrossSubtotal,
                      descuento_items: calculatedItemDiscounts,
                      descuento_porcentaje_general: editedDescuentoGenTipo === 'porcentaje' ? editedDescuentoGenValor : 0,
                      descuento_general: editedDescuentoGenTipo === 'monto' ? editedDescuentoGenValor : calculatedGeneralDiscount,
                      descuento_total: calculatedTotalDiscount,
                      total_factura: calculatedTotal,
                    };
                    downloadOrderExcel({ order: currentOrderData, company, isAdmin: true });
                  }}
                  className="p-2 sm:px-3 sm:py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 hover:text-white border border-emerald-400/30 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  title="Descargar Excel de Producción"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
                  <span className="hidden sm:inline">Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const currentOrderData: CustomerOrder = {
                      ...selectedOrder,
                      items: editedItems,
                      estado: editedStatus,
                      tipo_solicitud: editedTipoSolicitud,
                      nota: editedNota,
                      facturado: editedFacturado,
                      numero_factura: editedFacturado ? editedNumeroFactura.trim() : '',
                      subtotal_bruto: calculatedGrossSubtotal,
                      descuento_items: calculatedItemDiscounts,
                      descuento_porcentaje_general: editedDescuentoGenTipo === 'porcentaje' ? editedDescuentoGenValor : 0,
                      descuento_general: editedDescuentoGenTipo === 'monto' ? editedDescuentoGenValor : calculatedGeneralDiscount,
                      descuento_total: calculatedTotalDiscount,
                      total_factura: calculatedTotal,
                    };
                    downloadOrderPdf({ order: currentOrderData, company, isAdmin: false });
                  }}
                  className="p-2 sm:px-3 sm:py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 hover:text-white border border-blue-400/30 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  title="Descargar Comprobante PDF del Cliente"
                >
                  <FileText className="w-4 h-4 text-blue-300" />
                  <span className="hidden sm:inline">PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleDeleteCurrentOrder}
                  disabled={isSaving}
                  className="p-2 text-rose-300 hover:text-white hover:bg-rose-500/30 border border-rose-400/30 rounded-xl transition-all cursor-pointer"
                  title="Eliminar este pedido permanentemente"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-3 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* VIEW 1: LIST OF ORDERS */}
          {!selectedOrder && (
            <div>
              {customerOrders.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-white rounded-3xl border border-slate-200 p-8 shadow-xs">
                  <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-600">No hay pedidos registrados para este cliente</p>
                  <p className="text-xs text-slate-400 mt-1">Los pedidos generados desde el catálogo aparecerán aquí.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {customerOrders.map((order) => {
                    const badge = getStatusBadge(order.estado);
                    const StatusIcon = badge.icon;
                    const itemsCount = order.items?.reduce((s, i) => s + i.cantidad, 0) || 0;
                    const totalAmount = order.total_factura || order.saldo || 0;

                    return (
                      <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className="bg-white p-4.5 rounded-2xl border border-slate-200 hover:border-[#3C5866] hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-sm text-[#3C5866] group-hover:text-[#C37D41] transition-colors">
                                #{order.id}
                              </span>
                              {order.facturado && (
                                <span className="bg-blue-50 text-blue-700 border border-blue-200 text-[9.5px] font-black px-1.5 py-0.5 rounded">
                                  🧾 #{order.numero_factura || 'S/N'}
                                </span>
                              )}
                            </div>
                            <span className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${badge.bg}`}>
                              <StatusIcon className="w-3 h-3" />
                              {badge.label}
                            </span>
                          </div>

                          <p className="text-xs font-bold text-slate-700">{order.cliente_nombre}</p>
                          {order.negocio && <p className="text-[11px] text-slate-500 font-medium">{order.negocio}</p>}

                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2.5">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-400" />
                              {new Date(order.creado_en).toLocaleDateString('es-ES')}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package className="w-3.5 h-3.5 text-slate-400" />
                              {itemsCount} unidades
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Total</span>
                            <span className="font-black text-sm text-slate-900">
                              {company.currencySymbol || '$'} {totalAmount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadOrderExcel({ order, company, isAdmin: true });
                              }}
                              className="px-2 py-1 text-emerald-800 hover:bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                              title="Descargar Excel de Producción"
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-[11px]">Excel</span>
                            </button>
                            <button className="flex items-center gap-1 text-xs font-bold text-[#3C5866] group-hover:text-[#C37D41]">
                              <span>Ver / Editar</span>
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: ORDER DETAILS & DYNAMIC EDITOR */}
          {selectedOrder && (
            <div className="space-y-4">
              {/* Order Metadata Ribbon */}
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-center">
                {/* 1. Estado del Pedido */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Estado del Pedido</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative inline-flex items-center">
                      <span className={`absolute left-2.5 w-2 h-2 rounded-full pointer-events-none ${
                        editedStatus === 'pendiente' ? 'bg-amber-500' :
                        editedStatus === 'proceso' || editedStatus === 'bodega' ? 'bg-blue-600' :
                        editedStatus === 'empacado' || editedStatus === 'empaque' || editedStatus === 'despacho' ? 'bg-purple-600' :
                        editedStatus === 'entregado' || editedStatus === 'entrega' ? 'bg-emerald-600' : 'bg-rose-600'
                      }`} />
                      <select
                        value={editedStatus}
                        onChange={(e) => setEditedStatus(e.target.value as any)}
                        className={`pl-6 pr-7 py-1.5 bg-white border rounded-xl text-xs font-black focus:outline-none focus:ring-2 cursor-pointer appearance-none ${
                          editedStatus === 'pendiente' ? 'text-amber-800 border-amber-300' :
                          editedStatus === 'proceso' || editedStatus === 'bodega' ? 'text-blue-800 border-blue-300' :
                          editedStatus === 'empacado' || editedStatus === 'empaque' || editedStatus === 'despacho' ? 'text-purple-800 border-purple-300' :
                          editedStatus === 'entregado' || editedStatus === 'entrega' ? 'text-emerald-800 border-emerald-300' : 'text-rose-800 border-rose-300'
                        }`}
                      >
                        <option value="pendiente">PENDIENTE</option>
                        <option value="proceso">EN PROCESO</option>
                        <option value="empacado">EMPACADO</option>
                        <option value="entregado">ENTREGADO</option>
                        <option value="cancelado">CANCELADO</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2 text-slate-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* 2. Sucursal / País */}
                <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Sucursal / Destino</label>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl text-xs font-extrabold text-slate-800 border border-slate-200">
                      <MapPin className="w-3.5 h-3.5 text-[#3C5866]" />
                      <span>{formatCountryBranch(selectedOrder.pais || selectedOrder.sucursal)}</span>
                    </span>
                  </div>
                </div>

                {/* 3. Facturación Oficial Externa */}
                <div className="space-y-1 lg:border-l lg:border-slate-200 lg:pl-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Facturación Oficial</label>
                  <div className="flex flex-col gap-1 mt-0.5">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={editedFacturado}
                        onChange={(e) => setEditedFacturado(e.target.checked)}
                        className="w-4 h-4 rounded text-[#3C5866] focus:ring-[#3C5866] border-slate-300 cursor-pointer"
                      />
                      <span className="text-xs font-extrabold text-slate-700">
                        {editedFacturado ? '✓ Factura Realizada' : 'Sin Facturar'}
                      </span>
                    </label>
                    {editedFacturado && (
                      <div className="relative mt-0.5">
                        <input
                          type="text"
                          value={editedNumeroFactura}
                          onChange={(e) => setEditedNumeroFactura(e.target.value)}
                          placeholder="Nº Factura Oficial..."
                          className="w-full px-2.5 py-1 text-xs font-bold bg-blue-50/50 border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 text-blue-900 placeholder:text-slate-400 shadow-2xs"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* 4. Gestión de Pagos */}
                <div className="space-y-1 lg:border-l lg:border-slate-200 lg:pl-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Cobro & Abonos</label>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-xl border ${
                      selectedOrder.estado_pago === 'pagado'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : selectedOrder.estado_pago === 'parcial'
                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}>
                      {selectedOrder.estado_pago === 'pagado'
                        ? '✓ Pagado'
                        : selectedOrder.estado_pago === 'parcial'
                        ? `Abono: ${company.currencySymbol || '$'} ${(selectedOrder.monto_abonado || 0).toLocaleString()}`
                        : 'Pendiente Pago'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPaymentModalOpen(true)}
                      className="px-3 py-1 bg-[#3C5866] hover:bg-[#2c424e] text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs active:scale-95"
                    >
                      <CreditCard className="w-3.5 h-3.5 text-[#FFF3CD]" />
                      <span>Registrar Pago</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Feedback Alert */}
              {feedbackMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    feedbackMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {feedbackMsg.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{feedbackMsg.text}</span>
                </div>
              )}

              {/* Product References Section Header with "+ Agregar Referencia" */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-[#3C5866]" />
                    <span>Referencias del Pedido</span>
                  </h4>
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black">
                    {editedItems.length} ref. • {calculatedTotalUnits} unidades
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(!isAddProductOpen)}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#FFF3CD]" />
                  <span>Agregar Referencia</span>
                </button>
              </div>

              {/* Feedback Alert */}
              {feedbackMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                    feedbackMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {feedbackMsg.type === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{feedbackMsg.text}</span>
                </div>
              )}

              {/* Add Product Drawer / Section */}
              {isAddProductOpen && (
                <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl space-y-3 animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold text-emerald-900 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-emerald-600" />
                      Seleccionar Producto para Agregar al Pedido:
                    </span>
                    <button
                      onClick={() => setIsAddProductOpen(false)}
                      className="text-emerald-700 hover:text-emerald-900 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Buscar por nombre, SKU o categoría..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-emerald-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {filteredProducts.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleAddProductToOrder(p)}
                        className="bg-white p-2.5 rounded-xl border border-emerald-100 hover:border-emerald-400 hover:shadow-xs flex items-center gap-2.5 cursor-pointer transition-all"
                      >
                        <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200 flex items-center justify-center">
                          {p.processedImageUrl && p.processedImageUrl !== '/assets/REF_1.jpg' && !p.processedImageUrl.includes('REF_1.jpg') ? (
                            <Image
                              src={p.processedImageUrl}
                              alt={p.name}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-slate-300" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-extrabold text-[11px] text-slate-800 truncate">{p.name}</p>
                          <p className="text-[10px] text-slate-500 font-bold">{p.sku} {p.size ? `[${p.size} cm]` : ''}</p>
                          <p className="text-[10px] text-emerald-700 font-black">
                            {company.currencySymbol || '$'} {((customer?.lista_precio === 'docena' ? p.prices?.dozen : customer?.lista_precio === 'unidad' ? p.prices?.unit : p.prices?.wholesale) || 0).toLocaleString()}
                          </p>
                        </div>
                        <Plus className="w-4 h-4 text-emerald-600 shrink-0 mr-1" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Items Container: Cards en Móvil y Tabla en Desktop */}
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
                {/* Mobile View: Cards de Referencias */}
                <div className="md:hidden divide-y divide-slate-100 p-2.5 space-y-3">
                  {editedItems.map((item, idx) => {
                    const lineGross = (item.precio_unitario || 0) * (item.cantidad || 0);
                    const hasItemDiscount = (item.descuento_porcentaje || 0) > 0;
                    return (
                      <div key={idx} className="bg-slate-50/80 p-3 rounded-2xl border border-slate-200/80 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {(() => {
                              const itemImg = resolveItemImage(item);
                              return (
                                <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-white shrink-0 border border-slate-200 shadow-2xs flex items-center justify-center">
                                  {itemImg ? (
                                    <Image
                                      src={itemImg}
                                      alt={item.descripcion}
                                      fill
                                      className="object-cover"
                                    />
                                  ) : (
                                    <ImageIcon className="w-5 h-5 text-slate-300" />
                                  )}
                                </div>
                              );
                            })()}
                            <div className="min-w-0">
                              <span className="font-extrabold text-xs text-slate-800 block truncate">{item.descripcion}</span>
                              <span className="text-[10px] text-slate-400 font-bold block">{item.referencia} {item.medida ? `[${item.medida}]` : ''}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                            title="Eliminar referencia"
                          >
                            <Trash2 className="w-4 h-4 text-rose-500" />
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200/60 text-center">
                          <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase block mb-0.5">Cant.</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={item.cantidad ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d+$/.test(val)) {
                                  handleQuantityChange(idx, val === '' ? ('' as any) : parseInt(val, 10));
                                }
                              }}
                              onBlur={() => {
                                if (!item.cantidad || item.cantidad < 1) {
                                  handleQuantityChange(idx, 1);
                                }
                              }}
                              className="w-full text-center py-1.5 bg-white border border-slate-300 rounded-lg font-black text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase block mb-0.5">Precio Unit.</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.precio_unitario ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                  handlePriceChange(idx, val === '' ? ('' as any) : parseFloat(val));
                                }
                              }}
                              onBlur={() => {
                                if (item.precio_unitario === undefined || isNaN(Number(item.precio_unitario))) {
                                  handlePriceChange(idx, 0);
                                }
                              }}
                              className="w-full text-center py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                            />
                          </div>

                          <div>
                            <label className="text-[9px] font-black text-slate-400 uppercase block mb-0.5">Subtotal</label>
                            <div className="py-1.5 px-1 bg-white border border-slate-200 rounded-lg font-black text-xs text-[#3C5866] truncate">
                              {company.currencySymbol || '$'} {((item.subtotal || lineGross) || 0).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <div className="w-24 shrink-0 flex items-center gap-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase">Desc:</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={item.descuento_porcentaje ? item.descuento_porcentaje : ''}
                              placeholder="0"
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '' || /^\d+$/.test(val)) {
                                  handleItemDiscountChange(idx, val === '' ? 0 : Math.min(100, parseInt(val, 10)));
                                }
                              }}
                              className="w-10 text-center py-1 bg-white border border-slate-300 rounded-lg font-bold text-[11px] text-slate-700"
                            />
                            <span className="text-[10px] text-slate-400 font-bold">%</span>
                          </div>
                          <input
                            type="text"
                            value={item.comentario || ''}
                            onChange={(e) => handleCommentChange(idx, e.target.value)}
                            placeholder="Nota o especificación..."
                            className="flex-1 py-1 px-2.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#3C5866]"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop View: Tabla Completa */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-extrabold text-slate-700 uppercase">
                        <th className="py-2.5 px-3">Producto</th>
                        <th className="py-2.5 px-2 text-center">Cant.</th>
                        <th className="py-2.5 px-2 text-right">Precio Unit.</th>
                        <th className="py-2.5 px-2 text-center">Desc. Ref.</th>
                        <th className="py-2.5 px-2 text-center">Peso Relleno</th>
                        <th className="py-2.5 px-2 text-right">Subtotal</th>
                        <th className="py-2.5 px-3">Nota / Especificación</th>
                        <th className="py-2.5 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {editedItems.map((item, idx) => {
                        const lineGross = (item.precio_unitario || 0) * (item.cantidad || 0);
                        const hasItemDiscount = (item.descuento_porcentaje || 0) > 0;

                        return (
                          <tr key={idx} className="hover:bg-slate-50/80">
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2.5 min-w-[180px]">
                                {(() => {
                                  const itemImg = resolveItemImage(item);
                                  return (
                                    <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200 flex items-center justify-center">
                                      {itemImg ? (
                                        <Image
                                          src={itemImg}
                                          alt={item.descripcion}
                                          fill
                                          className="object-cover"
                                        />
                                      ) : (
                                        <ImageIcon className="w-4 h-4 text-slate-300" />
                                      )}
                                    </div>
                                  );
                                })()}
                                <div className="min-w-0">
                                  <span className="font-extrabold text-slate-800 block truncate">{item.descripcion}</span>
                                  <span className="text-[10px] text-slate-400 font-bold block">{item.referencia} {item.medida ? `[${item.medida}]` : ''}</span>
                                </div>
                              </div>
                            </td>

                            <td className="py-2 px-2 text-center">
                              <div className="inline-flex items-center justify-center">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={item.cantidad ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d+$/.test(val)) {
                                      handleQuantityChange(idx, val === '' ? ('' as any) : parseInt(val, 10));
                                    }
                                  }}
                                  onBlur={() => {
                                    if (!item.cantidad || item.cantidad < 1) {
                                      handleQuantityChange(idx, 1);
                                    }
                                  }}
                                  className="w-14 text-center py-1 bg-slate-50 border border-slate-300 rounded-lg font-black text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                                />
                              </div>
                            </td>

                            <td className="py-2 px-2 text-right">
                              <div className="inline-flex items-center gap-0.5 justify-end">
                                <span className="text-slate-400 font-bold text-[10px]">{company.currencySymbol || '$'}</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={item.precio_unitario ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                      handlePriceChange(idx, val === '' ? ('' as any) : parseFloat(val));
                                    }
                                  }}
                                  onBlur={() => {
                                    if (item.precio_unitario === undefined || isNaN(Number(item.precio_unitario))) {
                                      handlePriceChange(idx, 0);
                                    }
                                  }}
                                  className="w-20 text-right py-1 px-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                                />
                              </div>
                            </td>

                            <td className="py-2 px-2 text-center">
                              <div className="inline-flex items-center gap-0.5 justify-center">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={item.descuento_porcentaje ? item.descuento_porcentaje : ''}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || /^\d+$/.test(val)) {
                                      handleItemDiscountChange(idx, val === '' ? 0 : Math.min(100, parseInt(val, 10)));
                                    }
                                  }}
                                  className={`w-12 text-center py-1 bg-slate-50 border rounded-lg font-bold text-xs focus:outline-none focus:ring-2 focus:ring-[#3C5866] ${
                                    hasItemDiscount ? 'border-emerald-400 text-emerald-800 bg-emerald-50/50' : 'border-slate-300 text-slate-700'
                                  }`}
                                />
                                <span className="text-[10.5px] font-bold text-slate-400">%</span>
                              </div>
                            </td>

                            <td className="py-2 px-2 text-center text-[11px] font-semibold text-slate-500">
                              {item.gramos_relleno ? `${item.gramos_relleno * (item.cantidad || 1)}g` : '-'}
                            </td>

                            <td className="py-2 px-2 text-right">
                              {hasItemDiscount && (
                                <span className="text-[10px] text-slate-400 line-through block">
                                  {company.currencySymbol || '$'} {lineGross.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              )}
                              <span className={`font-black ${hasItemDiscount ? 'text-emerald-700' : 'text-slate-900'}`}>
                                {company.currencySymbol || '$'} {((item.subtotal || lineGross) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>

                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={item.comentario || ''}
                                onChange={(e) => handleCommentChange(idx, e.target.value)}
                                placeholder="Sin nota..."
                                className="w-full py-1 px-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#3C5866]"
                              />
                            </td>

                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Panel de Descuento General de Factura */}
                <div className="bg-slate-50/70 p-3 sm:p-3.5 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] sm:text-xs font-black text-slate-700 uppercase">Descuento General:</span>
                    <div className="flex items-center bg-white p-0.5 rounded-xl border border-slate-300 shadow-2xs">
                      <button
                        type="button"
                        onClick={() => setEditedDescuentoGenTipo('porcentaje')}
                        className={`px-2.5 py-1 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                          editedDescuentoGenTipo === 'porcentaje'
                            ? 'bg-[#3C5866] text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        % Porcentaje
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditedDescuentoGenTipo('monto')}
                        className={`px-2.5 py-1 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                          editedDescuentoGenTipo === 'monto'
                            ? 'bg-[#3C5866] text-white shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {company.currencySymbol || '$'} Monto Fijo
                      </button>
                    </div>
                    <div className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={editedDescuentoGenValor === 0 ? '' : editedDescuentoGenValor}
                        placeholder="0"
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '' || /^\d*\.?\d*$/.test(val)) {
                            setEditedDescuentoGenValor(val === '' ? 0 : parseFloat(val));
                          }
                        }}
                        className="w-20 text-center py-1 px-2 bg-white border border-slate-300 rounded-xl font-black text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                      />
                      <span className="text-xs font-black text-slate-500">
                        {editedDescuentoGenTipo === 'porcentaje' ? '%' : (company.currencySymbol || '$')}
                      </span>
                    </div>
                  </div>

                  {calculatedTotalDiscount > 0 && (
                    <div className="bg-emerald-50 text-emerald-800 border border-emerald-300 px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-between sm:justify-start gap-2">
                      <span>Descuentos:</span>
                      <span className="font-black text-emerald-700">
                        -{company.currencySymbol || '$'} {calculatedTotalDiscount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Summary Strip */}
                <div className="bg-white p-3.5 sm:p-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-bold text-slate-600">
                    <span>Unidades: <strong className="text-slate-900">{calculatedTotalUnits}</strong></span>
                    {calculatedTotalGrams > 0 && (
                      <span className="flex items-center gap-1 text-slate-700">
                        <Scale className="w-3.5 h-3.5 text-[#C37D41]" />
                        Relleno: <strong>{(calculatedTotalGrams / 1000).toFixed(2)} kg</strong>
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 text-left sm:text-right w-full sm:w-auto sm:min-w-[240px]">
                    {calculatedTotalDiscount > 0 && (
                      <>
                        <div className="text-xs text-slate-500 font-semibold flex items-center justify-between gap-3">
                          <span>Subtotal Bruto:</span>
                          <span className="font-bold text-slate-700">
                            {company.currencySymbol || '$'} {calculatedGrossSubtotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        {calculatedItemDiscounts > 0 && (
                          <div className="text-xs text-emerald-700 font-semibold flex items-center justify-between gap-3">
                            <span>Desc. por Referencias:</span>
                            <span className="font-bold">
                              -{company.currencySymbol || '$'} {calculatedItemDiscounts.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                        {calculatedGeneralDiscount > 0 && (
                          <div className="text-xs text-emerald-700 font-semibold flex items-center justify-between gap-3">
                            <span>Desc. General {editedDescuentoGenTipo === 'porcentaje' ? `(${editedDescuentoGenValor}%)` : ''}:</span>
                            <span className="font-bold">
                              -{company.currencySymbol || '$'} {calculatedGeneralDiscount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    <div className="pt-1.5 border-t border-slate-100 flex items-baseline justify-between gap-3">
                      <span className="text-xs font-black text-slate-800 uppercase">
                        Total Factura:
                      </span>
                      <span className="text-xl font-black text-[#C37D41]">
                        {company.currencySymbol || '$'} {calculatedTotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* General Order Note */}
              <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs">
                <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                  Nota General del Pedido
                </label>
                <textarea
                  rows={2}
                  value={editedNota}
                  onChange={(e) => setEditedNota(e.target.value)}
                  placeholder="Instrucciones especiales de entrega, transporte o empaque..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-200 flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 shrink-0">
          {selectedOrder ? (
            <>
              <button
                type="button"
                onClick={handleBackToList}
                className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer text-center"
              >
                {customer ? 'Volver a la lista' : 'Cerrar'}
              </button>
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="w-full sm:w-auto px-5 py-2.5 text-xs font-extrabold text-white bg-[#3C5866] hover:bg-[#2c424e] rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <Save className="w-4 h-4 text-[#FFF3CD]" />
                <span>{isSaving ? 'Guardando...' : 'Guardar Cambios del Pedido'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto ml-auto px-5 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer text-center"
            >
              Cerrar
            </button>
          )}
        </div>
      </div>

      <OrderPaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        order={selectedOrder}
        company={company}
        onSavePayment={async (orderId, paymentData) => {
          await onUpdateOrder(orderId, paymentData);
          setSelectedOrder((prev) => (prev ? { ...prev, ...paymentData } : null));
        }}
      />
    </div>
  );
};
