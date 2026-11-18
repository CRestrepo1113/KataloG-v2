import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { parseEnvFile } from './migrate_v1_to_v2.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = {
  ...parseEnvFile(path.resolve(__dirname, '../.env.local')),
  ...process.env,
};

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('Faltan variables NEXT_PUBLIC_FIREBASE_* en frontend/.env.local.');
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function backupAndResetProducts(dryRun = true) {
  console.log('1. Obteniendo productos de Firestore...');
  const snap = await getDocs(collection(db, 'products'));
  console.log(`Encontrados ${snap.size} productos en Firestore.`);

  if (snap.size === 0) {
    console.log('No hay productos que eliminar.');
    return;
  }

  const productsData = [];
  snap.forEach(d => {
    productsData.push({ id: d.id, ...d.data() });
  });

  const backupsDir = path.resolve('backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupsDir, `products_backup_${timestamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(productsData, null, 2), 'utf-8');
  console.log(`2. Respaldo de seguridad guardado exitosamente en: ${backupPath}`);

  if (dryRun) {
    console.log('Modo de prueba (DRY RUN): No se eliminó ningún documento en Firestore.');
    return;
  }

  console.log('3. Eliminando productos e imágenes de Firestore...');
  const docs = snap.docs;
  const CHUNK_SIZE = 400;
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const chunk = docs.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(d => {
      batch.delete(doc(db, 'products', d.id));
    });
    await batch.commit();
    console.log(`- Eliminado lote de ${chunk.length} productos.`);
  }

  console.log(`¡Éxito! Se han eliminado los ${snap.size} productos y referencias de Firestore.`);
}

const isExecute = process.argv.includes('--execute');
backupAndResetProducts(!isExecute).then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Error durante el proceso:', err);
  process.exit(1);
});
