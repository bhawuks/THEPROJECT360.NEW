// Fix: Use standard modular import for initializeApp and getAuth from Firebase v9 SDK.
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDTRO2GXMtWQHWJWdafaXT4XMalPN1tMtc",
  authDomain: "theproject360-360.firebaseapp.com",
  projectId: "theproject360-360",
  storageBucket: "theproject360-360.firebasestorage.app",
  messagingSenderId: "419530683590",
  appId: "1:419530683590:web:687135794c6dcbad1c13c7"
};

let app;
let auth = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  console.log("Firebase initialized successfully.");
} catch (error) {
  console.error(
    "Firebase initialization failed. Please configure your firebase credentials in services/firebaseService.ts",
    error
  );
}

const provider = new GoogleAuthProvider();

export const signInWithGoogle = () => {
  if (auth) {
    return signInWithPopup(auth, provider);
  } else {
    return Promise.reject("Firebase auth is not initialized.");
  }
};

export { auth };
