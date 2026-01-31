import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDTRO2GXMtWQHWJWdafaXT4XMalPN1tMtc",
  authDomain: "theproject360-360.firebaseapp.com",
  projectId: "theproject360-360",
  storageBucket: "theproject360-360.firebasestorage.app",
  messagingSenderId: "419530683590",
  appId: "1:419530683590:web:687135794c6dcbad1c13c7"
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  console.log('Firebase initialized successfully.');
} catch (error) {
  console.error(
    'Firebase initialization failed. Please configure your firebase credentials in services/firebaseService.ts',
    error
  );
}

const provider = new GoogleAuthProvider();

export const signInWithGoogle = () => {
  if (auth) return signInWithPopup(auth, provider);
  return Promise.reject('Firebase auth is not initialized.');
};

export { app, auth, db };
