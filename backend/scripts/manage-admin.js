require('dotenv').config();
const path = require('path');
const admin = require('firebase-admin');

function normalizePrivateKey(rawValue) {
  if (typeof rawValue !== 'string') {
    return rawValue;
  }

  const trimmed = rawValue.trim();
  const unquoted = (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ? trimmed.slice(1, -1)
    : trimmed;

  return unquoted
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .trim();
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = value;
    index += 1;
  }
  return args;
}

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
    throw new Error(
      'Falta configuración Firebase Admin. Define FIREBASE_SERVICE_ACCOUNT_PATH o FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.'
    );
  }

  return {
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKeyRaw)
    }),
    projectId
  };
}

function printUsage() {
  console.log('Uso:');
  console.log('  npm run manage-admin -- --action grant --email admin@monsite.com --name "Admin Monsite" [--password "ClaveSegura123!"]');
  console.log('  npm run manage-admin -- --action grant-bodeguero --email bodega@monsite.com --name "Bodega Monsite" [--password "ClaveSegura123!"]');
  console.log('  npm run manage-admin -- --action revoke --email usuario@monsite.com');
  console.log('  npm run manage-admin -- --action revoke-bodeguero --email usuario@monsite.com');
}

async function getOrCreateUser(auth, options) {
  const { email, password, name } = options;

  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }

    if (!password) {
      throw new Error('El usuario no existe y no se proporcionó --password para crearlo.');
    }

    return auth.createUser({
      email,
      password,
      displayName: name || 'Administrador Monsite',
      emailVerified: true
    });
  }
}

async function grantAdmin(auth, db, options) {
  const userRecord = await getOrCreateUser(auth, options);
  const now = new Date().toISOString();

  await auth.setCustomUserClaims(userRecord.uid, { admin: true, bodeguero: false });

  await db.collection('users').doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email: userRecord.email,
      name: options.name,
      displayName: options.name,
      role: 'admin',
      updatedAt: now,
      createdAt: now,
      emailVerified: Boolean(userRecord.emailVerified),
      permissions: {
        products: true,
        categories: true,
        orders: true,
        users: true
      }
    },
    { merge: true }
  );

  console.log('✅ Admin otorgado correctamente');
  console.log(`- uid: ${userRecord.uid}`);
  console.log(`- email: ${userRecord.email}`);
}

async function grantBodeguero(auth, db, options) {
  const userRecord = await getOrCreateUser(auth, options);
  const now = new Date().toISOString();

  await auth.setCustomUserClaims(userRecord.uid, { admin: false, bodeguero: true });

  await db.collection('users').doc(userRecord.uid).set(
    {
      uid: userRecord.uid,
      email: userRecord.email,
      name: options.name,
      displayName: options.name,
      role: 'bodeguero',
      updatedAt: now,
      createdAt: now,
      emailVerified: Boolean(userRecord.emailVerified),
      permissions: {
        products: false,
        categories: false,
        orders: true,
        users: false
      }
    },
    { merge: true }
  );

  console.log('✅ Bodeguero otorgado correctamente');
  console.log(`- uid: ${userRecord.uid}`);
  console.log(`- email: ${userRecord.email}`);
}

async function revokeAdmin(auth, db, email) {
  const userRecord = await auth.getUserByEmail(email);

  await auth.setCustomUserClaims(userRecord.uid, { admin: false, bodeguero: false });

  await db.collection('users').doc(userRecord.uid).set(
    {
      role: 'client',
      updatedAt: new Date().toISOString(),
      permissions: {
        products: false,
        categories: false,
        orders: false,
        users: false
      }
    },
    { merge: true }
  );

  console.log('✅ Admin revocado correctamente');
  console.log(`- uid: ${userRecord.uid}`);
  console.log(`- email: ${userRecord.email}`);
}

async function revokeBodeguero(auth, db, email) {
  const userRecord = await auth.getUserByEmail(email);

  await auth.setCustomUserClaims(userRecord.uid, { admin: false, bodeguero: false });

  await db.collection('users').doc(userRecord.uid).set(
    {
      role: 'client',
      updatedAt: new Date().toISOString(),
      permissions: {
        products: false,
        categories: false,
        orders: false,
        users: false
      }
    },
    { merge: true }
  );

  console.log('✅ Bodeguero revocado correctamente');
  console.log(`- uid: ${userRecord.uid}`);
  console.log(`- email: ${userRecord.email}`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const action = args.action;
  const email = args.email;
  const name = args.name || 'Administrador Monsite';
  const password = args.password;

  if (!action || !email) {
    printUsage();
    throw new Error('Faltan parámetros requeridos (--action y --email).');
  }

  if (!['grant', 'revoke', 'grant-bodeguero', 'revoke-bodeguero'].includes(action)) {
    printUsage();
    throw new Error('Acción inválida. Usa --action grant, revoke, grant-bodeguero o revoke-bodeguero.');
  }

  const { credential, projectId } = resolveCredential();

  admin.initializeApp({ credential, projectId });

  const auth = admin.auth();
  const db = admin.firestore();

  if (action === 'grant') {
    await grantAdmin(auth, db, { email, name, password });
    return;
  }

  if (action === 'grant-bodeguero') {
    await grantBodeguero(auth, db, { email, name: name || 'Bodega Monsite', password });
    return;
  }

  if (action === 'revoke') {
    await revokeAdmin(auth, db, email);
    return;
  }

  await revokeBodeguero(auth, db, email);
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error en manage-admin:', error.message);
    process.exit(1);
  });
