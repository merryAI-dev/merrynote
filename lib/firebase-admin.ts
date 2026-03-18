import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!serviceAccount) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT 환경변수가 설정되지 않았습니다.')
  }

  return initializeApp({
    credential: cert(JSON.parse(serviceAccount)),
  })
}

export function getAdminDb() {
  return getFirestore(getAdminApp())
}
