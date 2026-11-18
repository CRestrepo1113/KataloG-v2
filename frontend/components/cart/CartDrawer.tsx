'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import {
  CartItem,
  PriceList,
  PriceTier,
  CompanyInfo,
  Customer,
  Product,
  UserRole,
} from '@/lib/types';
import { validateCartMinimums } from '@/lib/pricing';
import { formatCurrency, formatSize } from '@/lib/theme';
import {
  saveCustomerOrder,
  generateNextOrderId,
  getSharedProductImage,
  fetchBranchCustomersForSeller,
} from '@/lib/firestore';
import { useModalHistory } from '@/lib/useModalHistory';
import { downloadOrderPdf } from '@/lib/pdfExport';
import {
  ShoppingBag,
  X,
  Plus,
  Minus,
  Trash2,
  Send,
  Image as ImageIcon,
  User,
  Phone,
  FileText,
  MessageSquare,
  MessageSquarePlus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Search,
  EyeOff,
} from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  currentTier: PriceTier;
  activePriceList?: PriceList;
  resolvePrice: (product: Product, listId?: string) => number;
  userRole: UserRole;
  whiteLabelMode?: boolean;
  onExitWhiteLabel?: () => void;
  branchSlug: string;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onSetQuantity: (productId: string, quantity: number) => void;
  onUpdateComment?: (productId: string, comment: string) => void;
  onRemoveItem: (productId: string) => void;
  onClearCart: () => void;
  company: CompanyInfo;
  customer?: Customer | null;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  onClose,
  items,
  currentTier,
  activePriceList,
  resolvePrice,
  userRole,
  whiteLabelMode = false,
  onExitWhiteLabel,
  branchSlug,
  onUpdateQuantity,
  onSetQuantity,
  onUpdateComment,
  onRemoveItem,
  onClearCart,
  company,
  customer,
}) => {
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [editingCommentItem, setEditingCommentItem] = useState<CartItem | null>(null);
  const [tempComment, setTempComment] = useState('');
  const [customerName, setCustomerName] = useState(customer?.nombre || '');
  const [customerPhone, setCustomerPhone] = useState(customer?.telefonos || '');
  const [nameError, setNameError] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isSubmittingWhatsApp, setIsSubmittingWhatsApp] = useState(false);
  const [pdfDownloaded, setPdfDownloaded] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'local_queued'>('idle');

  // Seller mode state
  const isSeller = userRole === 'vendedor';
  const [branchClients, setBranchClients] = useState<Customer[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Customer | null>(null);

  const [sessionOrderId, setSessionOrderId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('katalog_session_order_id');
    }
    return null;
  });
  const [isModifiedOrder, setIsModifiedOrder] = useState<boolean>(false);

  useEffect(() => {
    if (sessionOrderId) {
      setIsModifiedOrder(true);
    }
    setPdfDownloaded(false);
  }, [items, sessionOrderId]);

  useEffect(() => {
    if (whiteLabelMode) {
      setCustomerName('');
      setCustomerPhone('');
      return;
    }
    if (isSeller) {
      if (!selectedClient) {
        setCustomerName('');
        setCustomerPhone('');
      }
      return;
    }
    if (customer?.nombre) {
      setCustomerName(customer.negocio ? `${customer.nombre} (${customer.negocio})` : customer.nombre);
    }
    if (customer?.telefonos) {
      setCustomerPhone(customer.telefonos);
    }
  }, [customer, isSeller, whiteLabelMode, selectedClient]);

  useEffect(() => {
    if (showCheckoutModal && isSeller && branchSlug) {
      fetchBranchCustomersForSeller(branchSlug).then(setBranchClients).catch(() => {});
    }
  }, [showCheckoutModal, isSeller, branchSlug]);

  useModalHistory(showCheckoutModal, () => setShowCheckoutModal(false), 'cartCheckoutModal');
  useModalHistory(Boolean(editingCommentItem), () => setEditingCommentItem(null), 'cartEditCommentModal');

  const filteredBranchClients = useMemo(() => {
    const q = clientSearch.trim().toLowerCase();
    if (!q) return branchClients.slice(0, 12);
    return branchClients
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          (c.negocio && c.negocio.toLowerCase().includes(q)) ||
          (c.telefonos && c.telefonos.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [branchClients, clientSearch]);

  if (!isOpen) return null;

  const activeTierId = activePriceList?.id || currentTier;
  const activeTierName = whiteLabelMode ? 'Venta' : (activePriceList?.name || 'Tarifa');

  const getItemUnitPrice = (product: Product): number => {
    return resolvePrice(product, activeTierId);
  };

  const total = items.reduce((sum, item) => {
    return sum + getItemUnitPrice(item.product) * item.quantity;
  }, 0);

  const minimumCheck = whiteLabelMode
    ? { valid: true, missingUnits: 0, missingAmount: 0 }
    : validateCartMinimums(items, activePriceList, total, userRole);

  const handleOpenCheckoutModal = () => {
    if (items.length === 0 || !minimumCheck.valid) return;
    if (!isSeller && !whiteLabelMode && customer?.nombre && !customerName) {
      setCustomerName(customer.negocio ? `${customer.nombre} (${customer.negocio})` : customer.nombre);
    }
    setShowCheckoutModal(true);
  };

  const handleOpenEditComment = (item: CartItem) => {
    setEditingCommentItem(item);
    setTempComment(item.comment || '');
  };

  const handleSaveEditComment = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingCommentItem) {
      onUpdateComment?.(editingCommentItem.product.id, tempComment.trim());
    }
    setEditingCommentItem(null);
  };

  const buildAndSaveOrderPayload = async (cleanClientName: string, customOrderId?: string) => {
    const orderItems = items.map((it) => {
      const uPrice = getItemUnitPrice(it.product);
      const rawImg = it.product.processedImageUrl || '';
      const safeImg = rawImg.startsWith('data:') || rawImg.length > 2048 ? '' : rawImg;
      return {
        referencia: it.product.sku,
        descripcion: it.product.name,
        cantidad: it.quantity,
        precio_unitario: uPrice,
        subtotal: uPrice * it.quantity,
        moneda: company.currencyCode || 'USD',
        gramos_relleno: it.product.filledWeight,
        imagen_url: safeImg,
        comentario: it.comment,
        medida: it.product.size,
      };
    });

    setCloudSyncStatus('syncing');
    const saved = await saveCustomerOrder({
      id: customOrderId,
      cliente_id: isSeller
        ? selectedClient?.uid || selectedClient?.id || 'CLIENTE-VISITA'
        : customer?.uid || customer?.id || 'CLIENTE-WEB',
      cliente_nombre: cleanClientName,
      cliente_tienda: isSeller ? (selectedClient?.negocio || '') : (customer?.negocio || ''),
      cliente_telefono: customerPhone.trim() || selectedClient?.telefonos || customer?.telefonos || '',
      cliente_email: isSeller ? (selectedClient?.email || '') : (customer?.email || ''),
      pais: company.country || 'COSTA RICA',
      sucursal: company.tenantId || branchSlug || 'costarica',
      orderPrefix:
        company.orderPrefix ||
        (company.country?.toLowerCase().includes('costa')
          ? 'CR'
          : company.country?.substring(0, 2).toUpperCase() || 'CR'),
      moneda: company.currencyCode || 'USD',
      items: orderItems,
      total_factura: total,
      tipo_solicitud: 'PEDIDO',
      tarifa_aplicada: activeTierId,
      tarifa_nombre: activeTierName,
      vendedor: isSeller ? customer?.nombre : 'KataloG Online',
      vendedor_id: isSeller ? (customer?.uid || customer?.id) : undefined,
      modificado: isModifiedOrder,
    });

    setCloudSyncStatus(saved?.syncedToCloud ? 'synced' : 'local_queued');

    if (typeof window !== 'undefined' && saved?.id) {
      sessionStorage.setItem('katalog_session_order_id', saved.id);
    }
    setSessionOrderId(saved.id);
    setIsModifiedOrder(false);
    return saved;
  };

  const handleConfirmSendWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (whiteLabelMode) return;
    if (!customerName.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setIsSubmittingWhatsApp(true);

    const cleanClientName = customerName.trim().toUpperCase();
    const orderId =
      sessionOrderId ||
      generateNextOrderId({
        orderPrefix: company.orderPrefix,
        sucursal: company.tenantId || branchSlug,
        pais: company.country,
      }).orderId;

    const wasModified = isModifiedOrder;
    let finalOrderId = orderId;
    try {
      const saved = await buildAndSaveOrderPayload(cleanClientName, orderId);
      if (saved?.id) finalOrderId = saved.id;
    } catch (err) {
      console.warn('Error saving order:', err);
    }

    const updateBadge = wasModified ? ' (ACTUALIZADO)' : '';
    const totalUnits = items.reduce((sum, it) => sum + it.quantity, 0);
    const refCount = items.length;

    let message = `*¡Hola! Registro de pedido${updateBadge} en catálogo virtual.*\n\n`;
    message += `📋 *Folio:* #${finalOrderId}\n`;
    message += `👤 *Cliente:* ${cleanClientName}\n`;
    if (isSeller && customer?.nombre) {
      message += `💼 *Vendedor:* ${customer.nombre}\n`;
    }
    message += `🔖 *Tarifa:* ${activeTierName.toUpperCase()}\n`;
    message += `📦 *Artículos:* ${refCount} ref. (${totalUnits} unid.)\n`;
    message += `💰 *Total Estimado:* ${formatCurrency(total, company.currencySymbol || '$')}\n\n`;
    message += `Quedo atento a confirmación. ¡Gracias!`;

    const cleanPhone = (company.phone || '').replace(/[^0-9]/g, '');
    const whatsappUrl = `https://api.whatsapp.com/send/?phone=${cleanPhone}&text=${encodeURIComponent(message)}`;

    downloadOrderPdf({
      items: items.map((it) => ({
        sku: it.product.sku,
        name: it.product.name,
        size: it.product.size,
        quantity: it.quantity,
        unitPrice: getItemUnitPrice(it.product),
        subtotal: getItemUnitPrice(it.product) * it.quantity,
        tierName: activeTierName,
        comment: it.comment,
        imageUrl: it.product.processedImageUrl,
        filledWeight: it.product.filledWeight,
      })),
      customerName: cleanClientName,
      requestType: 'PEDIDO',
      tierName: activeTierName,
      orderId: finalOrderId,
      createdAt: new Date(),
      company,
      isAdmin: false,
    }).catch(() => {});

    let opened = false;
    try {
      const waWindow = window.open(whatsappUrl, '_blank');
      if (waWindow && !waWindow.closed && typeof waWindow.closed !== 'undefined') opened = true;
    } catch {}

    if (!opened) {
      setTimeout(() => {
        window.location.href = whatsappUrl;
      }, 600);
    }

    setIsSubmittingWhatsApp(false);
    setShowCheckoutModal(false);
  };

  const handleDownloadPdf = async () => {
    if (!customerName.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);
    setIsDownloadingPdf(true);

    const cleanClientName = customerName.trim().toUpperCase();

    let finalOrderId = '';
    if (!whiteLabelMode) {
      const orderId =
        sessionOrderId ||
        generateNextOrderId({
          orderPrefix: company.orderPrefix,
          sucursal: company.tenantId || branchSlug,
          pais: company.country,
        }).orderId;

      finalOrderId = orderId;
      try {
        const saved = await buildAndSaveOrderPayload(cleanClientName, orderId);
        if (saved?.id) finalOrderId = saved.id;
      } catch (err) {
        console.warn('Error saving order on PDF:', err);
      }
    } else {
      finalOrderId = `COT-${Date.now().toString().slice(-5)}`;
    }

    try {
      await downloadOrderPdf({
        items: items.map((it) => ({
          sku: it.product.sku,
          name: it.product.name,
          size: it.product.size,
          quantity: it.quantity,
          unitPrice: getItemUnitPrice(it.product),
          subtotal: getItemUnitPrice(it.product) * it.quantity,
          tierName: activeTierName,
          comment: it.comment,
          imageUrl: it.product.processedImageUrl,
          filledWeight: it.product.filledWeight,
        })),
        customerName: cleanClientName,
        requestType: 'PEDIDO',
        tierName: activeTierName,
        orderId: finalOrderId,
        createdAt: new Date(),
        company,
        isAdmin: false,
        whiteLabel: whiteLabelMode,
        documentTitle: whiteLabelMode ? 'COMPROBANTE DE PEDIDO' : undefined,
      });
      setPdfDownloaded(true);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleClearCartAndSession = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('katalog_session_order_id');
    }
    setSessionOrderId(null);
    setIsModifiedOrder(false);
    setPdfDownloaded(false);
    setCloudSyncStatus('idle');
    onClearCart();
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex justify-end">
        <div className="bg-white w-full max-w-md h-[100dvh] flex flex-col shadow-2xl overflow-hidden">
          <div className="shrink-0 p-4 border-b border-slate-100 flex items-center justify-between bg-[#3C5866] text-white">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#C37D41]" />
              <div>
                <h3 className="font-bold text-sm">
                  {whiteLabelMode ? 'Lista de Cliente' : 'Tu Pedido'}
                </h3>
                <p className="text-[11px] text-slate-200">
                  Tarifa: <span className="font-bold text-[#FFF3CD]">{activeTierName}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded-full text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
            {items.length === 0 ? (
              <div className="text-center py-16 text-slate-400 space-y-2">
                <ShoppingBag className="w-12 h-12 mx-auto text-slate-300" />
                <p className="text-sm font-medium">Lista vacía</p>
              </div>
            ) : (
              items.map((item) => {
                const unitPrice = getItemUnitPrice(item.product);
                const subtotal = unitPrice * item.quantity;
                const thumbUrl = getSharedProductImage(item.product.sku, item.product.processedImageUrl);

                return (
                  <div
                    key={item.product.id}
                    className="flex flex-col gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-14 h-14 bg-white rounded-xl overflow-hidden flex-shrink-0 p-1 border flex items-center justify-center">
                        {thumbUrl ? (
                          <Image src={thumbUrl} alt={item.product.name} fill className="object-contain" />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-300 stroke-1" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <span className="text-[10.5px] font-black text-[#C37D41] uppercase block">
                          {item.product.sku}{item.product.size ? `, ${formatSize(item.product.size)}` : ''}
                        </span>
                        <h4 className="text-xs font-bold text-[#3C5866] truncate">{item.product.name}</h4>
                        <span className="text-xs font-extrabold text-slate-700">
                          {formatCurrency(unitPrice, company.currencySymbol || '$')} u.
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1 bg-white rounded-xl border border-slate-200 p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.quantity > 1) onUpdateQuantity(item.product.id, -1);
                            }}
                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9]/g, '');
                              onSetQuantity(item.product.id, raw === '' ? 0 : Math.min(99999, parseInt(raw, 10) || 0));
                            }}
                            onBlur={() => {
                              if (!item.quantity || item.quantity <= 0) onSetQuantity(item.product.id, 1);
                            }}
                            className="w-11 text-center text-xs font-black text-[#3C5866] bg-transparent focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(item.product.id, 1)}
                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-600 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <span className="text-xs font-black text-[#3C5866]">
                          {formatCurrency(subtotal, company.currencySymbol || '$')}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => onRemoveItem(item.product.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-xl cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="pt-1 border-t border-slate-100 flex items-center justify-between">
                      {item.comment ? (
                        <div className="w-full flex items-start justify-between gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-xl text-[11px] text-amber-950">
                          <span className="font-medium italic break-words">{item.comment}</span>
                          <button
                            type="button"
                            onClick={() => handleOpenEditComment(item)}
                            className="text-[10.5px] font-bold text-[#C37D41] shrink-0 cursor-pointer"
                          >
                            Editar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleOpenEditComment(item)}
                          className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-400 hover:text-[#C37D41] cursor-pointer"
                        >
                          <MessageSquarePlus className="w-3.5 h-3.5" />
                          <span>Nota</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {items.length > 0 && (
            <div className="shrink-0 p-4 border-t border-slate-100 bg-white space-y-3">
              {!minimumCheck.valid && minimumCheck.reason && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs font-bold text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-[#C37D41] shrink-0 mt-0.5" />
                  <span>{minimumCheck.reason}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-sm font-bold text-[#3C5866]">
                <span>Total:</span>
                <span className="text-xl font-black text-[#C37D41]">
                  {formatCurrency(total, company.currencySymbol || '$')}
                </span>
              </div>

              <button
                type="button"
                onClick={handleOpenCheckoutModal}
                disabled={!minimumCheck.valid}
                className="w-full py-3.5 px-4 bg-[#3C5866] hover:bg-[#263842] disabled:bg-slate-300 disabled:text-slate-500 text-white font-extrabold text-sm rounded-2xl flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4 text-[#FFF3CD]" />
                <span>{whiteLabelMode ? 'Generar Comprobante' : 'Enviar / Descargar'}</span>
              </button>

              {whiteLabelMode && onExitWhiteLabel && (
                <button
                  type="button"
                  onClick={onExitWhiteLabel}
                  className="w-full py-2 text-xs font-bold text-[#3C5866] hover:underline cursor-pointer flex items-center justify-center gap-1"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Volver a Vista KYG</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleClearCartAndSession}
                className="w-full text-center text-xs font-semibold text-slate-400 hover:text-rose-500 py-1 cursor-pointer"
              >
                Vaciar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Checkout Modal */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-[#3C5866]">
                {whiteLabelMode ? 'Comprobante Cliente' : 'Confirmar Pedido'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmSendWhatsApp} className="space-y-4">
              {/* Buscador de cliente de sucursal para Vendedor */}
              {isSeller && !whiteLabelMode && (
                <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 space-y-2">
                  <span className="text-[11px] font-black text-emerald-900 uppercase block">
                    Asignar Cliente (Vendedor)
                  </span>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      placeholder="Buscar cliente registrado..."
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-emerald-200 rounded-xl text-xs"
                    />
                  </div>
                  {filteredBranchClients.length > 0 && (
                    <div className="max-h-28 overflow-y-auto divide-y divide-emerald-100 bg-white rounded-xl border border-emerald-200/70">
                      {filteredBranchClients.map((cl) => (
                        <button
                          key={cl.id}
                          type="button"
                          onClick={() => {
                            setSelectedClient(cl);
                            setCustomerName(cl.negocio ? `${cl.nombre} (${cl.negocio})` : cl.nombre);
                            setCustomerPhone(cl.telefonos || '');
                            setNameError(false);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 text-xs flex justify-between items-center cursor-pointer ${
                            selectedClient?.id === cl.id ? 'bg-emerald-100 font-black' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="truncate">{cl.nombre} {cl.negocio ? `(${cl.negocio})` : ''}</span>
                          <span className="text-[10px] text-slate-500 shrink-0 ml-2">{cl.telefonos}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre / Negocio *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Nombre del cliente"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      if (nameError) setNameError(false);
                    }}
                    className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 border rounded-2xl text-xs sm:text-sm font-medium focus:bg-white focus:outline-none ${
                      nameError ? 'border-rose-400' : 'border-slate-200 focus:ring-2 focus:ring-[#3C5866]/30'
                    }`}
                    autoFocus
                  />
                </div>
              </div>

              {!whiteLabelMode && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      placeholder="+506 8888-8888"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium focus:bg-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {pdfDownloaded && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    {cloudSyncStatus === 'synced'
                      ? 'PDF descargado y pedido registrado.'
                      : 'PDF descargado.'}
                  </span>
                </div>
              )}

              <div className={`grid gap-2.5 ${whiteLabelMode ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {!whiteLabelMode && (
                  <button
                    type="submit"
                    disabled={isSubmittingWhatsApp || isDownloadingPdf}
                    className="py-3 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-black text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmittingWhatsApp ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>WhatsApp</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf || isSubmittingWhatsApp}
                  className="py-3 px-3 bg-[#3C5866] hover:bg-[#263842] disabled:opacity-60 text-white font-black text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#FFF3CD]" />
                  ) : (
                    <FileText className="w-4 h-4 text-[#FFF3CD]" />
                  )}
                  <span>{whiteLabelMode ? 'Descargar PDF Sin Marca' : 'Descargar PDF'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Comment Modal */}
      {editingCommentItem && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-[#C37D41] uppercase">{editingCommentItem.product.sku}</span>
                <h3 className="text-sm font-bold text-[#3C5866] line-clamp-1">{editingCommentItem.product.name}</h3>
              </div>
              <button type="button" onClick={() => setEditingCommentItem(null)} className="text-slate-400 p-1 cursor-pointer">
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveEditComment} className="space-y-3">
              <textarea
                value={tempComment}
                onChange={(e) => setTempComment(e.target.value)}
                placeholder="Especificación..."
                rows={3}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium focus:bg-white focus:outline-none resize-none"
                autoFocus
              />
              <div className="flex items-center gap-2">
                {tempComment.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateComment?.(editingCommentItem.product.id, '');
                      setEditingCommentItem(null);
                    }}
                    className="py-2.5 px-3 bg-rose-50 text-rose-600 font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Borrar
                  </button>
                )}
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#3C5866] text-white font-bold text-xs rounded-xl cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
