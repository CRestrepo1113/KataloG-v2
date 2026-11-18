'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { Product, Branch, CompanyInfo, PriceList } from '@/lib/types';
import { BUILT_IN_PRICE_LIST_IDS } from '@/lib/pricing';
import { BRAND_COLORS, getBaseSku, parseFlexiblePrice, extractSkusFromFilename } from '@/lib/theme';
import { getLocalProducts, uploadProductImage, getBranchOverride, isProductInBranch } from '@/lib/firestore';
import { Upload, FileSpreadsheet, Image as ImageIcon, X, CheckCircle2, Download, RefreshCw, AlertCircle, AlertTriangle, ChevronDown, Link2, Sparkles, FileDown, Check, Scale } from 'lucide-react';
import ExcelJS from 'exceljs';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (importedProducts: Product[], branchSlug?: string) => Promise<void> | void;
  branch?: Branch | null;
  branches?: Branch[];
  currentBranchSlug?: string;
  onSelectBranch?: (slug: string) => void;
  company?: CompanyInfo | null;
  branchName?: string;
  priceLists?: PriceList[];
}

export interface ParsedRow {
  sku: string;
  name: string;
  category: string;
  size?: string;
  filledWeight?: number;
  stock: number;
  unit: number;
  dozen: number;
  wholesale: number;
  basePrice?: number;
  customLists?: Record<string, number>;
}

export type RowDiffStatus = 'new' | 'modified' | 'unchanged';

export interface RowDiffDetail {
  field: string;
  label: string;
  oldVal: string | number;
  newVal: string | number;
}

export interface AnalyzedRow {
  row: ParsedRow;
  status: RowDiffStatus;
  matchedProduct?: Product;
  changes: RowDiffDetail[];
}

export interface MatchedImageResult {
  file: File;
  allMatchedSkus: string[];
  matchedSkuToken: string;
}

// Clean string of UTF-8 BOM and trailing whitespace
function cleanSkuString(str: string): string {
  if (!str) return '';
  return str
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toUpperCase();
}

// Robust weight parser for filledWeight supporting numbers, strings with g/gr/gramos/kg, comma decimals, and explicit 0
export function parseFlexibleWeight(rawVal: unknown): number | undefined {
  if (rawVal === undefined || rawVal === null || rawVal === '') return undefined;
  if (typeof rawVal === 'number') {
    return isNaN(rawVal) ? undefined : rawVal;
  }
  const str = String(rawVal).trim();
  if (!str) return undefined;

  const isKg = /kg|kilos?/i.test(str);
  const cleaned = str
    .replace(/[\sgrgramoskilo]+/gi, '')
    .replace(',', '.');

  const num = parseFloat(cleaned);
  if (isNaN(num)) return undefined;
  return isKg ? Math.round(num * 1000) : num;
}

// SMART MATCHING: Matches exact SKU (e.g. PEL-1 HON.jpg), Base SKU (e.g. PEL-1.jpg), or Multi-SKU (e.g. PEL-18, PEL-19.jpg)
function findMatchingImage(sku: string, files: File[]): MatchedImageResult | undefined {
  const targetSku = cleanSkuString(sku);
  const baseSku = getBaseSku(targetSku);
  if (!targetSku) return undefined;

  for (const file of files) {
    const extractedSkus = extractSkusFromFilename(file.name);
    for (const token of extractedSkus) {
      const cleanToken = cleanSkuString(token);
      const tokenBaseSku = getBaseSku(cleanToken);
      if (
        cleanToken === targetSku ||
        tokenBaseSku === baseSku ||
        cleanToken === baseSku ||
        tokenBaseSku === targetSku
      ) {
        return {
          file,
          allMatchedSkus: extractedSkus,
          matchedSkuToken: cleanToken,
        };
      }
    }
  }

  return undefined;
}

// RFC-4180 compliant CSV line parser respecting quotes, commas, semicolons, and tabs
function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((cell) => cell.replace(/^["']|["']$/g, '').trim());
}

// Detect optimal CSV delimiter by counting unquoted delimiters in header line
function detectCSVDelimiter(firstLine: string): string {
  let semicolonCount = 0;
  let tabCount = 0;
  let commaCount = 0;
  let inQuotes = false;

  for (let i = 0; i < firstLine.length; i++) {
    const char = firstLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (char === ';') semicolonCount++;
      else if (char === '\t') tabCount++;
      else if (char === ',') commaCount++;
    }
  }

  if (semicolonCount >= commaCount && semicolonCount > 0) return ';';
  if (tabCount >= commaCount && tabCount > 0) return '\t';
  return ',';
}

// Normalize column headers flexibly (handles Codigo, Descripcion, Categoria, Medida, cm, Cantidad, Precio Mayorista, Precio Docena, Precio Detal, Peso Relleno)
function normalizeHeaderKey(header: string): string {
  const clean = header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents (Código -> codigo)
    .replace(/[^a-z0-9]/g, '');     // Remove spaces/symbols (medida, cm -> medidacm)

  if (
    clean.includes('codigo') ||
    clean.includes('sku') ||
    clean.includes('ref') ||
    clean.includes('articulo') ||
    clean.includes('item') ||
    clean === 'cod'
  ) {
    return 'sku';
  }

  if (
    clean.includes('descripcion') ||
    clean.includes('nombre') ||
    clean.includes('name') ||
    clean.includes('producto') ||
    clean.includes('detalle') ||
    clean === 'desc'
  ) {
    return 'name';
  }

  if (
    clean.includes('categoria') ||
    clean.includes('category') ||
    clean.includes('grupo') ||
    clean.includes('familia') ||
    clean === 'cat'
  ) {
    return 'category';
  }

  if (
    clean.includes('peso') ||
    clean.includes('relleno') ||
    clean.includes('gram') ||
    clean.includes('weight') ||
    clean === 'g' ||
    clean === 'gr' ||
    clean === 'grs'
  ) {
    return 'filledWeight';
  }

  if (
    clean.includes('medida') ||
    clean.includes('tamano') ||
    clean.includes('size') ||
    clean.includes('talla') ||
    clean.includes('dimension')
  ) {
    return 'size';
  }

  if (
    clean.includes('cantidad') ||
    clean.includes('stock') ||
    clean.includes('existencia') ||
    clean.includes('cant') ||
    clean.includes('inventario')
  ) {
    return 'stock';
  }

  if (
    clean.includes('preciobase') ||
    clean.includes('costobase') ||
    clean === 'base' ||
    clean === 'baseprice'
  ) {
    return 'basePrice';
  }

  if (clean.includes('mayorista') || clean.includes('wholesale') || clean.includes('mayor')) {
    return 'wholesale';
  }

  if (clean.includes('docena') || clean.includes('dozen')) {
    return 'dozen';
  }

  if (clean.includes('detal') || clean.includes('unit') || clean.includes('unidad') || clean.includes('publico')) {
    return 'unit';
  }

  if (header.toLowerCase().includes('lista:') || header.toLowerCase().includes('lista_')) {
    return `custom_${clean.replace(/^lista/, '')}`;
  }

  return clean;
}

// Compare parsed rows against existing catalog to categorize modifications, new items, and unchanged items
function analyzeParsedRows(rows: ParsedRow[], branchSlug: string): AnalyzedRow[] {
  const allProds = getLocalProducts();
  return rows.map((row) => {
    const cleanSku = cleanSkuString(row.sku);
    const noSep = cleanSku.replace(/[\s\-_]/g, '');
    const bSku = getBaseSku(cleanSku);

    // Prioritize exact match, then normalized, then baseSku matching the branch
    let matched = allProds.find((p) => cleanSkuString(p.sku) === cleanSku);
    if (!matched && noSep) {
      matched = allProds.find((p) => cleanSkuString(p.sku).replace(/[\s\-_]/g, '') === noSep);
    }
    if (!matched && bSku) {
      const candidates = allProds.filter((p) => getBaseSku(cleanSkuString(p.sku)) === bSku);
      matched = candidates.find((c) => isProductInBranch(c, branchSlug)) || candidates[0];
    }

    if (!matched) {
      return {
        row,
        status: 'new',
        changes: [],
      };
    }

    const override = getBranchOverride(matched, branchSlug);
    const oldWeight = override?.filledWeight !== undefined && override?.filledWeight !== null
      ? override.filledWeight
      : matched.filledWeight;
    const oldStock = override?.stock !== undefined ? override.stock : (matched.stock ?? 12);
    const oldPrices = override?.prices || matched.prices;
    const oldWholesale = oldPrices?.wholesale || 0;
    const oldDozen = oldPrices?.dozen || 0;
    const oldUnit = oldPrices?.unit || 0;
    const oldBase = oldPrices?.basePrice || 0;
    const oldSize = (matched.size || '').trim();
    const oldName = (matched.name || '').trim();
    const oldCategory = (matched.category || 'General').trim();

    const changes: RowDiffDetail[] = [];

    if (row.filledWeight !== undefined && row.filledWeight !== oldWeight) {
      changes.push({
        field: 'filledWeight',
        label: 'Peso Relleno',
        oldVal: oldWeight !== undefined && oldWeight !== null ? `${oldWeight}g` : '0g',
        newVal: `${row.filledWeight}g`,
      });
    }

    if (row.basePrice !== undefined && row.basePrice > 0 && row.basePrice !== oldBase) {
      changes.push({
        field: 'basePrice',
        label: 'P. Base',
        oldVal: oldBase,
        newVal: row.basePrice,
      });
    }

    if (row.wholesale > 0 && row.wholesale !== oldWholesale) {
      changes.push({
        field: 'wholesale',
        label: 'P. Mayorista',
        oldVal: oldWholesale,
        newVal: row.wholesale,
      });
    }

    if (row.dozen > 0 && row.dozen !== oldDozen) {
      changes.push({
        field: 'dozen',
        label: 'P. Docena',
        oldVal: oldDozen,
        newVal: row.dozen,
      });
    }

    if (row.unit > 0 && row.unit !== oldUnit) {
      changes.push({
        field: 'unit',
        label: 'P. Detal',
        oldVal: oldUnit,
        newVal: row.unit,
      });
    }

    if (row.stock !== undefined && row.stock !== oldStock) {
      changes.push({
        field: 'stock',
        label: 'Cantidad',
        oldVal: oldStock,
        newVal: row.stock,
      });
    }

    if (row.size && row.size.toLowerCase().replace(/\s*cm/i, '') !== oldSize.toLowerCase().replace(/\s*cm/i, '')) {
      changes.push({
        field: 'size',
        label: 'Medida',
        oldVal: oldSize || '-',
        newVal: row.size,
      });
    }

    if (row.name && row.name.toLowerCase() !== oldName.toLowerCase()) {
      changes.push({
        field: 'name',
        label: 'Descripción',
        oldVal: oldName,
        newVal: row.name,
      });
    }

    if (row.category && row.category.toLowerCase() !== oldCategory.toLowerCase()) {
      changes.push({
        field: 'category',
        label: 'Categoría',
        oldVal: oldCategory,
        newVal: row.category,
      });
    }

    return {
      row,
      status: changes.length > 0 ? 'modified' : 'unchanged',
      matchedProduct: matched,
      changes,
    };
  });
}


export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  branch,
  branches,
  currentBranchSlug,
  onSelectBranch,
  company,
  branchName,
  priceLists = [],
}) => {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [importMode, setImportMode] = useState<'csv_import' | 'photos_only'>('csv_import');
  const [overwriteProductIds, setOverwriteProductIds] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log output to bottom on each message update
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logMessages]);

  const [selectedBranchSlug, setSelectedBranchSlug] = useState<string>(
    currentBranchSlug || branch?.slug || 'default'
  );

  const [previewFilter, setPreviewFilter] = useState<'all' | 'modified' | 'new' | 'unchanged'>('all');

  useEffect(() => {
    if (currentBranchSlug) {
      setSelectedBranchSlug(currentBranchSlug);
    } else if (branch?.slug) {
      setSelectedBranchSlug(branch.slug);
    }
  }, [currentBranchSlug, branch?.slug]);

  const activeTargetBranch =
    branches?.find((b) => b.slug === selectedBranchSlug || b.id === selectedBranchSlug) ||
    branch;

  const targetBranchName = activeTargetBranch?.name || company?.name || branchName || 'Sucursal Principal';
  const targetCountry = activeTargetBranch?.country || company?.country || 'Internacional';
  const targetCurrencySymbol = activeTargetBranch?.currencySymbol || company?.currencySymbol || '$';
  const targetCurrencyCode = activeTargetBranch?.currencyCode || company?.currencyCode || 'USD';

  // Real-time diff analysis of parsed rows against catalog
  const analyzedRows = useMemo(() => {
    if (parsedRows.length === 0) return [];
    return analyzeParsedRows(parsedRows, selectedBranchSlug);
  }, [parsedRows, selectedBranchSlug]);

  const modifiedRows = useMemo(() => analyzedRows.filter((r) => r.status === 'modified'), [analyzedRows]);
  const newRows = useMemo(() => analyzedRows.filter((r) => r.status === 'new'), [analyzedRows]);
  const unchangedRows = useMemo(() => analyzedRows.filter((r) => r.status === 'unchanged'), [analyzedRows]);
  const weightRowsCount = useMemo(() => parsedRows.filter((r) => r.filledWeight !== undefined && r.filledWeight > 0).length, [parsedRows]);

  const filteredPreviewRows = useMemo(() => {
    if (previewFilter === 'modified') return modifiedRows;
    if (previewFilter === 'new') return newRows;
    if (previewFilter === 'unchanged') return unchangedRows;
    return analyzedRows;
  }, [analyzedRows, modifiedRows, newRows, unchangedRows, previewFilter]);

  if (!isOpen) return null;

  const customExportLists = useMemo(() => {
    return priceLists
      .filter(
        (l) =>
          l.isActive &&
          !BUILT_IN_PRICE_LIST_IDS.includes(l.id as any) &&
          (!l.branchSlug || l.branchSlug === selectedBranchSlug || l.branchSlug === 'global')
      )
      .sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99));
  }, [priceLists, selectedBranchSlug]);

  // Descarga plantilla de ejemplo en Excel (.xlsx)
  const handleDownloadTemplate = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Plantilla');

    ws.columns = [
      { header: 'Codigo', key: 'sku', width: 18 },
      { header: 'Descripcion', key: 'name', width: 35 },
      { header: 'Categoria', key: 'category', width: 22 },
      { header: 'Medida (cm)', key: 'size', width: 15 },
      { header: 'Peso Relleno (g)', key: 'filledWeight', width: 18 },
      { header: 'Cantidad', key: 'stock', width: 14 },
      { header: 'Precio Base', key: 'basePrice', width: 16 },
      { header: 'Precio Mayorista', key: 'wholesale', width: 18 },
      { header: 'Precio Docena', key: 'dozen', width: 18 },
      { header: 'Precio Detal', key: 'unit', width: 18 },
      ...customExportLists.map((l) => ({
        header: `lista:${l.id}`,
        key: `custom_${l.id}`,
        width: 16,
      })),
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3C5866' },
    };
    ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

    ws.addRow({ sku: 'PEL-1 HON', name: 'LUCIFER', category: 'PERSONAJES', size: '10', filledWeight: 150, stock: 150, basePrice: 7985, wholesale: 7985, dozen: 9981, unit: 15970 });
    ws.addRow({ sku: 'PEL-3 HON', name: 'LUCIFER', category: 'PERSONAJES', size: '30', filledWeight: 450, stock: 124, basePrice: 19019, wholesale: 19019, dozen: 23773, unit: 38037 });
    ws.addRow({ sku: 'PEL-4 HON', name: 'LUCIFER', category: 'PERSONAJES', size: '40', filledWeight: 780, stock: 50, basePrice: 30172, wholesale: 30172, dozen: 37715, unit: 60345 });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'plantilla_katalog_inventario.xlsx');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Descarga el inventario actual de la sucursal activa en Excel nativo (.xlsx)
  const handleDownloadCurrentInventoryExcel = async () => {
    const allProds = getLocalProducts();
    const currentProds = allProds.filter((p) => isProductInBranch(p, selectedBranchSlug));
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Inventario');

    ws.columns = [
      { header: 'Codigo', key: 'sku', width: 18 },
      { header: 'Descripcion', key: 'name', width: 35 },
      { header: 'Categoria', key: 'category', width: 22 },
      { header: 'Medida (cm)', key: 'size', width: 15 },
      { header: 'Peso Relleno (g)', key: 'filledWeight', width: 18 },
      { header: 'Cantidad', key: 'stock', width: 14 },
      { header: 'Precio Base', key: 'basePrice', width: 16 },
      { header: 'Precio Mayorista', key: 'wholesale', width: 18 },
      { header: 'Precio Docena', key: 'dozen', width: 18 },
      { header: 'Precio Detal', key: 'unit', width: 18 },
      ...customExportLists.map((l) => ({
        header: `lista:${l.id}`,
        key: `custom_${l.id}`,
        width: 16,
      })),
    ];

    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3C5866' },
    };
    ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };

    currentProds.forEach((p) => {
      const override = getBranchOverride(p, selectedBranchSlug);
      const cleanSku = (p.sku || '').trim();
      const cleanName = (p.name || '').trim();
      const cleanCategory = (p.category || 'General').trim();
      const cleanSize = (p.size || '').replace(/\s*cm/i, '').trim();
      const weight = override?.filledWeight !== undefined && override?.filledWeight !== null
        ? override.filledWeight
        : (p.filledWeight !== undefined && p.filledWeight !== null ? p.filledWeight : '');
      const stock = override?.stock !== undefined ? override.stock : (p.stock ?? 12);
      const prices = override?.prices || p.prices;
      const basePrice = prices?.basePrice ?? prices?.wholesale ?? 0;
      const wholesale = prices?.wholesale || 0;
      const dozen = prices?.dozen || 0;
      const unit = prices?.unit || 0;

      const rowPayload: Record<string, any> = {
        sku: cleanSku,
        name: cleanName,
        category: cleanCategory,
        size: cleanSize,
        filledWeight: weight !== '' ? Number(weight) : '',
        stock: Number(stock),
        basePrice: Number(basePrice),
        wholesale: Number(wholesale),
        dozen: Number(dozen),
        unit: Number(unit),
      };
      customExportLists.forEach((l) => {
        const val = prices?.customLists?.[l.id];
        if (typeof val === 'number' && val > 0) {
          rowPayload[`custom_${l.id}`] = val;
        }
      });

      const row = ws.addRow(rowPayload);

      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'center' };
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventario_${selectedBranchSlug}_katalog.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Descarga el inventario actual de la sucursal activa en formato .CSV con BOM UTF-8 para Excel
  const handleDownloadCurrentInventoryCSV = () => {
    const allProds = getLocalProducts();
    const currentProds = allProds.filter((p) => isProductInBranch(p, selectedBranchSlug));
    const customHeaders = customExportLists.map((l) => `,lista:${l.id}`).join('');
    let csvContent = `\uFEFFCodigo,Descripcion,Categoria,Medida (cm),Peso Relleno (g),Cantidad,Precio Base,Precio Mayorista,Precio Docena,Precio Detal${customHeaders}\n`;

    currentProds.forEach((p) => {
      const override = getBranchOverride(p, selectedBranchSlug);
      const cleanSku = (p.sku || '').replace(/[",\n\r]/g, '').trim();
      const cleanName = `"${(p.name || '').replace(/"/g, '""')}"`;
      const cleanCategory = `"${(p.category || 'General').replace(/"/g, '""')}"`;
      const cleanSize = (p.size || '').replace(/[",\n\r]/g, '').replace(/\s*cm/i, '').trim();
      const weight = override?.filledWeight !== undefined && override?.filledWeight !== null
        ? override.filledWeight
        : (p.filledWeight !== undefined && p.filledWeight !== null ? p.filledWeight : '');
      const stock = override?.stock !== undefined ? override.stock : (p.stock ?? 12);
      const prices = override?.prices || p.prices;
      const basePrice = prices?.basePrice ?? prices?.wholesale ?? 0;
      const wholesale = prices?.wholesale || 0;
      const dozen = prices?.dozen || 0;
      const unit = prices?.unit || 0;
      const customCols = customExportLists
        .map((l) => {
          const v = prices?.customLists?.[l.id];
          return `,${typeof v === 'number' && v > 0 ? v : ''}`;
        })
        .join('');

      csvContent += `${cleanSku},${cleanName},${cleanCategory},${cleanSize},${weight},${stock},${basePrice},${wholesale},${dozen},${unit}${customCols}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `inventario_${selectedBranchSlug}_katalog.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const buildParsedRowFromRecord = (
    rowData: Record<string, any>,
    fallbackIndex: number | string
  ): ParsedRow => {
    const rawSku = String(rowData['sku'] || `PEL-${fallbackIndex}`);
    const sku = cleanSkuString(rawSku);
    const name = String(rowData['name'] || 'Producto Importado');
    const rawCategory = String(rowData['category'] || 'General');

    const categoryList = rawCategory
      .split(/[,/|]/)
      .map((c) => c.trim())
      .filter(Boolean);
    const category = categoryList.join(', ') || 'General';

    const rawSize = String(rowData['size'] || '').trim();
    let size = '';
    if (rawSize) {
      if (/^\d+(\.\d+)?$/.test(rawSize) || !rawSize.toLowerCase().includes('cm')) {
        size = `${rawSize} cm`;
      } else {
        size = rawSize;
      }
    }

    const rawStock = String(rowData['stock'] ?? '').replace(/[^0-9]/g, '');
    const stock = rawStock !== '' ? parseInt(rawStock, 10) : 12;
    const filledWeight = parseFlexibleWeight(rowData['filledWeight']);

    const rawBase = rowData['basePrice'];
    const parsedBase = rawBase !== undefined && rawBase !== '' ? parseFlexiblePrice(rawBase, 0) : 0;
    const basePrice = parsedBase > 0 ? parsedBase : undefined;
    const wholesale = parseFlexiblePrice(rowData['wholesale'], 0);
    const dozen = parseFlexiblePrice(rowData['dozen'], 0);
    const unit = parseFlexiblePrice(rowData['unit'], 0);

    const customLists: Record<string, number> = {};
    Object.entries(rowData).forEach(([k, v]) => {
      if (k.startsWith('custom_') && v !== undefined && v !== '') {
        const listKey = k.replace(/^custom_/, '');
        const numVal = parseFlexiblePrice(v, 0);
        if (listKey && numVal > 0) customLists[listKey] = numVal;
      }
    });

    return {
      sku,
      name,
      category,
      size,
      filledWeight,
      stock,
      unit,
      dozen,
      wholesale,
      basePrice,
      customLists: Object.keys(customLists).length > 0 ? customLists : undefined,
    };
  };

  // Step 1: Parse Excel (.xlsx, .xls) or CSV supporting comma (,), semicolon (;), and tab (\t) delimiters
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      try {
        const buffer = await file.arrayBuffer();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets[0];
        if (!ws) return;

        const rows: ParsedRow[] = [];
        let headers: string[] = [];

        ws.eachRow((row, rowNumber) => {
          const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
          if (rowNumber === 1 || headers.length === 0) {
            headers = rawValues.map((val) => normalizeHeaderKey(String(val ?? '')));
            return;
          }

          const rowData: Record<string, any> = {};
          headers.forEach((h, index) => {
            const rawVal = rawValues[index];
            if (rawVal && typeof rawVal === 'object' && 'result' in rawVal) {
              rowData[h] = (rawVal as any).result;
            } else {
              rowData[h] = rawVal !== undefined && rawVal !== null ? rawVal : '';
            }
          });

          rows.push(buildParsedRowFromRecord(rowData, rowNumber));
        });

        setParsedRows(rows);
        setStep(1);
      } catch (err) {
        console.error('Error parsing Excel file:', err);
      }
    } else {
      try {
        const buffer = await file.arrayBuffer();
        let text = new TextDecoder('utf-8').decode(buffer);
        if (text.includes('\uFFFD')) {
          try {
            text = new TextDecoder('windows-1252').decode(buffer);
          } catch {
            // fallback
          }
        }

        text = text.replace(/^\uFEFF/, '');
        const rawLines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
        if (rawLines.length < 2) return;

        if (rawLines[0].toLowerCase().startsWith('sep=')) {
          rawLines.shift();
        }
        if (rawLines.length < 2) return;

        const firstLine = rawLines[0];
        const delimiter = detectCSVDelimiter(firstLine);

        const rawHeaders = parseCSVLine(firstLine, delimiter);
        const cleanedHeaders: string[] = [];
        for (let hIdx = 0; hIdx < rawHeaders.length; hIdx++) {
          const rawH = rawHeaders[hIdx];
          const normH = normalizeHeaderKey(rawH);
          if (normH === 'cm' && cleanedHeaders.length > 0 && cleanedHeaders[cleanedHeaders.length - 1] === 'size') {
            continue;
          }
          cleanedHeaders.push(normH);
        }

        const headers = cleanedHeaders;
        const rows: ParsedRow[] = [];

        for (let i = 1; i < rawLines.length; i++) {
          const line = rawLines[i].trim();
          if (!line) continue;

          const values = parseCSVLine(line, delimiter);
          if (values.length < 2) continue;

          const rowData: Record<string, string> = {};
          headers.forEach((h, index) => {
            rowData[h] = values[index] || '';
          });

          rows.push(buildParsedRowFromRecord(rowData, i));
        }

        setParsedRows(rows);
        setStep(1);
      } catch (err) {
        console.error('Error parsing CSV file:', err);
      }
    }
  };

  // Step 2: Handle Batch Images Selection
  const handleImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setImageFiles(files);
  };

  // Clean 600x600 WebP Standardizer (Preserves original background & colors with high efficiency compression)
  const processImageTo600x600 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.clearRect(0, 0, 600, 600);

          // Fit centered inside 600x600 canvas
          const scale = Math.min(600 / img.width, 600 / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const drawX = (600 - drawW) / 2;
          const drawY = (600 - drawH) / 2;

          ctx.drawImage(img, drawX, drawY, drawW, drawH);

          const dataUrl = canvas.toDataURL('image/webp', 0.82);
          resolve(dataUrl);
        } else {
          resolve('');
        }
      };
      img.onerror = () => resolve('');
    });
  };

  // Step 3: Execute Batch Processing and Linking
  const handleExecuteImport = async () => {
    if (parsedRows.length === 0) return;

    setStep(3);
    setLoading(true);
    setProgress(0);
    setLogMessages(['Iniciando importación masiva...', `Total referencias en CSV: ${parsedRows.length}`]);

    const importedProducts: Product[] = [];
    const logs: string[] = [];

    // Build initial Shared Image Bank from master catalog
    const sharedImageBank: Record<string, string> = {};
    const existingMasterProds = getLocalProducts();
    existingMasterProds.forEach((p) => {
      if (p.processedImageUrl && p.processedImageUrl !== '/assets/REF_1.jpg') {
        const bSku = getBaseSku(p.sku);
        sharedImageBank[bSku] = p.processedImageUrl;
        sharedImageBank[cleanSkuString(p.sku)] = p.processedImageUrl;
      }
    });

    // Cache of processed image URLs by file identity (filename + size)
    const fileProcessedUrlMap = new Map<string, string>();

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      const cleanSku = cleanSkuString(row.sku);
      const baseSku = getBaseSku(cleanSku);
      const matchResult = findMatchingImage(cleanSku, imageFiles);
      let processedUrl = '';

      if (matchResult) {
        const { file, allMatchedSkus } = matchResult;
        const fileKey = `${file.name}_${file.size}`;
        const isMulti = allMatchedSkus.length > 1;

        if (fileProcessedUrlMap.has(fileKey)) {
          processedUrl = fileProcessedUrlMap.get(fileKey)!;
          logs.push(`🔗 [${cleanSku}] Foto compartida reutilizada desde (${file.name})`);
        } else {
          try {
            const localWebp = await processImageTo600x600(file);
            processedUrl = await uploadProductImage(localWebp, `${cleanSku.toLowerCase()}.webp`);
            fileProcessedUrlMap.set(fileKey, processedUrl);

            // Populate shared image bank for all extracted SKUs in this filename
            for (const s of allMatchedSkus) {
              const cleanS = cleanSkuString(s);
              const bS = getBaseSku(cleanS);
              if (cleanS) sharedImageBank[cleanS] = processedUrl;
              if (bS) sharedImageBank[bS] = processedUrl;
            }

            if (isMulti) {
              logs.push(`✓ [${cleanSku}] Foto multi-referencia (${file.name}) vinculada a [${allMatchedSkus.join(', ')}]`);
            } else {
              logs.push(`✓ [${cleanSku}] Coincidencia de foto (${file.name})`);
            }
          } catch {
            logs.push(`⚠️ [${cleanSku}] Error al procesar imagen.`);
            processedUrl = '';
          }
        }
      } else if (cleanSku && sharedImageBank[cleanSku]) {
        processedUrl = sharedImageBank[cleanSku];
        logs.push(`🔗 [${cleanSku}] Foto vinculada automáticamente por Referencia Compartida`);
      } else if (baseSku && sharedImageBank[baseSku]) {
        processedUrl = sharedImageBank[baseSku];
        logs.push(`🔗 [${cleanSku}] Foto vinculada automáticamente por Código Base (${baseSku})`);
      } else {
        processedUrl = '';
        logs.push(`ℹ️ [${cleanSku}] Sin foto asignada (se mostrará icono de sin imagen).`);
      }

      const diff = analyzedRows[i];
      if (diff) {
        if (diff.status === 'modified') {
          const changeList = diff.changes.map((c) => `${c.label}: ${c.oldVal} ➔ ${c.newVal}`).join(' • ');
          logs.push(`🔄 [${cleanSku}] Modificaciones detectadas: ${changeList}`);
        } else if (diff.status === 'new') {
          logs.push(`✨ [${cleanSku}] Nueva referencia: ${row.name}`);
        } else {
          logs.push(`✓ [${cleanSku}] Sin cambios (conservado con datos actuales).`);
        }
      }

      const categoryList = row.category
        .split(/[,/|]/)
        .map((c) => c.trim())
        .filter(Boolean);

      const safeId = `pel-imp-${cleanSku.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`;

      const newProduct: Product = {
        id: safeId,
        sku: cleanSku,
        name: row.name,
        category: row.category,
        categories: categoryList.length > 0 ? categoryList : [row.category],
        size: row.size,
        filledWeight: row.filledWeight,
        stock: row.stock,
        status: row.stock > 0 ? 'active' : 'out_of_stock',
        prices: {
          unit: row.unit,
          dozen: row.dozen,
          wholesale: row.wholesale,
          basePrice: row.basePrice !== undefined && row.basePrice > 0
            ? row.basePrice
            : row.wholesale > 0
            ? row.wholesale
            : undefined,
          customLists: row.customLists && Object.keys(row.customLists).length > 0
            ? row.customLists
            : undefined,
        },
        processedImageUrl: processedUrl,
        tags: [
          ...categoryList.map((c) => c.toLowerCase()),
          row.name.toLowerCase(),
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      importedProducts.push(newProduct);

      const currentProgress = Math.round(((i + 1) / parsedRows.length) * 100);
      setProgress(currentProgress);
      setLogMessages([...logs]);
    }

    try {
      logs.push('💾 Guardando inventario en almacenamiento...');
      setLogMessages([...logs]);
      await onImportComplete(importedProducts, selectedBranchSlug);
      logs.push(`🎉 ¡Importación completada con éxito! (${modifiedRows.length} actualizadas, ${newRows.length} nuevas creadas, ${unchangedRows.length} conservadas)`);
      setLogMessages([...logs]);
      setProgress(100);
    } catch (err: any) {
      logs.push(`⚠️ Error al guardar: ${err?.message || err}`);
      setLogMessages([...logs]);
    } finally {
      setLoading(false);
    }
  };

  // Direct Batch Photos Association to existing inventory
  const handleExecutePhotoOnlyUpdate = async () => {
    if (imageFiles.length === 0) return;

    setStep(3);
    setLoading(true);
    setProgress(0);
    setLogMessages(['Iniciando vinculación de fotos a referencias existentes...', `Total fotos seleccionadas: ${imageFiles.length}`]);

    const logs: string[] = [];
    const currentProducts = getLocalProducts();
    const updatedProductsMap = new Map<string, Product>();
    const fileProcessedUrlMap = new Map<string, string>();

    for (let fIdx = 0; fIdx < imageFiles.length; fIdx++) {
      const file = imageFiles[fIdx];
      const extractedSkus = extractSkusFromFilename(file.name);
      const fileKey = `${file.name}_${file.size}`;
      let processedUrl = '';

      // Find matching products in current inventory
      const matchedProducts = currentProducts.filter((p) => {
        const pSku = cleanSkuString(p.sku);
        const pBaseSku = getBaseSku(pSku);
        return extractedSkus.some((extracted) => {
          const cleanExt = cleanSkuString(extracted);
          const extBaseSku = getBaseSku(cleanExt);
          return (
            cleanExt === pSku ||
            extBaseSku === pBaseSku ||
            cleanExt === pBaseSku ||
            extBaseSku === pSku
          );
        });
      });

      if (matchedProducts.length > 0) {
        try {
          if (fileProcessedUrlMap.has(fileKey)) {
            processedUrl = fileProcessedUrlMap.get(fileKey)!;
          } else {
            const localWebp = await processImageTo600x600(file);
            processedUrl = await uploadProductImage(
              localWebp,
              `${file.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}.webp`
            );
            fileProcessedUrlMap.set(fileKey, processedUrl);
          }

          matchedProducts.forEach((p) => {
            const hasExisting = Boolean(
              p.processedImageUrl && p.processedImageUrl !== '/assets/REF_1.jpg'
            );
            if (hasExisting && overwriteProductIds[p.id] === false) {
              logs.push(`🛡️ [${p.sku}] Foto actual conservada (no sobrescrita)`);
              return;
            }

            const updated: Product = {
              ...p,
              processedImageUrl: processedUrl,
              updatedAt: new Date().toISOString(),
            };
            updatedProductsMap.set(p.id, updated);
            if (hasExisting) {
              logs.push(`🔄 [${p.sku}] Foto reemplazada por (${file.name})`);
            } else {
              logs.push(`✓ [${p.sku}] Foto asignada a: ${p.name}`);
            }
          });
        } catch {
          logs.push(`⚠️ [${file.name}] Error al procesar imagen.`);
        }
      } else {
        logs.push(`ℹ️ [${file.name}] Sin referencias coincidentes en el inventario actual.`);
      }

      const currentProgress = Math.round(((fIdx + 1) / imageFiles.length) * 100);
      setProgress(currentProgress);
      setLogMessages([...logs]);
    }

    if (updatedProductsMap.size > 0) {
      try {
        logs.push(`💾 Guardando ${updatedProductsMap.size} referencias actualizadas en la base de datos...`);
        setLogMessages([...logs]);
        const updatedList = Array.from(updatedProductsMap.values());
        await onImportComplete(updatedList);
        logs.push(`🎉 ¡Se actualizaron ${updatedProductsMap.size} referencias exitosamente!`);
        setLogMessages([...logs]);
        setProgress(100);
      } catch (err: any) {
        logs.push(`⚠️ Error al guardar: ${err?.message || err}`);
        setLogMessages([...logs]);
      }
    } else {
      logs.push('ℹ️ No hubo referencias coincidentes para actualizar.');
      setLogMessages([...logs]);
    }

    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-100 my-6 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="bg-[#3C5866] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-[#C37D41]" />
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                Importación y Vinculación de Inventario
              </h3>
              <div className="text-[11px] text-[#FFF3CD] font-bold flex flex-wrap items-center gap-1.5 mt-0.5">
                <span>📍 Sucursal Destino:</span>
                {branches && branches.length > 0 ? (
                  <div className="relative inline-flex items-center">
                    <select
                      value={selectedBranchSlug}
                      onChange={(e) => {
                        const newSlug = e.target.value;
                        setSelectedBranchSlug(newSlug);
                        if (onSelectBranch) onSelectBranch(newSlug);
                      }}
                      className="appearance-none bg-[#C37D41] hover:bg-[#a66734] text-white font-extrabold px-3 py-1 rounded-xl text-xs border border-amber-200/80 shadow-xs cursor-pointer focus:outline-none pr-7 transition-all active:scale-95"
                      title="Haz clic aquí para cambiar la sucursal de destino de la importación"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.slug} className="text-[#3C5866] font-bold bg-white">
                          {b.name} ({b.country ? `${b.country} - ` : ''}{b.currencySymbol} {b.currencyCode})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-amber-100 absolute right-2 pointer-events-none" />
                  </div>
                ) : (
                  <span className="bg-amber-500/30 px-2 py-0.5 rounded-md text-white font-extrabold border border-amber-300/40">
                    {targetBranchName} ({targetCountry} • {targetCurrencySymbol} {targetCurrencyCode})
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-300 hover:text-white p-1 rounded-full hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra Unificada de Herramientas y Estado (Un solo nivel, sin textos descriptivos) */}
        <div className="bg-slate-50/90 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
          {/* Stepper / Indicador de Modo a la izquierda */}
          <div className="flex items-center gap-1.5 text-xs">
            {importMode === 'csv_import' ? (
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-black ${
                    step === 1 ? 'bg-[#3C5866] text-white' : 'bg-emerald-600 text-white'
                  }`}
                >
                  {step > 1 ? '✓' : '1'}
                </span>
                <span className={step === 1 ? 'text-[#3C5866] font-black' : 'text-slate-400 font-bold'}>CSV</span>
                <span className="text-slate-300 font-bold text-[10px]">→</span>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-black ${
                    step === 2 ? 'bg-[#3C5866] text-white' : step === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {step > 2 ? '✓' : '2'}
                </span>
                <span className={step === 2 ? 'text-[#3C5866] font-black' : 'text-slate-400 font-bold'}>Fotos</span>
                <span className="text-slate-300 font-bold text-[10px]">→</span>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-black ${
                    step === 3 ? 'bg-[#3C5866] text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  3
                </span>
                <span className={step === 3 ? 'text-[#3C5866] font-black' : 'text-slate-400 font-bold'}>Listo</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 font-black text-[#3C5866] text-xs">
                <ImageIcon className="w-4 h-4 text-[#C37D41]" />
                <span>Solo Fotos</span>
              </div>
            )}
          </div>

          {/* Botones de Herramientas en un mismo nivel */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleDownloadCurrentInventoryExcel}
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300/80 rounded-xl text-xs font-black flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
              title="Descargar inventario completo en formato Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Exportar Excel</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCurrentInventoryCSV}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
              title="Descargar inventario en formato CSV con compatibilidad para Excel"
            >
              <FileDown className="w-3.5 h-3.5 text-slate-600" />
              <span>Exportar CSV</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
              title="Descargar plantilla de ejemplo en Excel (.xlsx)"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Plantilla Excel</span>
            </button>

            {importMode === 'csv_import' ? (
              <button
                type="button"
                onClick={() => {
                  setImportMode('photos_only');
                  setStep(1);
                }}
                className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300/90 rounded-xl text-xs font-black flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
                title="Omitir archivo y pasar directamente a vincular fotos"
              >
                <ImageIcon className="w-3.5 h-3.5 text-[#C37D41]" />
                <span>Solo Fotos</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setImportMode('csv_import');
                  setStep(1);
                }}
                className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-300/90 rounded-xl text-xs font-black flex items-center gap-1 transition-all cursor-pointer shadow-2xs active:scale-95 whitespace-nowrap"
                title="Volver a importación con archivo Excel o CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-sky-700" />
                <span>Usar Archivo</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4">
          {/* CSV/EXCEL MODE - STEP 1: Upload Excel / CSV & Preview */}
          {importMode === 'csv_import' && step === 1 && (
            <div className="space-y-4">
              {parsedRows.length === 0 ? (
                <div className="border-2 border-dashed border-slate-300 hover:border-[#3C5866] rounded-2xl p-6 sm:p-8 bg-slate-50 hover:bg-slate-100/70 text-center transition-all relative cursor-pointer group">
                  <FileSpreadsheet className="w-9 h-9 text-[#3C5866] mx-auto mb-2 group-hover:scale-105 transition-transform" />
                  <span className="text-xs font-black text-[#3C5866] block">
                    Haz clic o arrastra tu archivo Excel (.xlsx) o .CSV aquí
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium block mt-1">
                    Formatos: Excel (.xlsx), .xls o .csv • Columnas: Código, Descripción, Medida, Peso Relleno (g), Cantidad, Precios
                  </span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              ) : (
                <div className="space-y-3 bg-white p-4 rounded-2xl border border-emerald-200/80 shadow-sm animate-in fade-in">
                  {/* Resumen del Archivo */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-black text-[#3C5866]">
                        {csvFile?.name}
                      </span>
                    </div>
                    <label className="text-[11px] text-slate-500 font-bold hover:text-[#3C5866] cursor-pointer bg-slate-100 px-2.5 py-1 rounded-lg transition-colors">
                      <span>Cambiar archivo</span>
                      <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* Métricas destacadas con Diff */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Total en Archivo</span>
                      <span className="text-sm font-black text-[#3C5866]">{parsedRows.length} refs</span>
                    </div>
                    <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-300/80">
                      <span className="text-[10px] uppercase font-bold text-amber-700 block">🔄 A Modificar</span>
                      <span className="text-sm font-black text-amber-900">{modifiedRows.length} refs</span>
                    </div>
                    <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-300/80">
                      <span className="text-[10px] uppercase font-bold text-emerald-700 block">✨ Nuevas Refs</span>
                      <span className="text-sm font-black text-emerald-900">{newRows.length} refs</span>
                    </div>
                    <div className="bg-purple-50 p-2.5 rounded-xl border border-purple-200">
                      <span className="text-[10px] uppercase font-bold text-purple-700 block">⚖️ Con Peso Relleno</span>
                      <span className="text-sm font-black text-purple-900">{weightRowsCount} refs</span>
                    </div>
                    <div className="col-span-2 sm:col-span-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">🛡️ Sin Cambios</span>
                      <span className="text-sm font-black text-slate-600">{unchangedRows.length} refs</span>
                    </div>
                  </div>

                  {/* Pestañas de filtrado de vista previa */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 overflow-x-auto text-[11px]">
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('all')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          previewFilter === 'all'
                            ? 'bg-[#3C5866] text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Todas ({parsedRows.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('modified')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          previewFilter === 'modified'
                            ? 'bg-amber-600 text-white shadow-xs'
                            : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        Modificadas ({modifiedRows.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('new')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          previewFilter === 'new'
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                        }`}
                      >
                        Nuevas ({newRows.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('unchanged')}
                        className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                          previewFilter === 'unchanged'
                            ? 'bg-slate-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Sin Cambios ({unchangedRows.length})
                      </button>
                    </div>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      Destino: <strong className="text-[#3C5866]">{targetBranchName}</strong>
                    </span>
                  </div>

                  {/* Vista previa compacta interactiva */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-[11px]">
                    <div className="bg-slate-100 px-3 py-1.5 font-black text-slate-600 flex justify-between items-center">
                      <span>
                        Referencias mostradas ({Math.min(filteredPreviewRows.length, 25)} de {filteredPreviewRows.length}):
                      </span>
                      <span className="text-slate-400 font-semibold text-[10px]">
                        {previewFilter === 'modified' ? 'Detectando cambios en precios/pesos' : 'Revisión previa'}
                      </span>
                    </div>
                    <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 bg-white">
                      {filteredPreviewRows.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-xs italic">
                          No hay referencias en esta categoría.
                        </div>
                      ) : (
                        filteredPreviewRows.slice(0, 25).map((item, idx) => (
                          <div key={idx} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 hover:bg-slate-50/80 transition-colors">
                            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                              <span className="font-mono text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                {item.row.sku}
                              </span>
                              <span className="font-bold text-slate-800 truncate max-w-[180px] sm:max-w-xs">
                                {item.row.name}
                              </span>
                              {item.row.size && <span className="text-slate-400 text-[10px]">({item.row.size})</span>}

                              {/* Status Badge */}
                              {item.status === 'new' && (
                                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  ✨ Nueva
                                </span>
                              )}
                              {item.status === 'unchanged' && (
                                <span className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-slate-100 text-slate-400">
                                  ✓ Sin cambios
                                </span>
                              )}
                            </div>

                            {/* Detailed changes chips or summary */}
                            <div className="flex flex-wrap items-center gap-1.5 shrink-0 self-end sm:self-center">
                              {item.status === 'modified' && item.changes.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1">
                                  {item.changes.map((ch, cIdx) => (
                                    <span
                                      key={cIdx}
                                      className="px-1.5 py-0.5 rounded text-[9.5px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5"
                                    >
                                      <span>{ch.label}:</span>
                                      <span className="line-through text-amber-600/80 font-normal">{ch.oldVal}</span>
                                      <span>➔</span>
                                      <span className="text-emerald-700 underline">{ch.newVal}</span>
                                    </span>
                                  ))}
                                </div>
                              )}

                              <span className={`px-2 py-0.5 rounded-full font-black text-[10.5px] ${
                                item.row.filledWeight !== undefined && item.row.filledWeight > 0
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-slate-100 text-slate-400'
                              }`}>
                                ⚖️ {item.row.filledWeight !== undefined && item.row.filledWeight > 0 ? `${item.row.filledWeight}g` : '0g'}
                              </span>
                              <span className="text-slate-500 font-semibold text-[10px]">
                                {item.row.stock} u.
                              </span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Acciones directas del Paso 1 */}
                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="w-full sm:w-auto px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-slate-500" />
                      <span>Vincular Fotos (Opcional)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExecuteImport}
                      disabled={loading}
                      className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>⚡ Guardar e Importar Ahora ({modifiedRows.length} a actualizar, {newRows.length} nuevas)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CSV MODE - STEP 2: Upload Image Batch with Shared Bank Detection & Multi-SKU Matching */}
          {importMode === 'csv_import' && step >= 2 && (() => {
            const masterProducts = getLocalProducts();
            const sharedImageBank: Record<string, { url: string; sourceSku: string }> = {};
            masterProducts.forEach((p) => {
              if (p.processedImageUrl && p.processedImageUrl !== '/assets/REF_1.jpg') {
                const bSku = getBaseSku(p.sku);
                if (bSku && !sharedImageBank[bSku]) {
                  sharedImageBank[bSku] = { url: p.processedImageUrl, sourceSku: p.sku };
                }
              }
            });

            const sharedCount = parsedRows.filter((r) => {
              const bSku = getBaseSku(r.sku);
              return bSku && sharedImageBank[bSku] && !findMatchingImage(r.sku, imageFiles);
            }).length;

            const localCount = parsedRows.filter((r) => findMatchingImage(r.sku, imageFiles)).length;

            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase">
                  <span>2. Asignación de Fotos (Banco Compartido o Archivos)</span>
                  <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-bold">
                    {parsedRows.length} Referencias en CSV
                  </span>
                </div>

                {/* Smart Image Bank Summary Alert */}
                <div className="bg-amber-50/80 border border-amber-200/80 p-3 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
                  <Link2 className="w-4 h-4 text-[#C37D41] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-amber-950">
                      Detección Automática de Fotos Compartidas & Multi-Referencia
                    </p>
                    <p className="text-[11px] text-amber-800 leading-snug mt-0.5">
                      {sharedCount > 0 ? (
                        <>
                          <strong className="text-emerald-700 font-extrabold">{sharedCount} referencias</strong> ya tienen foto vinculada automáticamente desde otra sucursal por su código base.
                          {localCount > 0 ? ` Además, seleccionaste ${localCount} fotos locales.` : ' No necesitas volver a subir esas fotos a menos que desees cambiarlas.'}
                        </>
                      ) : (
                        'No se encontraron fotos previas por código base. Puedes seleccionar archivos de imagen desde tu equipo.'
                      )}
                    </p>
                  </div>
                </div>

                {/* Image Upload Box */}
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 bg-slate-50 text-center hover:bg-slate-100 transition-colors relative">
                  <ImageIcon className="w-7 h-7 text-[#C37D41] mx-auto mb-1" />
                  <span className="text-xs font-bold text-[#3C5866] block">
                    {imageFiles.length > 0
                      ? `${imageFiles.length} imágenes locales seleccionadas`
                      : 'Haz clic aquí para seleccionar fotos nuevas de tu equipo (Opcional)'}
                  </span>
                  <p className="text-[10.5px] text-slate-500 mt-0.5 font-medium">
                    Vinculación por REF completa (ej: PEL-3 CR), Código Base (ej: PEL-3) o Multi-Referencia (ej: PEL-18, PEL-19.jpg).
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImagesChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                {/* Smart Matching Verification List */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[11px] font-bold text-slate-700">
                    <span>Estado de Vinculación de Fotos ({parsedRows.length} refs):</span>
                    <span className="text-slate-400 text-[10.5px] font-semibold">
                      {localCount} locales | {sharedCount} compartidas
                    </span>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 text-xs space-y-1 max-h-40 overflow-y-auto">
                    {parsedRows.map((row) => {
                      const matchedResult = findMatchingImage(row.sku, imageFiles);
                      const baseSku = getBaseSku(row.sku);
                      const sharedMatch = baseSku ? sharedImageBank[baseSku] : null;
                      const isExact =
                        matchedResult &&
                        cleanSkuString(
                          matchedResult.file.name.substring(
                            0,
                            matchedResult.file.name.lastIndexOf('.')
                          )
                        ) === cleanSkuString(row.sku);
                      const isMulti = matchedResult && matchedResult.allMatchedSkus.length > 1;

                      return (
                        <div key={row.sku} className="flex justify-between items-center text-[11px] py-1 border-b border-slate-200/50 last:border-none">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-extrabold text-[#C37D41] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60 shrink-0 font-mono text-[10px]">
                              {row.sku}
                            </span>
                            <span className="font-bold text-[#3C5866] truncate">
                              {row.name} {row.size ? `(${row.size})` : ''} {row.filledWeight ? `• ${row.filledWeight}g` : ''}
                            </span>
                          </div>

                          {matchedResult ? (
                            <span
                              className="text-emerald-700 font-bold flex items-center gap-1 text-[10px] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0"
                              title={`Foto local asociada: ${matchedResult.file.name} (Refs: ${matchedResult.allMatchedSkus.join(', ')})`}
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>
                                {isMulti
                                  ? `Multi-Ref (${matchedResult.file.name})`
                                  : isExact
                                  ? matchedResult.file.name
                                  : `Foto Local (${baseSku})`}
                              </span>
                            </span>
                          ) : sharedMatch ? (
                            <span className="text-amber-800 font-bold flex items-center gap-1 text-[10px] bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0" title={`Foto heredada de ${sharedMatch.sourceSku}`}>
                              <Link2 className="w-3 h-3 text-[#C37D41]" />
                              <span>Hereda de {sharedMatch.sourceSku}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium text-[10px] bg-slate-100 px-2 py-0.5 rounded-full shrink-0">
                              Sin foto asignada
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* PHOTOS ONLY MODE - STEP 1: Upload and preview standalone batch photos with Conflict Resolution */}
          {importMode === 'photos_only' && step === 1 && (() => {
            const masterProducts = getLocalProducts();
            const matchedProductsMap = new Map<string, { product: Product; file: File; extractedSkus: string[] }>();

            imageFiles.forEach((file) => {
              const extractedSkus = extractSkusFromFilename(file.name);
              masterProducts.forEach((p) => {
                const pSku = cleanSkuString(p.sku);
                const pBaseSku = getBaseSku(pSku);
                const isMatch = extractedSkus.some((extracted) => {
                  const cleanExt = cleanSkuString(extracted);
                  const extBaseSku = getBaseSku(cleanExt);
                  return (
                    cleanExt === pSku ||
                    extBaseSku === pBaseSku ||
                    cleanExt === pBaseSku ||
                    extBaseSku === pSku
                  );
                });

                if (isMatch) {
                  matchedProductsMap.set(p.id, { product: p, file, extractedSkus });
                }
              });
            });

            const allMatches = Array.from(matchedProductsMap.values());
            const newAssignments = allMatches.filter(
              ({ product }) => !product.processedImageUrl || product.processedImageUrl === '/assets/REF_1.jpg'
            );
            const conflictAssignments = allMatches.filter(
              ({ product }) => product.processedImageUrl && product.processedImageUrl !== '/assets/REF_1.jpg'
            );

            return (
              <div className="space-y-4">
                <div className="bg-amber-50/80 border border-amber-200/80 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
                  <Sparkles className="w-4 h-4 text-[#C37D41] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-amber-950">
                      Carga Directa de Fotos & Reconocimiento Multi-Referencia
                    </p>
                    <p className="text-[11px] text-amber-800 leading-snug mt-0.5">
                      Sube las imágenes para tus referencias existentes. Si una foto tiene nombres como <strong className="text-[#3C5866]">PEL-18, PEL-19.jpg</strong> o <strong className="text-[#3C5866]">PEL-18 y PEL-19.png</strong>, se asociará a todos esos códigos. Si una referencia ya tiene foto, podrás elegir si deseas conservarla o reemplazarla.
                    </p>
                  </div>
                </div>

                {/* Upload Box */}
                <div className="border-2 border-dashed border-slate-200 rounded-2xl p-5 bg-slate-50 text-center hover:bg-slate-100 transition-colors relative">
                  <ImageIcon className="w-9 h-9 text-[#C37D41] mx-auto mb-1.5" />
                  <span className="text-xs font-bold text-[#3C5866] block">
                    {imageFiles.length > 0
                      ? `${imageFiles.length} fotos seleccionadas (${allMatches.length} referencias coincidentes)`
                      : 'Haz clic aquí para seleccionar el lote de fotos de tu equipo'}
                  </span>
                  <p className="text-[11px] text-slate-500 font-semibold mt-1">
                    Formatos soportados: JPG, PNG, WEBP.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImagesChange}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>

                {/* Conflict Resolution & Matches Section */}
                {imageFiles.length > 0 && (
                  <div className="space-y-3">
                    {/* CONFLICT RESOLUTION CARD */}
                    {conflictAssignments.length > 0 && (
                      <div className="bg-amber-50/90 border border-amber-300 rounded-2xl p-3.5 space-y-2.5 shadow-2xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/80 pb-2">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-[#C37D41] shrink-0" />
                            <div>
                              <span className="font-extrabold text-xs text-amber-950 block">
                                {conflictAssignments.length} referencias ya cuentan con una foto asignada
                              </span>
                              <span className="text-[10.5px] text-amber-800 font-medium">
                                Selecciona si deseas sobrescribir o mantener la foto actual:
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const next: Record<string, boolean> = {};
                                conflictAssignments.forEach(({ product }) => {
                                  next[product.id] = true;
                                });
                                setOverwriteProductIds((prev) => ({ ...prev, ...next }));
                              }}
                              className="text-[10.5px] font-extrabold bg-[#3C5866] hover:bg-[#263842] text-white px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer"
                            >
                              ✓ Reemplazar Todas
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next: Record<string, boolean> = {};
                                conflictAssignments.forEach(({ product }) => {
                                  next[product.id] = false;
                                });
                                setOverwriteProductIds((prev) => ({ ...prev, ...next }));
                              }}
                              className="text-[10.5px] font-extrabold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-2.5 py-1 rounded-lg transition-all shadow-2xs cursor-pointer"
                            >
                              🛡️ Conservar Actuales
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {conflictAssignments.map(({ product, file }) => {
                            const willOverwrite = overwriteProductIds[product.id] !== false;
                            return (
                              <div
                                key={`${product.id}-${file.name}`}
                                className="flex items-center justify-between p-2 bg-white rounded-xl border border-amber-200/70 text-xs gap-2"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="relative w-9 h-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                                    <Image
                                      src={product.processedImageUrl!}
                                      alt={product.name}
                                      fill
                                      className="object-cover"
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-extrabold text-[#C37D41] text-[10.5px] bg-amber-50 px-1 py-0.5 rounded border border-amber-200/60">
                                        {product.sku}
                                      </span>
                                      <span className="font-bold text-slate-800 text-[11px] truncate">
                                        {product.name}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 block truncate mt-0.5">
                                      Nueva foto detectada: <strong className="text-slate-600">{file.name}</strong>
                                    </span>
                                  </div>
                                </div>

                                <label className="flex items-center gap-1.5 cursor-pointer shrink-0 bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 transition-colors">
                                  <input
                                    type="checkbox"
                                    checked={willOverwrite}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setOverwriteProductIds((prev) => ({
                                        ...prev,
                                        [product.id]: checked,
                                      }));
                                    }}
                                    className="rounded border-slate-300 text-[#3C5866] focus:ring-[#3C5866] w-3.5 h-3.5 cursor-pointer"
                                  />
                                  <span className={`text-[10.5px] font-extrabold ${willOverwrite ? 'text-emerald-700' : 'text-slate-500'}`}>
                                    {willOverwrite ? 'Sobrescribir' : 'Conservar'}
                                  </span>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* NEW ASSIGNMENTS SECTION */}
                    {newAssignments.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                          <span>✨ Nuevas asignaciones sin foto previa ({newAssignments.length}):</span>
                          <span className="text-emerald-700 font-extrabold text-[10.5px]">Se asignarán automáticamente</span>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                          {newAssignments.map(({ product, file, extractedSkus }) => (
                            <span
                              key={`${product.id}-${file.name}`}
                              className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-200"
                              title={`Asignada desde ${file.name}${extractedSkus.length > 1 ? ` (Multi-Ref: ${extractedSkus.join(', ')})` : ''}`}
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{product.sku} - {product.name}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {allMatches.length === 0 && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500 font-medium">
                        No se encontraron referencias coincidentes en el inventario actual para los nombres de los archivos seleccionados.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* STEP 3: Execution Progress & Logs */}
          {step === 3 && (
            <div className="space-y-3 py-2">
              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold text-[#3C5866]">
                  <span>Procesando Estandarización 600x600 WebP...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              <div
                ref={logsContainerRef}
                className="bg-slate-900 text-slate-200 p-3 rounded-xl font-mono text-[10.5px] max-h-48 overflow-y-auto space-y-1 scroll-smooth shadow-inner border border-slate-800"
              >
                {logMessages.map((msg, idx) => (
                  <div key={idx} className="leading-relaxed">{msg}</div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {step === 3 && !loading ? 'Cerrar' : 'Cancelar'}
            </button>

            {importMode === 'csv_import' && step === 2 && (
              <button
                onClick={handleExecuteImport}
                disabled={parsedRows.length === 0 || loading}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>⚡ Guardar e Importar Ahora ({parsedRows.length} refs)</span>
              </button>
            )}

            {importMode === 'photos_only' && step === 1 && (
              <button
                onClick={handleExecutePhotoOnlyUpdate}
                disabled={imageFiles.length === 0 || loading}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Vincular y Guardar {imageFiles.length} Fotos</span>
              </button>
            )}

            {step === 3 && !loading && (
              <button
                onClick={onClose}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95 animate-in fade-in"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ver Catálogo Actualizado</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PRE-IMPORT CONFIRMATION WARNING DIALOG */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-amber-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-amber-500 text-white p-4 flex items-center gap-3">
              <AlertTriangle className="w-7 h-7 text-[#FFF3CD] shrink-0" />
              <div>
                <h3 className="font-extrabold text-sm sm:text-base">¿Confirmar Importación Masiva?</h3>
                <p className="text-[11px] text-amber-100 font-semibold">Revisa los detalles antes de actualizar el catálogo</p>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-amber-50/80 p-3.5 rounded-2xl border border-amber-200 space-y-2">
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                  <span className="font-bold text-amber-900">📍 Sucursal Destino:</span>
                  <span className="font-black text-[#3C5866] text-xs">
                    {targetBranchName}
                  </span>
                </div>

                <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                  <span className="font-bold text-amber-900">🌎 País & Moneda:</span>
                  <span className="font-extrabold text-slate-800">
                    {targetCountry} • {targetCurrencySymbol} ({targetCurrencyCode})
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="bg-white p-2 rounded-xl border border-amber-200/80 text-center">
                    <span className="text-[9.5px] uppercase font-bold text-slate-400 block">Referencias CSV</span>
                    <span className="text-sm font-black text-[#3C5866]">{parsedRows.length}</span>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-amber-200/80 text-center">
                    <span className="text-[9.5px] uppercase font-bold text-slate-400 block">Fotos Cargadas</span>
                    <span className="text-sm font-black text-[#C37D41]">{imageFiles.length}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[10.5px] pt-1 font-bold text-slate-700">
                  <span>🔗 Fotos Vinculadas:</span>
                  <span className="text-emerald-700 font-extrabold">
                    {parsedRows.filter((r) => findMatchingImage(r.sku, imageFiles) !== undefined).length} / {parsedRows.length} referencias
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <p className="text-[11px] text-slate-700 font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-[#C37D41] shrink-0" />
                  <span>Confirmación de Carga</span>
                </p>
                <p className="text-[10.5px] text-slate-500 leading-relaxed">
                  Las <strong className="text-slate-700">{parsedRows.length} referencias</strong> del archivo CSV se guardarán en el catálogo y se asignarán a la sucursal <strong className="text-[#3C5866]">{targetBranchName}</strong> ({targetCountry}).
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Regresar / Revisar
                </button>
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    handleExecuteImport();
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar e Importar Ahora</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
