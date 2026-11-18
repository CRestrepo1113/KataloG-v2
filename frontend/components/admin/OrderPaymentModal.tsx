'use client';

import React, { useState, useEffect } from 'react';
import { CustomerOrder, PaymentStatus, CompanyInfo } from '@/lib/types';
import { useModalHistory } from '@/lib/useModalHistory';
import {
  DollarSign,
  Calendar,
  CreditCard,
  X,
  Save,
  CheckCircle,
  AlertCircle,
  Clock,
  Check,
} from 'lucide-react';

interface OrderPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: CustomerOrder | null;
  company: CompanyInfo;
  onSavePayment: (orderId: string, paymentData: Partial<CustomerOrder>) => Promise<void>;
}

export const OrderPaymentModal: React.FC<OrderPaymentModalProps> = ({
  isOpen,
  onClose,
  order,
  company,
  onSavePayment,
}) => {
  const [montoAbonado, setMontoAbonado] = useState<number>(0);
  const [estadoPago, setEstadoPago] = useState<PaymentStatus>('pendiente');
  const [fechaPromesa, setFechaPromesa] = useState('');
  const [metodoPago, setMetodoPago] = useState('Transferencia Bancaria');
  const [comprobanteNota, setComprobanteNota] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useModalHistory(isOpen, onClose, 'adminOrderPaymentModal');

  const totalFactura = order?.total_factura || 0;
  const saldoCalculado = Math.max(0, totalFactura - montoAbonado);

  useEffect(() => {
    if (order) {
      const abonado = order.monto_abonado || 0;
      setMontoAbonado(abonado);
      setEstadoPago(order.estado_pago || (abonado >= totalFactura && totalFactura > 0 ? 'pagado' : abonado > 0 ? 'parcial' : 'pendiente'));
      setFechaPromesa(order.fecha_promesa_pago || '');
      setMetodoPago(order.metodo_pago || 'Transferencia Bancaria');
      setComprobanteNota(order.nota || '');
      setFeedback(null);
    }
  }, [order, isOpen, totalFactura]);

  if (!isOpen || !order) return null;

  const handleMontoChange = (val: number) => {
    const safeVal = Math.max(0, Math.min(totalFactura, val));
    setMontoAbonado(safeVal);
    if (safeVal >= totalFactura && totalFactura > 0) {
      setEstadoPago('pagado');
    } else if (safeVal > 0) {
      setEstadoPago('parcial');
    } else {
      setEstadoPago('pendiente');
    }
  };

  const handleSetFullPayment = () => {
    setMontoAbonado(totalFactura);
    setEstadoPago('pagado');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      await onSavePayment(order.id, {
        monto_abonado: montoAbonado,
        saldo: saldoCalculado,
        estado_pago: estadoPago,
        fecha_promesa_pago: fechaPromesa,
        metodo_pago: metodoPago,
      });

      setFeedback({ type: 'success', text: '¡Registro de pago actualizado!' });
      setTimeout(() => {
        setLoading(false);
        onClose();
      }, 500);
    } catch (err: any) {
      console.error(err);
      setFeedback({ type: 'error', text: err.message || 'Error al guardar pago.' });
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#3C5866] text-white p-4 sm:p-4.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
              <DollarSign className="w-4 h-4 text-[#FFF3CD]" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white">
                Gestión de Pago - Pedido #{order.id}
              </h3>
              <p className="text-[11px] text-slate-200">
                Cliente: {order.cliente_nombre}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {feedback && (
            <div
              className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
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

          {/* Financial Summary Box */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 grid grid-cols-2 gap-3 text-center">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Factura</span>
              <span className="text-base font-black text-slate-900">
                {company.currencySymbol || '$'} {totalFactura.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Saldo Pendiente</span>
              <span className={`text-base font-black ${saldoCalculado > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {company.currencySymbol || '$'} {saldoCalculado.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Estado de Pago */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Estado de Pago
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setEstadoPago('pendiente');
                  setMontoAbonado(0);
                }}
                className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  estadoPago === 'pendiente'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pendiente
              </button>
              <button
                type="button"
                onClick={() => setEstadoPago('parcial')}
                className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  estadoPago === 'parcial'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Abono Parcial
              </button>
              <button
                type="button"
                onClick={handleSetFullPayment}
                className={`py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  estadoPago === 'pagado'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pagado Total
              </button>
            </div>
          </div>

          {/* Monto Abonado */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-bold text-slate-700 uppercase">
                Monto Abonado ({company.currencySymbol || '$'})
              </label>
              <button
                type="button"
                onClick={handleSetFullPayment}
                className="text-[10.5px] font-bold text-[#3C5866] hover:underline cursor-pointer"
              >
                Pagar total ({company.currencySymbol || '$'} {totalFactura})
              </button>
            </div>
            <div className="relative">
              <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number"
                min={0}
                max={totalFactura}
                step="any"
                value={montoAbonado}
                onChange={(e) => handleMontoChange(parseFloat(e.target.value) || 0)}
                className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              />
            </div>
          </div>

          {/* Fecha Establecida / Límite de Pago */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Fecha Acordada para Pago o Abono
            </label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={fechaPromesa}
                onChange={(e) => setFechaPromesa(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              />
            </div>
          </div>

          {/* Método de Pago */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
              Método de Pago
            </label>
            <div className="relative">
              <CreditCard className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#3C5866]"
              >
                <option value="Transferencia Bancaria">Transferencia Bancaria</option>
                <option value="SINPE Móvil">SINPE Móvil</option>
                <option value="Efectivo en Entrega">Efectivo contra Entrega</option>
                <option value="Tarjeta Débito/Crédito">Tarjeta Débito / Crédito</option>
                <option value="Crédito Comercial">Crédito Comercial</option>
              </select>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer text-center"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-5 py-2.5 text-xs font-extrabold text-white bg-[#3C5866] hover:bg-[#2c424e] rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Save className="w-4 h-4 text-[#FFF3CD]" />
              <span>{loading ? 'Guardando...' : 'Guardar Estado de Pago'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
