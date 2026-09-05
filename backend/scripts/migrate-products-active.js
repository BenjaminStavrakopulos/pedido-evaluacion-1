require('dotenv').config();
const path = require('path');
const admin = require('firebase-admin');

function resolveCredential() {
  const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  if (serviceAccountPath) {
    const absolutePath = path.isAbsolute(serviceAccountPath)
      ? serviceAccountPath
      : path.join(process.cwd(), serviceAccountPath);
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const serviceAccount = require(absolutePath);
    return {
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID
    };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error('Falta configuración Firebase Admin en .env');
  }

  return {
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, '\n')
    }),
    projectId
  };
}

async function run() {
  const { credential, projectId } = resolveCredential();
  admin.initializeApp({ credential, projectId });

  const db = admin.firestore();
  const snapshot = await db.collection('products').get();

  let total = 0;
  let updated = 0;
  const batch = db.batch();

  snapshot.forEach((doc) => {
    total += 1;
    const data = doc.data() || {};
    if (typeof data.active === 'undefined' || data.active === null) {
      batch.update(doc.ref, {
        active: true,
        updatedAt: new Date().toISOString(),
        migratedActiveAt: new Date().toISOString()
      });
      updated += 1;
    }
  });

  if (updated > 0) {
    await batch.commit();
  }

  console.log(`✅ Migración completada. Total productos: ${total}. Actualizados: ${updated}.`);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error en migración products.active:', error.message);
    process.exit(1);
  });
