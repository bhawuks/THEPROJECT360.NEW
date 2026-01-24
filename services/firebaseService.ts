// Fix: Use standard modular import for initializeApp and getAuth from Firebase v9 SDK.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyDTRO2GXMtWQHWJWdafaXT4XMalPN1tMtc",
  authDomain: "theproject360-360.firebaseapp.com",
  projectId: "theproject360-360",
  storageBucket: "theproject360-360.firebasestorage.app",
  messagingSenderId: "419530683590",
  appId: "1:419530683590:web:687135794c6dcbad1c13c7"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);