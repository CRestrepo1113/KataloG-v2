import ExcelJS from 'exceljs';
import { CustomerOrder, CartItem, OrderItem, CompanyInfo } from './types';
import { formatSize, PRICE_TIER_LABELS, getBaseSku } from './theme';
import { getLocalProducts, getBranchOverride, getSharedProductImage } from './firestore';

export interface ExportExcelItem {
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
  filledWeight?: number; // Gramos de relleno por unidad
}

export interface ExportExcelOptions {
  order?: CustomerOrder;
  items?: (CartItem | OrderItem | ExportExcelItem)[];
  customerName?: string;
  requestType?: 'PEDIDO' | string;
  tierName?: string;
  orderId?: string;
  createdAt?: string | Date;
  company: CompanyInfo;
  isAdmin?: boolean;
}

// In-memory cache to prevent downloading/rendering duplicate images in the same export run
const imageBase64Cache = new Map<string, Promise<string>>();

/**
 * Sanitiza valores de texto para prevenir ataques de inyección de fórmulas en Excel (CWE-1236 / CSV Injection).
 * Si un texto empieza con '=', '+', '-', '@', '\t' o '\r', se precede con un apóstrofe para forzar tipo texto.
 */
export function sanitizeExcelText(val: string | undefined | null): string {
  if (!val) return '';
  const str = String(val).trim();
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Sanitiza nombres de archivo para descargas seguras en cualquier sistema operativo.
 */
export function sanitizeFileName(val: string | undefined | null, fallback = 'ARCHIVO'): string {
  if (!val) return fallback;
  const sanitized = String(val)
    .replace(/[\x00-\x1f\x7f\\/?%*:|"<>#]/g, '')
    .replace(/\.\.+/g, '')
    .replace(/\s+/g, '_')
    .trim()
    .substring(0, 60);
  return sanitized || fallback;
}

/**
 * Convierte una URL de imagen a string Base64 (PNG) usando Canvas del navegador con caché y timeout de seguridad.
 */
async function getBase64FromUrl(url: string): Promise<string> {
  if (typeof window === 'undefined' || !url) return '';

  if (imageBase64Cache.has(url)) {
    return imageBase64Cache.get(url)!;
  }

  const promise = new Promise<string>((resolve) => {
    let isResolved = false;
    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        resolve('');
      }
    }, 3500); // 3.5s timeout para evitar bloqueos por imágenes externas caídas

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
          canvas.width = Math.min(img.naturalWidth || img.width || 48, 256);
          canvas.height = Math.min(img.naturalHeight || img.height || 48, 256);
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            resolve(dataUrl.split(',')[1] || '');
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

  imageBase64Cache.set(url, promise);
  return promise;
}

/**
 * Función segura para fusionar celdas en ExcelJS evitando errores de rango
 */
function safeMerge(worksheet: ExcelJS.Worksheet, range: string) {
  try {
    worksheet.mergeCells(range);
  } catch {
    // Si ya están fusionadas o fuera de rango, ignorar silenciosamente
  }
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
 * Normaliza los ítems de diferentes fuentes (CustomerOrder, CartItem, etc.) a un formato estándar.
 */
function normalizeItems(options: ExportExcelOptions): ExportExcelItem[] {
  const masterProducts = getLocalProducts();
  const branchSlug = options.order?.sucursal || options.company?.tenantId;

  // Helper de búsqueda inteligente para resolver el peso con relleno desde el catálogo si la orden no lo tenía
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
      // CartItem format
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

      // OrderItem format
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

      // Already normalized
      const normalizedItem = item as ExportExcelItem;
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
 * Genera y descarga el archivo Excel del pedido con diseño profesional,
 * incluyendo Hoja 1 (Resumen Comercial) y Hoja 2 (Pedido con Imágenes / Alistamiento).
 */
export async function downloadOrderExcel(options: ExportExcelOptions): Promise<void> {
  const { order, company, isAdmin = false } = options;

  const normalizedItems = normalizeItems(options);
  if (normalizedItems.length === 0) {
    console.warn('No hay ítems para exportar a Excel.');
    return;
  }

  const cleanClientName = (
    order?.cliente_nombre ||
    options.customerName ||
    'CLIENTE'
  )
    .trim()
    .toUpperCase();

  const typeLabel = 'PEDIDO';
  const activeTierName =
    options.tierName ||
    (order?.tarifa_aplicada ? PRICE_TIER_LABELS[order.tarifa_aplicada] : null) ||
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
  const folioText = folioId ? ` | FOLIO: #${folioId}` : '';
  const invoiceText = order?.facturado && order?.numero_factura ? ` | FACTURA: #${order.numero_factura}` : '';
  const dateTimeFormatted = `FECHA: ${day}/${month}/${year}, ${hours}:${minutes}${folioText}${invoiceText}`;

  const total =
    order?.total_factura !== undefined
      ? order.total_factura
      : normalizedItems.reduce((acc, it) => acc + it.subtotal, 0);

  const totalUnits = normalizedItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalGrams = normalizedItems.reduce((sum, item) => sum + (item.filledWeight || 0) * item.quantity, 0);

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = company.name || 'KYG DISTRIBUCIONES';
    workbook.created = orderDate;

    // ==========================================
    // PÁGINA 1: HOJA DE RESUMEN COMERCIAL
    // ==========================================
    const worksheet = workbook.addWorksheet(typeLabel, {
      views: [{ showGridLines: true }],
    });

    // Ancho optimizado de columnas para evitar textos cortados
    worksheet.columns = [
      { key: 'cant', width: 14 },
      { key: 'descripcion', width: 48 },
      { key: 'precio', width: 18 },
      { key: 'tarifa', width: 16 },
      { key: 'subtotal', width: 20 },
      { key: 'nota', width: 34 },
    ];

    // Cargar logotipo en Base64
    const logoUrl = company.logoUrl || '/assets/Logo.png';
    const logoBase64 = await getBase64FromUrl(logoUrl);

    if (logoBase64) {
      const imageId = workbook.addImage({
        base64: logoBase64,
        extension: 'png',
      });
      // Posicionar logo alineado en columna A/B sin sobreponerse
      worksheet.addImage(imageId, {
        tl: { col: 0.2, row: 0.2 },
        ext: { width: 68, height: 68 },
        editAs: 'undefined',
      });
    }

    // Fila 1 - 4: Encabezado de Marca
    worksheet.addRow([]);
    worksheet.getRow(1).height = 14;

    const titleRow = worksheet.addRow(['', '', '', '', '', '']);
    const titleRowNum = titleRow.number;
    titleRow.height = 28;
    safeMerge(worksheet, `B${titleRowNum}:F${titleRowNum}`);
    const titleCell = worksheet.getCell(`B${titleRowNum}`);
    titleCell.value = company.name.toUpperCase();
    titleCell.font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF1E3A5F' } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    const sloganRow = worksheet.addRow(['', '', '', '', '', '']);
    const sloganRowNum = sloganRow.number;
    sloganRow.height = 22;
    safeMerge(worksheet, `B${sloganRowNum}:F${sloganRowNum}`);
    const sloganCell = worksheet.getCell(`B${sloganRowNum}`);
    sloganCell.value = company.slogan || 'Peluches con Alma';
    sloganCell.font = { name: 'Arial', size: 11, bold: true, italic: true, color: { argb: 'FFC37D41' } };
    sloganCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    worksheet.addRow([]); // Fila 4 vacía
    worksheet.getRow(4).height = 8;

    // Fila 5: Barra Superior Azul
    const bannerRow = worksheet.addRow(['', '', '', '', '', '']);
    const bannerRowNum = bannerRow.number;
    bannerRow.height = 26;

    safeMerge(worksheet, `A${bannerRowNum}:C${bannerRowNum}`);
    safeMerge(worksheet, `D${bannerRowNum}:F${bannerRowNum}`);

    const leftBannerCell = worksheet.getCell(`A${bannerRowNum}`);
    leftBannerCell.value = dateTimeFormatted;
    leftBannerCell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF000000' } };
    leftBannerCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    const rightBannerCell = worksheet.getCell(`D${bannerRowNum}`);
    rightBannerCell.value = `WHATSAPP PEDIDOS: ${company.phone}`;
    rightBannerCell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF000000' } };
    rightBannerCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

    const blueFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF8EAADB' },
    };

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF475569' } },
      bottom: { style: 'thin', color: { argb: 'FF475569' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } },
    };

    for (let c = 1; c <= 6; c++) {
      const cell = bannerRow.getCell(c);
      cell.fill = blueFill;
      cell.border = thinBorder;
    }

    // Fila 6: Títulos de Sección (CLIENTE | DETALLES)
    const sectionRow = worksheet.addRow(['CLIENTE', '', '', 'DETALLES', '', '']);
    const sectionRowNum = sectionRow.number;
    sectionRow.height = 22;
    safeMerge(worksheet, `A${sectionRowNum}:C${sectionRowNum}`);
    safeMerge(worksheet, `D${sectionRowNum}:F${sectionRowNum}`);

    sectionRow.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
    sectionRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    sectionRow.getCell(1).border = { bottom: { style: 'thin', color: { argb: 'FF1E293B' } } };

    sectionRow.getCell(4).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
    sectionRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    sectionRow.getCell(4).border = { bottom: { style: 'thin', color: { argb: 'FF1E293B' } } };

    // Filas 7 - 9: Datos de CLIENTE y DETALLES
    const addDetailRow = (labelLeft: string, valLeft: string, labelRight: string, valRight: string) => {
      const r = worksheet.addRow([labelLeft, valLeft, '', labelRight, valRight, '']);
      r.height = 20;
      const rNum = r.number;
      safeMerge(worksheet, `B${rNum}:C${rNum}`);
      safeMerge(worksheet, `E${rNum}:F${rNum}`);

      r.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
      r.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

      r.getCell(2).font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
      r.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

      r.getCell(4).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1E293B' } };
      r.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };

      r.getCell(5).font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } };
      r.getCell(5).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    };

    addDetailRow('Nombre', cleanClientName, 'Sucursal', company.country || company.name);
    addDetailRow(
      'Tipo Solicitud',
      typeLabel,
      'Moneda',
      `${company.currencyCode || 'USD'} (${company.currencySymbol || '$'})`
    );
    addDetailRow('Tarifa', activeTierName, 'Atiende', company.name);
    if (order?.facturado && order?.numero_factura) {
      addDetailRow('Factura Oficial', `#${order.numero_factura}`, 'Estado Fact.', 'EMITIDA');
    }

    worksheet.addRow([]); // Fila 10 vacía
    worksheet.getRow(10).height = 10;

    // Fila 11: Encabezado de la Tabla de Productos
    const headerRow = worksheet.addRow([
      'CANT.',
      'CODIGO Y DESCRIPCION',
      'PRECIO UNIDAD',
      'TARIFA',
      'SUBTOTAL',
      'ESPECIFICACIONES / NOTA',
    ]);
    headerRow.height = 24;

    for (let c = 1; c <= 6; c++) {
      const cell = headerRow.getCell(c);
      cell.fill = blueFill;
      cell.border = thinBorder;
      cell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF000000' } };
    }

    headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    headerRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    headerRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    headerRow.getCell(6).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    // Filas de Productos
    normalizedItems.forEach((item) => {
      const sizeText = item.size ? ` [${formatSize(item.size)}]` : '';
      const discountLabel = (item.discountPercentage && item.discountPercentage > 0) ? ` (-${item.discountPercentage}% desc.)` : '';
      const rawDesc = `${item.sku} - ${item.name}${sizeText}${discountLabel}`;
      const description = sanitizeExcelText(rawDesc);

      const itemRow = worksheet.addRow([
        Math.max(1, Math.floor(Number(item.quantity) || 1)),
        description,
        Math.max(0, Number(item.unitPrice) || 0),
        sanitizeExcelText(item.tierName || activeTierName),
        Math.max(0, Number(item.subtotal) || 0),
        sanitizeExcelText(item.comment || '-'),
      ]);
      itemRow.height = 21;

      for (let c = 1; c <= 6; c++) {
        const cell = itemRow.getCell(c);
        cell.border = thinBorder;
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF0F172A' } };
      }

      itemRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      itemRow.getCell(1).numFmt = '#,##0';

      itemRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

      itemRow.getCell(3).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      itemRow.getCell(3).numFmt = '#,##0.00';

      itemRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

      itemRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      itemRow.getCell(5).numFmt = '#,##0.00';
      if (item.discountPercentage && item.discountPercentage > 0) {
        itemRow.getCell(5).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF047857' } };
      }

      itemRow.getCell(6).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    });

    // Cálculos de Totales y Descuentos
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

    const totalFill: ExcelJS.Fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };

    if (totalDiscounts > 0) {
      // 1. Subtotal Bruto
      const brutoRow = worksheet.addRow(['SUBTOTAL BRUTO:', '', '', '', calculatedGross, '']);
      brutoRow.height = 20;
      const brutoRowNum = brutoRow.number;
      safeMerge(worksheet, `A${brutoRowNum}:D${brutoRowNum}`);
      for (let c = 1; c <= 6; c++) {
        const cell = brutoRow.getCell(c);
        cell.fill = totalFill;
        cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
      }
      brutoRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF475569' } };
      brutoRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      brutoRow.getCell(5).font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF334155' } };
      brutoRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      brutoRow.getCell(5).numFmt = `"${company.currencySymbol || '$'} "#,##0.00`;

      // 2. Descuento en Referencias (si aplica)
      if (calculatedItemsDisc > 0) {
        const itemDiscRow = worksheet.addRow(['DESCUENTO EN REFERENCIAS:', '', '', '', -calculatedItemsDisc, '']);
        itemDiscRow.height = 20;
        const itemDiscRowNum = itemDiscRow.number;
        safeMerge(worksheet, `A${itemDiscRowNum}:D${itemDiscRowNum}`);
        for (let c = 1; c <= 6; c++) {
          const cell = itemDiscRow.getCell(c);
          cell.fill = totalFill;
          cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        }
        itemDiscRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF047857' } };
        itemDiscRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        itemDiscRow.getCell(5).font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF047857' } };
        itemDiscRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        itemDiscRow.getCell(5).numFmt = `"-${company.currencySymbol || '$'} "#,##0.00`;
      }

      // 3. Descuento General (si aplica)
      if (calculatedGenDisc > 0) {
        const genLabel = order?.descuento_porcentaje_general
          ? `DESCUENTO GENERAL (${order.descuento_porcentaje_general}%):`
          : 'DESCUENTO GENERAL DE FACTURA:';
        const genDiscRow = worksheet.addRow([genLabel, '', '', '', -calculatedGenDisc, '']);
        genDiscRow.height = 20;
        const genDiscRowNum = genDiscRow.number;
        safeMerge(worksheet, `A${genDiscRowNum}:D${genDiscRowNum}`);
        for (let c = 1; c <= 6; c++) {
          const cell = genDiscRow.getCell(c);
          cell.fill = totalFill;
          cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5E1' } }, bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } } };
        }
        genDiscRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF047857' } };
        genDiscRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        genDiscRow.getCell(5).font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF047857' } };
        genDiscRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
        genDiscRow.getCell(5).numFmt = `"-${company.currencySymbol || '$'} "#,##0.00`;
      }

      // 4. Total Descuentos Aplicados
      const totalDiscRow = worksheet.addRow(['TOTAL DESCUENTOS APLICADOS:', '', '', '', -totalDiscounts, '']);
      totalDiscRow.height = 22;
      const totalDiscRowNum = totalDiscRow.number;
      safeMerge(worksheet, `A${totalDiscRowNum}:D${totalDiscRowNum}`);
      for (let c = 1; c <= 6; c++) {
        const cell = totalDiscRow.getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } };
        cell.border = { top: { style: 'thin', color: { argb: 'FF6EE7B7' } }, bottom: { style: 'thin', color: { argb: 'FF6EE7B7' } } };
      }
      totalDiscRow.getCell(1).font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF065F46' } };
      totalDiscRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      totalDiscRow.getCell(5).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF065F46' } };
      totalDiscRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
      totalDiscRow.getCell(5).numFmt = `"-${company.currencySymbol || '$'} "#,##0.00`;
    }

    // Fila de Total Factura Final
    const totalRowLabel = 'TOTAL FACTURA:';
    const totalRow = worksheet.addRow([totalRowLabel, '', '', '', finalInvoiceTotal, '']);
    totalRow.height = 26;
    const totalRowNum = totalRow.number;

    safeMerge(worksheet, `A${totalRowNum}:D${totalRowNum}`);

    for (let c = 1; c <= 6; c++) {
      const cell = totalRow.getCell(c);
      cell.fill = totalFill;
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'double', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    }

    totalRow.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF000000' } };
    totalRow.getCell(1).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

    totalRow.getCell(5).font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFC37D41' } };
    totalRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
    totalRow.getCell(5).numFmt = `"${company.currencySymbol || '$'} "#,##0.00`;

    // ==========================================
    // PÁGINA 2: HOJA DE PEDIDO CON IMÁGENES / PRODUCCIÓN
    // ==========================================
    const productImagesBase64 = await Promise.all(
      normalizedItems.map((item) => {
        const imgUrl =
          item.imageUrl &&
          item.imageUrl !== '/assets/REF_1.jpg' &&
          !item.imageUrl.includes('REF_1.jpg')
            ? item.imageUrl
            : '';
        return getBase64FromUrl(imgUrl);
      })
    );

    const sheet2Name = isAdmin ? 'PRODUCCIÓN' : 'PEDIDO CON IMAGENES';
    const worksheetAlistamiento = workbook.addWorksheet(sheet2Name, {
      views: [{ showGridLines: true }],
    });

    if (isAdmin) {
      // 9 Columnas para Administrador / Bodega / Alistamiento
      worksheetAlistamiento.columns = [
        { key: 'foto', width: 8.5 }, // Mismo ancho de la foto (48px)
        { key: 'codigo', width: 15 },
        { key: 'descripcion', width: 34 },
        { key: 'cant', width: 7.5 },
        { key: 'peso', width: 11 }, // PESO CON RELLENO (casilla compacta/cuadrada)
        { key: 'nota', width: 26 }, // ESPECIFICACIONES / NOTA
        { key: 'separado', width: 10 }, // SEPARADO (casilla cuadrada)
        { key: 'pesado', width: 10.5 }, // PESADO & REVISADO (casilla cuadrada)
        { key: 'empacado', width: 10.5 }, // REVISADO & EMPACADO (casilla cuadrada)
      ];
    } else {
      // 5 Columnas para Cliente
      worksheetAlistamiento.columns = [
        { key: 'foto', width: 8.5 },
        { key: 'codigo', width: 18 },
        { key: 'descripcion', width: 44 },
        { key: 'cant', width: 10 },
        { key: 'nota', width: 38 },
      ];
    }

    if (logoBase64) {
      const logoId2 = workbook.addImage({
        base64: logoBase64,
        extension: 'png',
      });
      worksheetAlistamiento.addImage(logoId2, {
        tl: { col: 0.1, row: 0.2 },
        ext: { width: 68, height: 68 },
        editAs: 'undefined',
      });
    }

    // Encabezado de la Hoja de Alistamiento / Producción
    worksheetAlistamiento.addRow([]);
    worksheetAlistamiento.getRow(1).height = 14;

    const numCols = isAdmin ? 9 : 5;
    const endColLetter = isAdmin ? 'I' : 'E';

    const titleRow2 = worksheetAlistamiento.addRow(new Array(numCols).fill(''));
    const titleRow2Num = titleRow2.number;
    titleRow2.height = 28;
    safeMerge(worksheetAlistamiento, `B${titleRow2Num}:${endColLetter}${titleRow2Num}`);
    const titleCell2 = worksheetAlistamiento.getCell(`B${titleRow2Num}`);
    titleCell2.value = isAdmin
      ? `${company.name.toUpperCase()} - HOJA DE PRODUCCIÓN`
      : `${company.name.toUpperCase()} - PEDIDO CON IMÁGENES`;
    titleCell2.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1E3A5F' } };
    titleCell2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    const subRow2 = worksheetAlistamiento.addRow(new Array(numCols).fill(''));
    const subRow2Num = subRow2.number;
    subRow2.height = 22;
    safeMerge(worksheetAlistamiento, `B${subRow2Num}:${endColLetter}${subRow2Num}`);
    const subCell2 = worksheetAlistamiento.getCell(`B${subRow2Num}`);
    subCell2.value = `CLIENTE: ${cleanClientName}  |  SUCURSAL: ${(company.country || 'INTERNACIONAL').toUpperCase()}  |  ${dateTimeFormatted}`;
    subCell2.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FFC37D41' } };
    subCell2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

    worksheetAlistamiento.addRow([]);
    worksheetAlistamiento.getRow(4).height = 10;

    // Encabezados de la Tabla de Alistamiento con ajuste de texto sin cortes
    const headerTitles = isAdmin
      ? [
          'FOTO',
          'CODIGO',
          'DESCRIPCION Y MEDIDA',
          'CANT.',
          'PESO CON\nRELLENO',
          'ESPECIFICACIONES / NOTA',
          'SEPARADO',
          'PESADO &\nREVISADO',
          'REVISADO &\nEMPACADO',
        ]
      : ['FOTO', 'CODIGO', 'DESCRIPCION Y MEDIDA', 'CANT.', 'ESPECIFICACIONES / NOTA'];

    const headerRow2 = worksheetAlistamiento.addRow(headerTitles);
    headerRow2.height = isAdmin ? 38 : 26; // Altura extendida para permitir texto multilínea sin cortes

    for (let c = 1; c <= numCols; c++) {
      const cell = headerRow2.getCell(c);
      cell.fill = blueFill;
      cell.border = thinBorder;
      cell.font = { name: 'Arial', size: isAdmin ? 8.5 : 10, bold: true, color: { argb: 'FF000000' } };
    }

    headerRow2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    headerRow2.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
    headerRow2.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
    headerRow2.getCell(4).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

    if (isAdmin) {
      headerRow2.getCell(5).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; // PESO CON RELLENO
      headerRow2.getCell(6).alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true }; // ESPECIFICACIONES / NOTA
      headerRow2.getCell(7).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; // SEPARADO
      headerRow2.getCell(8).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; // PESADO & REVISADO
      headerRow2.getCell(9).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; // REVISADO & EMPACADO
    } else {
      headerRow2.getCell(5).alignment = { horizontal: 'left', vertical: 'middle', indent: 1, wrapText: true };
    }

    // Filas de Productos con Miniatura
    normalizedItems.forEach((item, idx) => {
      const sizeText = item.size ? ` [${formatSize(item.size)}]` : '';
      const description = sanitizeExcelText(`${item.name}${sizeText}`);
      const skuText = sanitizeExcelText(item.sku);
      const commentText =
        item.comment && item.comment.trim() && item.comment.trim() !== '-'
          ? sanitizeExcelText(item.comment)
          : '';
      const quantityVal = Math.max(1, Math.floor(Number(item.quantity) || 1));

      let rowValues: (string | number)[];

      if (isAdmin) {
        // Peso con relleno estrictamente por unidad (sin multiplicar por cantidad)
        let pesoTexto = '-';
        if (item.filledWeight && item.filledWeight > 0) {
          const unitWeight = item.filledWeight;
          if (unitWeight >= 1000) {
            pesoTexto = `${(unitWeight / 1000).toFixed(2)} kg`;
          } else {
            pesoTexto = `${unitWeight}g`;
          }
        }

        rowValues = [
          '', // Foto
          skuText,
          description,
          quantityVal,
          pesoTexto, // PESO CON RELLENO
          commentText, // ESPECIFICACIONES / NOTA
          '', // SEPARADO (casilla cuadrada vacía)
          '', // PESADO & REVISADO (casilla cuadrada vacía)
          '', // REVISADO & EMPACADO (casilla cuadrada vacía)
        ];
      } else {
        rowValues = ['', skuText, description, quantityVal, commentText];
      }

      const row = worksheetAlistamiento.addRow(rowValues);
      row.height = 54; // Altura fija para que las casillas sean cuadradas

      for (let c = 1; c <= numCols; c++) {
        const cell = row.getCell(c);
        cell.border = thinBorder;
        cell.font = { name: 'Arial', size: 10, color: { argb: 'FF0F172A' } };
      }

      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      row.getCell(2).font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };

      row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(4).font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1E293B' } };
      row.getCell(4).numFmt = '#,##0';

      if (isAdmin) {
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        row.getCell(5).font = { name: 'Arial', size: 9, color: { argb: 'FF334155' } };
        row.getCell(6).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
        row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(8).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        row.getCell(5).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      }

      // Inserción de Miniatura de Imagen (48x48 px perfectamente centrada en la celda)
      const itemImgBase64 = productImagesBase64[idx];
      if (itemImgBase64) {
        const itemImgId = workbook.addImage({
          base64: itemImgBase64,
          extension: 'png',
        });
        worksheetAlistamiento.addImage(itemImgId, {
          tl: { col: 0.1, row: row.number - 1 + 0.05 },
          ext: { width: 48, height: 48 },
          editAs: 'undefined',
        });
      }
    });

    // Fila de Total de Unidades a Despachar y Total de Bultos
    const totalUnitsRow = worksheetAlistamiento.addRow(new Array(numCols).fill(''));
    totalUnitsRow.height = 26;
    const totalUnitsRowNum = totalUnitsRow.number;

    safeMerge(worksheetAlistamiento, `A${totalUnitsRowNum}:C${totalUnitsRowNum}`);

    const totalLabelCell = worksheetAlistamiento.getCell(`A${totalUnitsRowNum}`);
    totalLabelCell.value = 'TOTAL UNIDADES A DESPACHAR:';
    totalLabelCell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF000000' } };
    totalLabelCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

    const totalValCell = worksheetAlistamiento.getCell(`D${totalUnitsRowNum}`);
    totalValCell.value = totalUnits;
    totalValCell.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FFC37D41' } };
    totalValCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totalValCell.numFmt = '#,##0';

    if (isAdmin) {
      if (totalGrams > 0) {
        const totalWeightCell = worksheetAlistamiento.getCell(`E${totalUnitsRowNum}`);
        totalWeightCell.value =
          totalGrams >= 1000 ? `${(totalGrams / 1000).toFixed(2)} kg` : `${totalGrams}g`;
        totalWeightCell.font = { name: 'Arial', size: 9.5, bold: true, color: { argb: 'FF3C5866' } };
        totalWeightCell.alignment = { horizontal: 'center', vertical: 'middle' };
      }

      // "TOTAL DE BULTOS" en Columna F
      const bultosLabelCell = worksheetAlistamiento.getCell(`F${totalUnitsRowNum}`);
      bultosLabelCell.value = 'TOTAL DE BULTOS:';
      bultosLabelCell.font = { name: 'Arial', size: 10.5, bold: true, color: { argb: 'FF000000' } };
      bultosLabelCell.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };

      // Casilla vacía al frente (Columna G) para que el empleado escriba los bultos
      const bultosValCell = worksheetAlistamiento.getCell(`G${totalUnitsRowNum}`);
      bultosValCell.value = '';
      bultosValCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }

    for (let c = 1; c <= numCols; c++) {
      const cell = totalUnitsRow.getCell(c);
      cell.fill = totalFill;
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'double', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
    }

    // Generar Buffer y Descargar en el navegador
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const cleanNameForFile = sanitizeFileName(cleanClientName, 'CLIENTE').toUpperCase();
    const cleanFolio = sanitizeFileName(folioId, 'SINFOLIO');
    const dateFormatted = `${day}.${month}.${year}`;

    let fileName = '';
    if (isAdmin) {
      // PROD_[nombre del cliente]_[folio del pedido]_[dd.mm.aaaa].xlsx
      fileName = `PROD_${cleanNameForFile}_${cleanFolio}_${dateFormatted}.xlsx`;
    } else {
      // PED_[folio del pedido]_[nombre del cliente]_[dd.mm.aaaa].xlsx
      const prefix = 'PED';
      fileName = `${prefix}_${cleanFolio}_${cleanNameForFile}_${dateFormatted}.xlsx`;
    }

    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();

    // En Safari / iOS, el sistema operativo muestra un cuadro de confirmación nativo ("¿Desea descargar...?").
    // Si la URL se revoca antes de que el usuario pulse "Descargar", la descarga falla o queda vacía.
    // Mantenemos la URL viva durante 60 segundos para garantizar la compatibilidad.
    setTimeout(() => {
      try {
        if (anchor.parentNode) {
          document.body.removeChild(anchor);
        }
        window.URL.revokeObjectURL(url);
      } catch {}
    }, 60000);
  } catch (error) {
    console.error('Error al generar o descargar el archivo Excel:', error);
  }
}
