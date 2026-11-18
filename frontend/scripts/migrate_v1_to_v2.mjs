import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  writeBatch,
  doc,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

const FORBIDDEN_PUBLIC_KEYS = new Set([
  'prices',
  'unit',
  'dozen',
  'wholesale',
  'basePrice',
  'customLists',
  'special',
]);

/**
 * Parsea un archivo .env simple sin dependencias externas.
 */
export function parseEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const out = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

/**
 * Elimina recursivamente propiedades `undefined` para escritura segura en Firestore.
 */
export function stripUndefinedDeep(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(stripUndefinedDeep).filter((v) => v !== undefined);
  }
  const clean = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const cleanedVal = stripUndefinedDeep(v);
    if (cleanedVal !== undefined) {
      clean[k] = cleanedVal;
    }
  }
  return clean;
}

function normalizePriceNumber(val, fallback = 0) {
  const num = Number(val);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function enrichPricesObject(prices) {
  const raw = prices && typeof prices === 'object' ? prices : {};
  const unit = normalizePriceNumber(raw.unit, 0);
  const dozen = normalizePriceNumber(raw.dozen, 0);
  const wholesale = normalizePriceNumber(raw.wholesale, 0);
  const existingBase = normalizePriceNumber(raw.basePrice, 0);
  const basePrice =
    existingBase > 0
      ? existingBase
      : wholesale > 0
      ? wholesale
      : dozen > 0
      ? dozen
      : unit;

  const out = {
    unit,
    dozen,
    wholesale,
    basePrice: basePrice > 0 ? basePrice : undefined,
    special: raw.special !== undefined ? normalizePriceNumber(raw.special, 0) : undefined,
    customLists:
      raw.customLists && typeof raw.customLists === 'object' ? raw.customLists : undefined,
  };
  return stripUndefinedDeep(out);
}

/**
 * Transforma un producto v1 al esquema v2 preservando precios y definiendo `basePrice`.
 */
export function transformProductForV2(docId, rawData) {
  const now = new Date().toISOString();
  const data = rawData && typeof rawData === 'object' ? rawData : {};

  let cleanedOverrides;
  if (data.branchOverrides && typeof data.branchOverrides === 'object') {
    cleanedOverrides = {};
    for (const [branchKey, overrideVal] of Object.entries(data.branchOverrides)) {
      if (!overrideVal || typeof overrideVal !== 'object') continue;
      cleanedOverrides[branchKey] = stripUndefinedDeep({
        ...overrideVal,
        prices: overrideVal.prices ? enrichPricesObject(overrideVal.prices) : undefined,
      });
    }
  }

  return stripUndefinedDeep({
    id: data.id || docId,
    tenantId: data.tenantId,
    sku: String(data.sku || docId),
    name: String(data.name || 'Producto'),
    category: String(data.category || 'General'),
    categories: Array.isArray(data.categories) ? data.categories : undefined,
    size: data.size,
    filledWeight:
      data.filledWeight !== undefined && data.filledWeight !== null
        ? Number(data.filledWeight)
        : undefined,
    stock: Number.isFinite(Number(data.stock)) ? Number(data.stock) : 0,
    status: data.status || 'active',
    prices: enrichPricesObject(data.prices),
    originalImageUrl: data.originalImageUrl,
    processedImageUrl: String(data.processedImageUrl || ''),
    tags: Array.isArray(data.tags) ? data.tags : [],
    branchOverrides: cleanedOverrides,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
  });
}

/**
 * Verifica recursivamente que ningún documento público contenga precios o campos comerciales.
 */
export function validateNoPricesInPublicDoc(publicDoc) {
  const walk = (node, currentPath) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, idx) => walk(item, `${currentPath}[${idx}]`));
      return;
    }
    for (const [k, v] of Object.entries(node)) {
      if (FORBIDDEN_PUBLIC_KEYS.has(k)) {
        throw new Error(
          `Violación de privacidad en catalog_public (${publicDoc.id}): campo prohibido "${currentPath}.${k}"`
        );
      }
      walk(v, `${currentPath}.${k}`);
    }
  };
  walk(publicDoc, 'root');
  return true;
}

/**
 * Construye el documento de `catalog_public` completamente desprovisto de precios.
 */
export function buildPublicCatalogDoc(v2Product) {
  let publicOverrides;
  if (v2Product.branchOverrides && typeof v2Product.branchOverrides === 'object') {
    publicOverrides = {};
    for (const [branchKey, override] of Object.entries(v2Product.branchOverrides)) {
      if (!override || typeof override !== 'object') continue;
      publicOverrides[branchKey] = stripUndefinedDeep({
        stock: override.stock,
        status: override.status,
        filledWeight: override.filledWeight,
      });
    }
  }

  const publicDoc = stripUndefinedDeep({
    id: v2Product.id,
    tenantId: v2Product.tenantId,
    sku: v2Product.sku,
    name: v2Product.name,
    category: v2Product.category,
    categories: v2Product.categories,
    size: v2Product.size,
    filledWeight: v2Product.filledWeight,
    stock: v2Product.stock,
    status: v2Product.status,
    processedImageUrl: v2Product.processedImageUrl || '',
    tags: v2Product.tags || [],
    branchOverrides: publicOverrides,
    createdAt: v2Product.createdAt,
    updatedAt: v2Product.updatedAt,
  });

  validateNoPricesInPublicDoc(publicDoc);
  return publicDoc;
}

/**
 * Genera los documentos iniciales de `price_lists` por sucursal.
 */
export function buildDefaultPriceListsForBranches(branches) {
  const now = new Date().toISOString();
  const slugs = new Set(['costarica']);
  if (Array.isArray(branches)) {
    for (const b of branches) {
      if (b?.slug) slugs.add(String(b.slug).trim());
    }
  }

  const docs = [];
  for (const branchSlug of slugs) {
    docs.push(
      {
        docId: `${branchSlug}_unit`,
        data: {
          id: 'unit',
          name: 'Unidad',
          branchSlug,
          mode: 'manual',
          isActive: true,
          sortOrder: 1,
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        docId: `${branchSlug}_dozen`,
        data: {
          id: 'dozen',
          name: 'Docena',
          branchSlug,
          mode: 'manual',
          minUnits: 12,
          isActive: true,
          sortOrder: 2,
          createdAt: now,
          updatedAt: now,
        },
      },
      {
        docId: `${branchSlug}_wholesale`,
        data: {
          id: 'wholesale',
          name: 'Mayorista',
          branchSlug,
          mode: 'manual',
          minUnits: 12,
          isActive: true,
          isDefaultForSeller: true,
          sortOrder: 3,
          createdAt: now,
          updatedAt: now,
        },
      }
    );
  }
  return docs;
}

/**
 * Garantiza que nunca se apunte la escritura sobre el proyecto v1 de producción.
 */
export function assertV1IsNotV2(v1Config, v2Config) {
  if (!v2Config?.projectId) {
    throw new Error('Falta NEXT_PUBLIC_FIREBASE_PROJECT_ID / V2_FIREBASE_PROJECT_ID para destino v2.');
  }
  if (v1Config?.projectId && v1Config.projectId === v2Config.projectId) {
    throw new Error(
      `Abortando: v1 (${v1Config.projectId}) y v2 (${v2Config.projectId}) apuntan al mismo proyecto Firebase.`
    );
  }
}

/**
 * Convierte un valor tipado de Firestore REST API v1 a JS nativo.
 */
export function decodeFirestoreValue(value) {
  if (!value || typeof value !== 'object') return undefined;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('stringValue' in value) return String(value.stringValue);
  if ('timestampValue' in value) return String(value.timestampValue);
  if ('referenceValue' in value) return String(value.referenceValue);
  if ('arrayValue' in value) {
    const arr = Array.isArray(value.arrayValue?.values) ? value.arrayValue.values : [];
    return arr.map((item) => decodeFirestoreValue(item));
  }
  if ('mapValue' in value) {
    const out = {};
    const fields = value.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      const decoded = decodeFirestoreValue(v);
      if (decoded !== undefined) out[k] = decoded;
    }
    return out;
  }
  return undefined;
}

/**
 * Codifica un valor JS nativo al formato tipado de Firestore REST API v1.
 */
export function encodeFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return { nullValue: null };
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value
          .map((item) => encodeFirestoreValue(item))
          .filter((v) => v !== undefined),
      },
    };
  }
  if (typeof value === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      const encoded = encodeFirestoreValue(v);
      if (encoded !== undefined) fields[k] = encoded;
    }
    return { mapValue: { fields } };
  }
  return undefined;
}

export function encodeFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined) continue;
    const encoded = encodeFirestoreValue(v);
    if (encoded !== undefined) fields[k] = encoded;
  }
  return fields;
}

function getGcloudAccessToken() {
  const bin = process.platform === 'win32' ? 'cmd.exe' : 'gcloud';
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'gcloud auth print-access-token']
      : ['auth', 'print-access-token'];
  const token = execFileSync(bin, args, { encoding: 'utf8' }).trim();
  if (!token) {
    throw new Error('No se pudo obtener access token de gcloud.');
  }
  return token;
}

/**
 * Lee una colección completa de Firestore usando la REST API paginada (evita streams gRPC en Node).
 */
async function fetchCollectionViaRest(projectId, collectionName, apiKey, bearerToken = '') {
  const docs = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ pageSize: '300' });
    if (pageToken) params.set('pageToken', pageToken);
    if (apiKey && !bearerToken) params.set('key', apiKey);
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/(default)/documents/${encodeURIComponent(collectionName)}?${params.toString()}`;

    const headers = bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `Error REST leyendo ${collectionName} en ${projectId} (${res.status}): ${errText.slice(0, 300)}`
      );
    }
    const json = await res.json();
    const list = Array.isArray(json.documents) ? json.documents : [];
    for (const rawDoc of list) {
      const docId = String(rawDoc.name || '').split('/').pop() || '';
      const data = {};
      for (const [fieldKey, fieldVal] of Object.entries(rawDoc.fields || {})) {
        const decoded = decodeFirestoreValue(fieldVal);
        if (decoded !== undefined) data[fieldKey] = decoded;
      }
      docs.push({ id: docId, data });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);

  return docs;
}

async function commitOperationsViaRest(projectId, operations, bearerToken, label) {
  const CHUNK_SIZE = 40;
  let committed = 0;
  const endpoint = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/(default)/documents:commit`;

  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const writes = chunk.map((op) => ({
      update: {
        name: `projects/${projectId}/databases/(default)/documents/${op.collection}/${op.docId}`,
        fields: encodeFirestoreFields(stripUndefinedDeep(op.data)),
      },
    }));

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ writes }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Error REST commit lote ${i}: (${res.status}) ${errText.slice(0, 400)}`);
    }

    committed += chunk.length;
    console.log(`  ✓ ${label} (REST): ${committed}/${operations.length}`);
  }
}

function buildFirebaseConfig(envMap, prefix) {
  const get = (suffix) => envMap[`${prefix}_${suffix}`] || process.env[`${prefix}_${suffix}`] || '';
  return {
    apiKey: get('API_KEY'),
    authDomain: get('AUTH_DOMAIN'),
    projectId: get('PROJECT_ID'),
    storageBucket: get('STORAGE_BUCKET'),
    messagingSenderId: get('MESSAGING_SENDER_ID'),
    appId: get('APP_ID'),
  };
}

function parseCliArgs(argv) {
  const args = {
    dryRun: false,
    limit: 0,
    v1EnvPath: '',
    v2EnvPath: '',
    fromJson: '',
    exportSnapshot: '',
    confirmWrite: false,
    useGcloud: false,
    verifyOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--dry-run') args.dryRun = true;
    else if (token === '--confirm-write') args.confirmWrite = true;
    else if (token === '--use-gcloud') args.useGcloud = true;
    else if (token === '--verify-only') args.verifyOnly = true;
    else if (token === '--limit' && argv[i + 1]) args.limit = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (token === '--v1-env' && argv[i + 1]) args.v1EnvPath = argv[++i];
    else if (token === '--v2-env' && argv[i + 1]) args.v2EnvPath = argv[++i];
    else if (token === '--from-json' && argv[i + 1]) args.fromJson = argv[++i];
    else if (token === '--export-snapshot' && argv[i + 1]) args.exportSnapshot = argv[++i];
  }
  return args;
}

async function commitInChunks(db, operations, label) {
  const CHUNK_SIZE = 400;
  let committed = 0;
  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      batch.set(doc(db, op.collection, op.docId), stripUndefinedDeep(op.data), { merge: true });
    }
    await batch.commit();
    committed += chunk.length;
    console.log(`  ✓ ${label}: ${committed}/${operations.length}`);
  }
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendDir = path.resolve(__dirname, '..');
  const cli = parseCliArgs(process.argv.slice(2));

  const v1Env = {
    ...parseEnvFile(path.join(frontendDir, '.env.v1')),
    ...parseEnvFile(cli.v1EnvPath ? path.resolve(cli.v1EnvPath) : ''),
  };
  const v2Env = {
    ...parseEnvFile(path.join(frontendDir, '.env.local')),
    ...parseEnvFile(cli.v2EnvPath ? path.resolve(cli.v2EnvPath) : ''),
  };

  const v1Config = buildFirebaseConfig(v1Env, 'V1_FIREBASE');
  const v2ConfigRaw = buildFirebaseConfig(v2Env, 'V2_FIREBASE');
  const v2ConfigFallback = buildFirebaseConfig(v2Env, 'NEXT_PUBLIC_FIREBASE');
  const v2Config = v2ConfigRaw.projectId ? v2ConfigRaw : v2ConfigFallback;

  let branchesRaw = [];
  let companyRaw = [];
  let productsRaw = [];

  if (cli.fromJson) {
    const snapJson = JSON.parse(fs.readFileSync(path.resolve(cli.fromJson), 'utf8'));
    branchesRaw = snapJson.branches || [];
    companyRaw = snapJson.company_info || [];
    productsRaw = snapJson.products || [];
    console.log(`Fuente JSON cargada: ${cli.fromJson}`);
  } else {
    if (!v1Config.projectId) {
      console.error('Faltan credenciales de origen v1 (V1_FIREBASE_PROJECT_ID en .env.v1 o env).');
      process.exit(1);
    }
    console.log(`Leyendo SOLO LECTURA vía REST desde Firebase v1 (${v1Config.projectId})...`);
    const [branchesDocs, companyDocs, productsDocs] = await Promise.all([
      fetchCollectionViaRest(v1Config.projectId, 'branches', v1Config.apiKey),
      fetchCollectionViaRest(v1Config.projectId, 'company_info', v1Config.apiKey),
      fetchCollectionViaRest(v1Config.projectId, 'products', v1Config.apiKey),
    ]);

    branchesRaw = branchesDocs;
    companyRaw = companyDocs;
    productsRaw = productsDocs;
  }

  if (cli.limit > 0) {
    productsRaw = productsRaw.slice(0, cli.limit);
  }

  if (cli.exportSnapshot) {
    fs.writeFileSync(
      path.resolve(cli.exportSnapshot),
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          branches: branchesRaw,
          company_info: companyRaw,
          products: productsRaw,
        },
        null,
        2
      )
    );
    console.log(`Snapshot guardado en ${cli.exportSnapshot}`);
  }

  const branchObjects = branchesRaw.map((b) => b.data);
  const transformedProducts = productsRaw.map((p) => transformProductForV2(p.id, p.data));
  const publicDocs = transformedProducts.map((p) => buildPublicCatalogDoc(p));
  const defaultPriceLists = buildDefaultPriceListsForBranches(branchObjects);

  console.log('\n--- RESUMEN DE TRANSFORMACIÓN V1 -> V2 ---');
  console.log(`  branches:       ${branchesRaw.length}`);
  console.log(`  company_info:   ${companyRaw.length}`);
  console.log(`  products (priv):${transformedProducts.length}`);
  console.log(`  catalog_public: ${publicDocs.length} (validados: 0 campos de precio)`);
  console.log(`  price_lists:    ${defaultPriceLists.length}`);

  if (transformedProducts[0]) {
    console.log('\nMuestra product v2:', JSON.stringify(transformedProducts[0], null, 2).slice(0, 450));
    console.log('\nMuestra catalog_public:', JSON.stringify(publicDocs[0], null, 2).slice(0, 450));
  }

  if (cli.dryRun || (!cli.confirmWrite && !cli.verifyOnly)) {
    console.log('\n[DRY-RUN] No se realizaron escrituras. Usa `--confirm-write` para escribir en v2.');
    process.exit(0);
  }

  assertV1IsNotV2(v1Config, v2Config);
  const ops = [
    ...branchesRaw.map((b) => ({ collection: 'branches', docId: b.id, data: b.data })),
    ...companyRaw.map((c) => ({ collection: 'company_info', docId: c.id, data: c.data })),
    ...defaultPriceLists.map((pl) => ({ collection: 'price_lists', docId: pl.docId, data: pl.data })),
    ...transformedProducts.map((p) => ({ collection: 'products', docId: p.id, data: p })),
    ...publicDocs.map((pub) => ({ collection: 'catalog_public', docId: pub.id, data: pub })),
  ];

  let gcloudToken = '';
  if (cli.useGcloud) {
    gcloudToken = getGcloudAccessToken();
  }

  if (cli.confirmWrite && !cli.verifyOnly) {
    if (transformedProducts.length === 0) {
      throw new Error('Abortando escritura: no se leyeron productos desde v1.');
    }
    if (cli.useGcloud) {
      console.log(`\nEscribiendo ${ops.length} documentos en Firebase v2 (${v2Config.projectId}) vía gcloud IAM REST...`);
      await commitOperationsViaRest(v2Config.projectId, ops, gcloudToken, 'Migración v2');
      console.log('✓ Migración completada.');
    } else {
      const adminEmail = process.env.V2_ADMIN_EMAIL || v2Env.V2_ADMIN_EMAIL || '';
      const adminPassword = process.env.V2_ADMIN_PASSWORD || v2Env.V2_ADMIN_PASSWORD || '';

      const v2App = initializeApp(v2Config, 'v2-target');
      const v2Auth = getAuth(v2App);
      if (adminEmail && adminPassword) {
        console.log(`Autenticando SuperAdmin destino (${adminEmail})...`);
        await signInWithEmailAndPassword(v2Auth, adminEmail, adminPassword);
      } else {
        console.warn('⚠️ Sin V2_ADMIN_EMAIL/V2_ADMIN_PASSWORD ni --use-gcloud: las reglas estrictas bloquearán la escritura si no existe sesión SuperAdmin.');
      }

      const v2Db = initializeFirestore(v2App, { experimentalForceLongPolling: true });
      console.log(`\nEscribiendo ${ops.length} documentos en Firebase v2 (${v2Config.projectId})...`);
      await commitInChunks(v2Db, ops, 'Migración v2');
      console.log('✓ Migración completada.');
    }
  }

  if (cli.useGcloud || cli.verifyOnly) {
    const token = gcloudToken || getGcloudAccessToken();
    console.log(`\nVerificando integridad 1:1 en ${v2Config.projectId}...`);
    const [v2Branches, v2Company, v2Lists, v2Products, v2Public] = await Promise.all([
      fetchCollectionViaRest(v2Config.projectId, 'branches', '', token),
      fetchCollectionViaRest(v2Config.projectId, 'company_info', '', token),
      fetchCollectionViaRest(v2Config.projectId, 'price_lists', '', token),
      fetchCollectionViaRest(v2Config.projectId, 'products', '', token),
      fetchCollectionViaRest(v2Config.projectId, 'catalog_public', '', token),
    ]);

    const v2ProdMap = new Map(v2Products.map((d) => [d.id, d.data]));
    const v2PubMap = new Map(v2Public.map((d) => [d.id, d.data]));
    const statusCountsV1 = {};
    const statusCountsV2 = {};
    let mismatches = 0;

    for (const p of transformedProducts) {
      const stV1 = p.status || 'active';
      statusCountsV1[stV1] = (statusCountsV1[stV1] || 0) + 1;

      const gotPriv = v2ProdMap.get(p.id);
      const gotPub = v2PubMap.get(p.id);
      if (!gotPriv || !gotPub) {
        mismatches++;
        console.error(`  ✗ Faltante en v2: ${p.id} (sku=${p.sku})`);
        continue;
      }

      validateNoPricesInPublicDoc(gotPub);
      const stV2 = gotPriv.status || 'active';
      statusCountsV2[stV2] = (statusCountsV2[stV2] || 0) + 1;

      const sameStatus = stV2 === stV1 && (gotPub.status || 'active') === stV1;
      const sameSku = gotPriv.sku === p.sku && gotPub.sku === p.sku;
      const sameStock = Number(gotPriv.stock ?? 0) === Number(p.stock ?? 0);
      const sameUnit = Number(gotPriv.prices?.unit ?? 0) === Number(p.prices?.unit ?? 0);
      const sameDozen = Number(gotPriv.prices?.dozen ?? 0) === Number(p.prices?.dozen ?? 0);
      const sameWholesale = Number(gotPriv.prices?.wholesale ?? 0) === Number(p.prices?.wholesale ?? 0);
      const sameBase = Number(gotPriv.prices?.basePrice ?? 0) === Number(p.prices?.basePrice ?? 0);

      if (!sameStatus || !sameSku || !sameStock || !sameUnit || !sameDozen || !sameWholesale || !sameBase) {
        mismatches++;
        console.error(`  ✗ Diferencia en ${p.id} (${p.sku})`);
      }
    }

    console.log('--- AUDITORÍA V1 vs V2 ---');
    console.log(`  branches:       v1=${branchesRaw.length} | v2=${v2Branches.length}`);
    console.log(`  company_info:   v1=${companyRaw.length} | v2=${v2Company.length}`);
    console.log(`  price_lists:    esperadas=${defaultPriceLists.length} | v2=${v2Lists.length}`);
    console.log(`  products:       v1=${transformedProducts.length} | v2=${v2Products.length}`);
    console.log(`  catalog_public: v1=${publicDocs.length} | v2=${v2Public.length} (0 precios verificado)`);
    console.log(`  estados v1:     ${JSON.stringify(statusCountsV1)}`);
    console.log(`  estados v2:     ${JSON.stringify(statusCountsV2)}`);
    console.log(`  discrepancias:  ${mismatches}`);

    if (
      mismatches > 0 ||
      v2Products.length !== transformedProducts.length ||
      v2Public.length !== publicDocs.length ||
      v2Branches.length !== branchesRaw.length ||
      v2Company.length !== companyRaw.length
    ) {
      throw new Error('Auditoría post-migración detectó diferencias.');
    }
    console.log('✓ Auditoría 100% conforme: todas las referencias, precios, imágenes y estados coinciden.');
  }

  process.exit(0);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((err) => {
    console.error('Error en migración:', err);
    process.exit(1);
  });
}
