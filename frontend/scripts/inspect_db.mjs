import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
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

async function inspectAndCount() {
  console.log(`--- FIRESTORE STATUS (${firebaseConfig.projectId}) ---`);
  const [prodsSnap, publicSnap, listsSnap, branchesSnap, companySnap] = await Promise.all([
    getDocs(collection(db, 'products')),
    getDocs(collection(db, 'catalog_public')),
    getDocs(collection(db, 'price_lists')),
    getDocs(collection(db, 'branches')),
    getDocs(collection(db, 'company_info')),
  ]);
  console.log(`Total 'products' docs: ${prodsSnap.size}`);
  console.log(`Total 'catalog_public' docs: ${publicSnap.size}`);
  console.log(`Total 'price_lists' docs: ${listsSnap.size}`);
  console.log(`Total 'branches' docs: ${branchesSnap.size}`);
  console.log(`Total 'company_info' docs: ${companySnap.size}`);
  
  let withImg = 0;
  let withoutImg = 0;
  prodsSnap.forEach(d => {
    const data = d.data();
    if (data.processedImageUrl) withImg++;
    else withoutImg++;
  });
  console.log(`Products with images: ${withImg}`);
  console.log(`Products without images: ${withoutImg}`);
  
  process.exit(0);
}

inspectAndCount().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
