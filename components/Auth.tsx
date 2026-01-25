
import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  signOut,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, signInWithGoogle } from '../services/firebaseService';
import { Construction, Loader2, AlertCircle, Mail, KeyRound } from 'lucide-react';

type AuthMode = 'login' | 'signup' | 'forgotPassword' | 'verification' | 'resetLinkSent';

export const Auth: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailForStatus, setEmailForStatus] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        if (!userCredential.user.emailVerified) {
          await sendEmailVerification(userCredential.user);
          setEmailForStatus(email);
          await signOut(auth);
          setMode('verification');
        }
      } else if (mode === 'signup') {
        if (password !== repeatPassword) {
          throw new Error("Passwords do not match");
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        await sendEmailVerification(userCredential.user);
        setEmailForStatus(email);
        await signOut(auth);
        setMode('verification');
      } else if (mode === 'forgotPassword') {
        await sendPasswordResetEmail(auth, email);
        setEmailForStatus(email);
        setMode('resetLinkSent');
      }
    } catch (err: any) {
      console.error(err);
      if (mode === 'login') {
        if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
          setError("Password or Email Incorrect");
        } else {
          setError(err.message || "An error occurred during sign in.");
        }
      } else if (mode === 'signup') {
        if (err.code === 'auth/email-already-in-use') {
          setError("User already exists. Sign in?");
        } else {
          setError(err.message || "An error occurred during registration.");
        }
      } else {
        setError(err.message || "An error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || "An error occurred during Google sign in.");
    } finally {
      setLoading(false);
    }
  };

  if (mode === 'verification') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md text-center border-4 border-black animate-fade-in">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-black rounded-full text-white">
              <Mail size={40} />
            </div>
          </div>
          <h1 className="text-3xl font-black text-black mb-4 uppercase tracking-tight leading-tight">
            Check your Inbox
          </h1>
          <div className="bg-gray-50 border-2 border-black p-6 rounded-xl mb-8 text-left">
            <p className="text-gray-700 font-bold text-sm leading-relaxed mb-4">
              We have sent you a verification email to:
            </p>
            <p className="text-black font-black text-lg break-all mb-4">
              {emailForStatus}
            </p>
            <p className="text-gray-500 font-bold text-xs uppercase tracking-wider">
              Verify it and log in to continue.
            </p>
          </div>
          
          <button
            onClick={() => {
              setMode('login');
              setEmail('');
              setPassword('');
            }}
            className="w-full bg-black text-white font-black py-4 rounded-xl hover:bg-gray-800 transition-all uppercase tracking-wider flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(156,163,175,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'resetLinkSent') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md text-center border-4 border-black animate-fade-in">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-black rounded-full text-white">
              <KeyRound size={40} />
            </div>
          </div>
          <h1 className="text-3xl font-black text-black mb-4 uppercase tracking-tight leading-tight">
            Link Sent
          </h1>
          <div className="bg-gray-50 border-2 border-black p-6 rounded-xl mb-8 text-left">
            <p className="text-gray-700 font-bold text-sm leading-relaxed mb-4">
              We have sent you a password change link to:
            </p>
            <p className="text-black font-black text-lg break-all mb-4">
              {emailForStatus}
            </p>
            <p className="text-gray-500 font-bold text-xs uppercase tracking-wider">
              Follow the instructions in the email to reset your password.
            </p>
          </div>
          
          <button
            onClick={() => {
              setMode('login');
              setPassword('');
            }}
            className="w-full bg-black text-white font-black py-4 rounded-xl hover:bg-gray-800 transition-all uppercase tracking-wider flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(156,163,175,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-md text-center border-4 border-black animate-fade-in">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-black rounded-full text-white">
            <Construction size={40} />
          </div>
        </div>
        <h1 className="text-3xl font-black text-black mb-2 uppercase tracking-tight">
          TheProject 360
        </h1>
        <p className="text-gray-500 font-bold mb-8 uppercase text-xs tracking-widest">
          {mode === 'login' ? 'Welcome Back' : mode === 'signup' ? 'Join the Network' : 'Recover Account'}
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-500 text-red-700 rounded-lg flex items-start gap-3 text-left">
            <AlertCircle className="shrink-0" size={20} />
            <div>
              <p className="font-black text-sm uppercase">{error}</p>
              {error === "User already exists. Sign in?" && (
                <button 
                  onClick={() => { setMode('login'); setError(null); }}
                  className="text-xs font-black underline uppercase mt-1 block"
                >
                  Switch to Sign In
                </button>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          {mode === 'signup' && (
            <input
              type="text"
              required
              placeholder="FULL NAME"
              className="w-full px-4 py-3 border-4 border-black rounded-xl focus:ring-0 focus:border-gray-600 outline-none transition-all font-bold placeholder:text-gray-300"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            type="email"
            required
            placeholder="EMAIL ADDRESS"
            className="w-full px-4 py-3 border-4 border-black rounded-xl focus:ring-0 focus:border-gray-600 outline-none transition-all font-bold placeholder:text-gray-300"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {mode !== 'forgotPassword' && (
            <>
              <input
                type="password"
                required
                placeholder="PASSWORD"
                className="w-full px-4 py-3 border-4 border-black rounded-xl focus:ring-0 focus:border-gray-600 outline-none transition-all font-bold placeholder:text-gray-300"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode === 'login' && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setMode('forgotPassword'); setError(null); }}
                    className="text-xs font-black uppercase text-gray-500 hover:text-black"
                  >
                    Forgot password?
                  </button>
                </div>
              )}
            </>
          )}
          {mode === 'signup' && (
            <input
              type="password"
              required
              placeholder="REPEAT PASSWORD"
              className="w-full px-4 py-3 border-4 border-black rounded-xl focus:ring-0 focus:border-gray-600 outline-none transition-all font-bold placeholder:text-gray-300"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
            />
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white font-black py-4 rounded-xl hover:bg-gray-800 transition-all uppercase tracking-wider flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(156,163,175,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Get Reset Link')}
          </button>
        </form>

        <div className="mt-6">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full bg-white text-black border-4 border-black font-black py-3 rounded-xl hover:bg-gray-100 transition-all uppercase tracking-wider flex items-center justify-center gap-2 shadow-[4px_4px_0px_0px_rgba(156,163,175,1)] active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
          >
            <svg className="w-6 h-6" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C12.955 4 4 12.955 4 24s8.955 20 20 20s20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4C16.318 4 9.656 8.337 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.223 0-9.657-3.344-11.303-7.962l-6.571 4.819C9.656 39.663 16.318 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C43.021 36.25 44 32.221 44 28c0-2.695-.362-5.311-1.024-7.81z"/>
            </svg>
            Sign in with Google
          </button>
        </div>

        <div className="mt-8 pt-6 border-t-2 border-gray-100">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-tight">
            {mode === 'login' ? "Don't have an account?" : mode === 'signup' ? "Already registered?" : "Remembered it?"}
          </p>
          <button
            onClick={() => { 
              setMode(mode === 'signup' ? 'login' : mode === 'forgotPassword' ? 'login' : 'signup'); 
              setError(null); 
            }}
            className="mt-2 text-black font-black uppercase text-sm hover:underline"
          >
            {mode === 'login' ? 'Create one now' : 'Sign in to existing'}
          </button>
        </div>
      </div>
    </div>
  );
};
