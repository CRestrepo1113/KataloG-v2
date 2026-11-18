import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CustomerOrder, CartItem, OrderItem, CompanyInfo } from './types';
import { formatSize, PRICE_TIER_LABELS, getBaseSku } from './theme';
import { getLocalProducts, getBranchOverride, getSharedProductImage } from './firestore';
import { sanitizeFileName } from './excelExport';

export interface ExportPdfItem {
  sku: string;
  name: string;
  size?: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  discountPercentage?: number;
  discountAmount?: number;
  tierName?: string;
  comment?: string;
  imageUrl?: string;
  filledWeight?: number;
}

export interface ExportPdfOptions {
  order?: CustomerOrder;
  items?: (CartItem | OrderItem | ExportPdfItem)[];
  customerName?: string;
  requestType?: 'PEDIDO' | string;
  tierName?: string;
  orderId?: string;
  createdAt?: string | Date;
  company: CompanyInfo;
  isAdmin?: boolean;
  whiteLabel?: boolean;
  documentTitle?: string;
}

// Caché en memoria para evitar recargar imágenes duplicadas en la misma exportación
const imageBase64Cache = new Map<string, Promise<string>>();

/**
 * Formatea montos numéricos limpios sin símbolo de moneda para PDF,
 * usando punto como separador de miles estándar.
 */
function formatCleanNumberPdf(amount: number): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0';
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Convierte una URL de imagen a string Base64 preservando transparencia (PNG)
 * para logotipos y rellenando con fondo blanco para imágenes JPEG.
 */
async function getBase64FromUrl(url: string, forcePng = false): Promise<string> {
  if (typeof window === 'undefined' || !url) return '';

  const cacheKey = `${url}_${forcePng ? 'png' : 'auto'}`;
  if (imageBase64Cache.has(cacheKey)) {
    return imageBase64Cache.get(cacheKey)!;
  }

  const promise = new Promise<string>((resolve) => {
    let isResolved = false;
    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        resolve('');
      }
    }, 3500);

    try {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      img.onload = () => {
        if (isResolved) return;
        isResolved = true;
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.min(img.naturalWidth || img.width || 64, 256);
          canvas.height = Math.min(img.naturalHeight || img.height || 64, 256);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            const isPng = forcePng || url.toLowerCase().includes('.png') || url.startsWith('data:image/png');
            if (isPng) {
              // Para PNG (como el logo), no pintar fondo opaco; preservar transparencia alfa
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/png');
              resolve(dataUrl);
            } else {
              // Para JPEG, rellenar fondo blanco antes de pintar para evitar que transparencias se vuelvan negras
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
              resolve(dataUrl);
            }
          } else {
            resolve('');
          }
        } catch {
          resolve('');
        }
      };
      img.onerror = () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          resolve('');
        }
      };
    } catch {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timer);
        resolve('');
      }
    }
  });

  imageBase64Cache.set(cacheKey, promise);
  return promise;
}

function cleanSkuString(str: string): string {
  if (!str) return '';
  return str
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Normaliza ítems desde CustomerOrder, CartItem, etc.
 */
function normalizeItems(options: ExportPdfOptions): ExportPdfItem[] {
  const masterProducts = getLocalProducts();
  const branchSlug = options.order?.sucursal || options.company?.tenantId;

  const resolveFilledWeight = (rawWeight?: number, sku?: string): number => {
    if (rawWeight !== undefined && rawWeight !== null && Number(rawWeight) > 0) {
      return Number(rawWeight);
    }
    if (!sku) return 0;
    const targetSku = cleanSkuString(sku);
    const targetBase = getBaseSku(targetSku);

    const prod = masterProducts.find((p) => {
      const pSku = cleanSkuString(p.sku);
      return pSku === targetSku || (targetBase && getBaseSku(pSku) === targetBase);
    });

    if (prod) {
      const override = getBranchOverride(prod, branchSlug);
      const w =
        override?.filledWeight !== undefined && override?.filledWeight !== null && Number(override.filledWeight) > 0
          ? override.filledWeight
          : prod.filledWeight;
      return Number(w) || 0;
    }
    return 0;
  };

  const localProds = getLocalProducts();
  const resolveImageUrl = (rawImg?: string, sku?: string): string => {
    if (rawImg && rawImg.trim() && rawImg !== '/assets/REF_1.jpg' && !rawImg.includes('REF_1.jpg')) {
      return rawImg;
    }
    if (!sku) return '';
    const shared = getSharedProductImage(sku, '');
    if (shared && !shared.includes('REF_1.jpg')) return shared;
    const found = localProds.find((p) => p.sku === sku);
    if (found?.processedImageUrl && !found.processedImageUrl.includes('REF_1.jpg')) {
      return found.processedImageUrl;
    }
    return found?.originalImageUrl || '';
  };

  if (options.order && options.order.items) {
    const tier = PRICE_TIER_LABELS[options.order.tarifa_aplicada || 'wholesale'] || 'Mayorista';
    return options.order.items.map((it) => {
      const lineGross = (it.precio_unitario || 0) * (it.cantidad || 1);
      const discountPct = it.descuento_porcentaje || 0;
      const discountAmt = it.descuento_monto !== undefined ? it.descuento_monto : lineGross * (discountPct / 100);
      const subtotal = it.subtotal !== undefined ? it.subtotal : lineGross - discountAmt;
      const resolvedWeight = resolveFilledWeight(it.gramos_relleno, it.referencia);
      const resolvedImg = resolveImageUrl(it.imagen_url, it.referencia);

      return {
        sku: it.referencia || '',
        name: it.descripcion || '',
        size: it.medida || '',
        quantity: it.cantidad || 1,
        unitPrice: it.precio_unitario || 0,
        subtotal,
        discountPercentage: discountPct,
        discountAmount: discountAmt,
        tierName: tier,
        comment: it.comentario || '',
        imageUrl: resolvedImg,
        filledWeight: resolvedWeight,
      };
    });
  }

  if (options.items) {
    return options.items.map((item) => {
      if ('product' in item) {
        const p = item.product;
        const tier = options.tierName || 'Mayorista';
        const unitPrice =
          tier === 'Unidad'
            ? p.prices.unit
            : tier === 'Docena'
            ? p.prices.dozen
            : p.prices.wholesale || p.prices.unit || 0;
        const resolvedWeight = resolveFilledWeight(p.filledWeight, p.sku);
        const resolvedImg = resolveImageUrl(p.processedImageUrl || p.originalImageUrl, p.sku);

        return {
          sku: p.sku || '',
          name: p.name || '',
          size: p.size || '',
          quantity: item.quantity || 1,
          unitPrice,
          subtotal: unitPrice * (item.quantity || 1),
          tierName: tier,
          comment: item.comment || '',
          imageUrl: resolvedImg,
          filledWeight: resolvedWeight,
        };
      }

      if ('referencia' in item) {
        const lineGross = (item.precio_unitario || 0) * (item.cantidad || 1);
        const discountPct = item.descuento_porcentaje || 0;
        const discountAmt = item.descuento_monto !== undefined ? item.descuento_monto : lineGross * (discountPct / 100);
        const subtotal = item.subtotal !== undefined ? item.subtotal : lineGross - discountAmt;
        const resolvedWeight = resolveFilledWeight(item.gramos_relleno, item.referencia);
        const resolvedImg = resolveImageUrl(item.imagen_url, item.referencia);

        return {
          sku: item.referencia || '',
          name: item.descripcion || '',
          size: item.medida || '',
          quantity: item.cantidad || 1,
          unitPrice: item.precio_unitario || 0,
          subtotal,
          discountPercentage: discountPct,
          discountAmount: discountAmt,
          tierName: options.tierName || 'Mayorista',
          comment: item.comentario || '',
          imageUrl: resolvedImg,
          filledWeight: resolvedWeight,
        };
      }

      const normalizedItem = item as ExportPdfItem;
      return {
        ...normalizedItem,
        filledWeight: resolveFilledWeight(normalizedItem.filledWeight, normalizedItem.sku),
        imageUrl: resolveImageUrl(normalizedItem.imageUrl, normalizedItem.sku),
      };
    });
  }

  return [];
}

/**
 * Genera y descarga el comprobante en PDF con diseño corporativo elegante:
 * - Página 1: Resumen Comercial / Financiero
 * - Página 2+: Pedido con Imágenes / Alistamiento
 */
export async function downloadOrderPdf(options: ExportPdfOptions): Promise<void> {
  const { order, company, whiteLabel = false } = options;
  const normalizedItems = normalizeItems(options);

  if (normalizedItems.length === 0) {
    console.warn('No hay ítems para exportar a PDF.');
    return;
  }

  const cleanClientName = (
    order?.cliente_nombre ||
    options.customerName ||
    'CLIENTE'
  )
    .trim()
    .toUpperCase();

  const activeTierName =
    options.tierName ||
    order?.tarifa_nombre ||
    (order?.tarifa_aplicada ? (PRICE_TIER_LABELS[order.tarifa_aplicada] || String(order.tarifa_aplicada)) : null) ||
    'Mayorista';

  const orderDate = order?.creado_en
    ? new Date(order.creado_en)
    : options.createdAt
    ? new Date(options.createdAt)
    : new Date();

  const day = String(orderDate.getDate()).padStart(2, '0');
  const month = String(orderDate.getMonth() + 1).padStart(2, '0');
  const year = orderDate.getFullYear();
  const hours = String(orderDate.getHours()).padStart(2, '0');
  const minutes = String(orderDate.getMinutes()).padStart(2, '0');

  const folioId = order?.id || options.orderId || '';
  const folioText = folioId ? `#${folioId}` : 'S/F';
  const currencyCode = company.currencyCode || 'CRC';

  const totalUnits = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);

  // Cálculos financieros
  const calculatedGross = normalizedItems.reduce((acc, it) => acc + it.unitPrice * it.quantity, 0);
  const calculatedItemsDisc = normalizedItems.reduce((acc, it) => acc + (it.discountAmount || 0), 0);
  const calculatedGenDisc =
    order?.descuento_general ||
    (order?.descuento_porcentaje_general
      ? (calculatedGross - calculatedItemsDisc) * (order.descuento_porcentaje_general / 100)
      : 0);
  const totalDiscounts =
    order?.descuento_total !== undefined
      ? order.descuento_total
      : calculatedItemsDisc + calculatedGenDisc;
  const finalInvoiceTotal =
    order?.total_factura !== undefined
      ? order.total_factura
      : Math.max(0, calculatedGross - totalDiscounts);

  // En modo Marca Blanca (whiteLabel), omitir logotipo e identidad de KYG
  const logoUrl = whiteLabel ? '' : (company.logoUrl || '/assets/Logo.png');
  const logoBase64 = logoUrl ? await getBase64FromUrl(logoUrl, true) : '';

  const productImagesBase64 = await Promise.all(
    normalizedItems.map((item) => {
      const imgUrl =
        item.imageUrl && item.imageUrl !== '/assets/REF_1.jpg' && !item.imageUrl.includes('REF_1.jpg')
          ? item.imageUrl
          : '';
      return getBase64FromUrl(imgUrl, false);
    })
  );

  // Crear documento jsPDF (Formato Carta en mm: 215.9 x 279.4)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
    compress: true,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 187.9 mm

  // =========================================================================
  // PÁGINA 1: RESUMEN COMERCIAL Y FINANCIERO
  // =========================================================================

  let currentY = margin;

  // 1. Logotipo y Membrete (ocultando datos de KYG si es whiteLabel)
  if (!whiteLabel) {
    if (logoBase64) {
      try {
        const format = logoBase64.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(logoBase64, format, margin, currentY, 20, 20);
      } catch {}
    }

    const headerLeftX = logoBase64 ? margin + 25 : margin;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(30, 58, 95);
    doc.text(company.name.toUpperCase(), headerLeftX, currentY + 5);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(195, 125, 65);
    doc.text(company.slogan || 'Peluches con Alma', headerLeftX, currentY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(company.address || company.country || 'Costa Rica', headerLeftX, currentY + 15);
    doc.text(`Tel: ${company.phone || ''}`, headerLeftX, currentY + 19.5);

    currentY += 25;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(30, 58, 95);
    doc.text((options.documentTitle || 'COMPROBANTE DE PEDIDO').toUpperCase(), margin, currentY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Resumen detallado de artículos y precios', margin, currentY + 12);

    currentY += 17;
  }

  // 2. Barra de Solicitud
  doc.setFillColor(142, 170, 219);
  doc.roundedRect(margin, currentY, contentWidth, 8.5, 1.5, 1.5, 'F');

  const invoiceBannerText = !whiteLabel && order?.facturado && order?.numero_factura ? ` | FACTURA: #${order.numero_factura}` : '';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`SOLICITUD: PEDIDO | FOLIO: ${folioText}${invoiceBannerText}`, margin + 3, currentY + 5.5);

  const bannerRightText = `FECHA: ${day}/${month}/${year} ${hours}:${minutes}`;
  doc.text(bannerRightText, pageWidth - margin - 3, currentY + 5.5, { align: 'right' });

  currentY += 12;

  // 3. Bloque de Datos (Cliente & Detalles del Pedido)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, currentY, contentWidth, 18, 2, 2, 'FD');

  const halfWidth = contentWidth / 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('CLIENTE / NEGOCIO:', margin + 3, currentY + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(cleanClientName, margin + 3, currentY + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    whiteLabel ? `Artículos: ${totalUnits} u.` : `Sucursal: ${(company.country || 'Central').toUpperCase()}`,
    margin + 3,
    currentY + 15
  );

  doc.setDrawColor(226, 232, 240);
  doc.line(margin + halfWidth, currentY + 2, margin + halfWidth, currentY + 16);

  const rightColX = margin + halfWidth + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('CONDICIONES COMERCIALES:', rightColX, currentY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(whiteLabel ? 'Modalidad: ' : 'Tarifa: ', rightColX, currentY + 10.5);
  doc.setFont('helvetica', 'bold');
  doc.text(whiteLabel ? 'VENTA DIRECTA' : activeTierName.toUpperCase(), rightColX + (whiteLabel ? 17 : 11), currentY + 10.5);

  doc.setFont('helvetica', 'normal');
  const safeCurrencyText = currencyCode.toUpperCase();
  if (!whiteLabel && order?.facturado && order?.numero_factura) {
    doc.text(`Factura Oficial: #${order.numero_factura}`, rightColX, currentY + 15);
  } else {
    doc.text(`Moneda: ${safeCurrencyText}`, rightColX, currentY + 15);
  }

  currentY += 22;

  // 4. Tabla de Productos
  const colCant = 14;
  const colDesc = 70;
  const colPrecio = 25;
  const colTarifa = 20;
  const colSub = 25;
  const colNota = 33.9;

  const tableBody = normalizedItems.map((item) => {
    const sizeStr = item.size ? ` [${formatSize(item.size)}]` : '';
    const discountStr = item.discountPercentage && item.discountPercentage > 0 ? ` (-${item.discountPercentage}%)` : '';
    return [
      item.quantity.toString(),
      `${item.sku} - ${item.name}${sizeStr}${discountStr}`,
      formatCleanNumberPdf(item.unitPrice),
      whiteLabel ? 'Venta' : (item.tierName || activeTierName),
      formatCleanNumberPdf(item.subtotal),
      item.comment && item.comment.trim() ? item.comment.trim() : '-',
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [[
      'CANT.',
      'CÓDIGO Y DESCRIPCIÓN',
      `PRECIO UNIT.\n(${currencyCode.toUpperCase()})`,
      'TARIFA',
      `SUBTOTAL\n(${currencyCode.toUpperCase()})`,
      'ESPECIFICACIONES / NOTA',
    ]],
    body: tableBody,
    theme: 'plain',
    headStyles: {
      fillColor: [142, 170, 219],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
    },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: 'middle',
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: colCant },
      1: { halign: 'left', cellWidth: colDesc },
      2: { halign: 'right', cellWidth: colPrecio },
      3: { halign: 'center', cellWidth: colTarifa },
      4: { halign: 'right', cellWidth: colSub },
      5: { halign: 'left', cellWidth: colNota },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  // @ts-expect-error - jspdf-autotable agrega lastAutoTable en el prototipo
  let finalY: number = doc.lastAutoTable?.finalY || currentY + 30;

  // 5. Bloque de Totales y Descuentos
  if (finalY + 32 > pageHeight - margin) {
    doc.addPage('letter', 'portrait');
    finalY = margin + 5;
  }

  const totalsBoxWidth = 85;
  const totalsBoxX = pageWidth - margin - totalsBoxWidth;
  let totalsY = finalY + 4;

  if (totalDiscounts > 0) {
    // Subtotal Bruto
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`SUBTOTAL BRUTO (${currencyCode.toUpperCase()}):`, totalsBoxX, totalsY);
    doc.text(formatCleanNumberPdf(calculatedGross), pageWidth - margin, totalsY, { align: 'right' });
    totalsY += 5;

    // Descuentos
    doc.setTextColor(4, 120, 87); // Verde esmeralda
    doc.text(`DESCUENTOS (${currencyCode.toUpperCase()}):`, totalsBoxX, totalsY);
    doc.text(`-${formatCleanNumberPdf(totalDiscounts)}`, pageWidth - margin, totalsY, { align: 'right' });
    totalsY += 5;
  }

  // Cuadro Destacado de TOTAL FACTURA / ESTIMADO
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(totalsBoxX - 2, totalsY - 1, totalsBoxWidth + 2, 9, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  const totalLabel = whiteLabel ? 'TOTAL' : 'TOTAL FACTURA';
  doc.text(`${totalLabel} (${currencyCode.toUpperCase()}):`, totalsBoxX + 2, totalsY + 5.5);

  doc.setFontSize(10.5);
  doc.setTextColor(195, 125, 65); // #C37D41
  doc.text(formatCleanNumberPdf(finalInvoiceTotal), pageWidth - margin - 2, totalsY + 5.5, { align: 'right' });

  // Pie de Página 1
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    whiteLabel
      ? 'Comprobante de pedido generado con detalle de artículos.'
      : 'Estimado cliente, este documento confirma los artículos registrados en su solicitud. Gracias por su preferencia.',
    margin,
    pageHeight - margin
  );

  // =========================================================================
  // PÁGINA 2 EN ADELANTE: PEDIDO CON IMÁGENES / ALISTAMIENTO VISUAL
  // =========================================================================
  doc.addPage('letter', 'portrait');
  let page2Y = margin;

  if (!whiteLabel && logoBase64) {
    try {
      const format = logoBase64.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoBase64, format, margin, page2Y, 14, 14);
    } catch {}
  }

  const p2HeaderX = !whiteLabel && logoBase64 ? margin + 18 : margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 58, 95);
  doc.text(
    whiteLabel ? 'DETALLE VISUAL DE ARTÍCULOS' : `${company.name.toUpperCase()} - PEDIDO CON IMÁGENES`,
    p2HeaderX,
    page2Y + 5.5
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(195, 125, 65);
  const page2Invoice = !whiteLabel && order?.facturado && order?.numero_factura ? `  |  FACTURA: #${order.numero_factura}` : '';
  doc.text(`CLIENTE: ${cleanClientName}  |  FOLIO: ${folioText}${page2Invoice}  |  FECHA: ${day}/${month}/${year}`, p2HeaderX, page2Y + 11);

  page2Y += 17;

  // Tabla con Miniaturas de Productos
  const imgColFoto = 20;
  const imgColCodigo = 28;
  const imgColDesc = 72;
  const imgColCant = 18;
  const imgColNota = 49.9;

  const imageTableBody = normalizedItems.map((item) => {
    const sizeStr = item.size ? ` [${formatSize(item.size)}]` : '';
    return [
      '', // Celda de foto (dibujada en didDrawCell)
      item.sku,
      `${item.name}${sizeStr}`,
      item.quantity.toString(),
      item.comment && item.comment.trim() ? item.comment.trim() : '-',
    ];
  });

  autoTable(doc, {
    startY: page2Y,
    margin: { left: margin, right: margin },
    head: [['FOTO', 'CÓDIGO', 'DESCRIPCIÓN Y MEDIDA', 'CANT.', 'ESPECIFICACIONES / NOTA']],
    body: imageTableBody,
    theme: 'plain',
    headStyles: {
      fillColor: [142, 170, 219],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
      cellPadding: { top: 3, right: 2.5, bottom: 3, left: 2.5 },
    },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 2.5, right: 2.5, bottom: 2.5, left: 2.5 },
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      minCellHeight: 18, // Altura suficiente para la miniatura
      valign: 'middle',
      overflow: 'linebreak',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: imgColFoto },
      1: { halign: 'left', cellWidth: imgColCodigo, fontStyle: 'bold' },
      2: { halign: 'left', cellWidth: imgColDesc },
      3: { halign: 'center', cellWidth: imgColCant, fontStyle: 'bold' },
      4: { halign: 'left', cellWidth: imgColNota },
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    didDrawCell: (data) => {
      // Dibujar miniatura de foto en la columna 0 del cuerpo
      if (data.section === 'body' && data.column.index === 0) {
        const itemIdx = data.row.index;
        const imgData = productImagesBase64[itemIdx];
        if (imgData) {
          try {
            const imgSize = 14;
            const xPos = data.cell.x + (data.cell.width - imgSize) / 2;
            const yPos = data.cell.y + (data.cell.height - imgSize) / 2;
            const format = imgData.startsWith('data:image/png') ? 'PNG' : 'JPEG';
            doc.addImage(imgData, format, xPos, yPos, imgSize, imgSize);
          } catch {}
        }
      }
    },
  });

  // @ts-expect-error - jspdf-autotable agrega lastAutoTable
  const page2FinalY: number = doc.lastAutoTable?.finalY || page2Y + 40;

  // Fila Resumen de Unidades Totales
  let totalUnitsY = page2FinalY + 4;
  if (totalUnitsY + 12 > pageHeight - margin) {
    doc.addPage('letter', 'portrait');
    totalUnitsY = margin + 5;
  }

  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, totalUnitsY, contentWidth, 8.5, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('TOTAL UNIDADES A DESPACHAR:', margin + 4, totalUnitsY + 5.5);

  doc.setFontSize(10);
  doc.setTextColor(195, 125, 65);
  doc.text(`${totalUnits} unidades`, pageWidth - margin - 4, totalUnitsY + 5.5, { align: 'right' });

  // Guardar archivo PDF con nombre estandarizado
  const cleanNameForFile = sanitizeFileName(cleanClientName, 'CLIENTE').toUpperCase();
  const cleanFolio = sanitizeFileName(folioId, 'SINFOLIO');
  const dateFormatted = `${day}.${month}.${year}`;
  const prefix = whiteLabel ? 'COMP' : 'PED';
  const fileName = `${prefix}_${cleanFolio}_${cleanNameForFile}_${dateFormatted}.pdf`;

  doc.save(fileName);
}
