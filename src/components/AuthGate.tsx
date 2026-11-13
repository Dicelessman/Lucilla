import React, { useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { Lock, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import { ALLOWED_PERSONAL_EMAIL, auth, googleProvider } from '../firebase.ts';
import { EditorialImage } from './EditorialImage.tsx';
import authBotanicalImg from '../assets/images/auth_botanical_calm_1794581846666.jpg';

interface AuthGateProps {
  children: (user: User, handleSignOut: () => Promise<void>) => React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setChecking(false);
        return;
      }

      const email = (currentUser.email || '').toLowerCase();
      if (!currentUser.emailVerified || email !== ALLOWED_PERSONAL_EMAIL) {
        setAuthError(
          `Accesso riservato esclusivamente all'account personale di Davide (${ALLOWED_PERSONAL_EMAIL}). L'account ${currentUser.email ?? 'corrente'} non è autorizzato.`
        );
        try {
          await signOut(auth);
        } catch {
          // ignore sign-out error
        }
        setUser(null);
        setChecking(false);
        return;
      }

      setAuthError(null);
      setUser(currentUser);
      setChecking(false);
    });

    return () => unsub();
  }, []);

  async function handleGoogleLogin() {
    setSigningIn(true);
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = (result.user.email || '').toLowerCase();
      if (!result.user.emailVerified || email !== ALLOWED_PERSONAL_EMAIL) {
        await signOut(auth);
        setAuthError(
          `Questo diario clinico è privato e protetto per ${ALLOWED_PERSONAL_EMAIL}. Accedi con il tuo account Google personale.`
        );
      }
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('Accesso annullato prima del completamento.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError(
          'Il browser ha bloccato il popup di accesso Google. Consenti i popup per questo sito e riprova.'
        );
      } else {
        setAuthError('Impossibile completare l’accesso con Google. Riprova tra un istante.');
      }
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F7F4] px-4 text-center dark:bg-[#131917]">
        <p className="font-editorial text-2xl font-semibold text-[#182420] dark:text-[#EAECE6]">
          Lucilla
        </p>
        <p className="mt-2 text-sm text-[#5C6762] dark:text-[#A3B0AA]">
          Verifica della sessione personale in corso...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F7F4] px-4 py-10 text-[#182420] dark:bg-[#131917] dark:text-[#EAECE6]">
        <div className="grid w-full max-w-3xl grid-cols-1 overflow-hidden rounded-2xl border border-[#E4E6E0] bg-white shadow-sm md:grid-cols-12 dark:border-[#2B3732] dark:bg-[#1B231F]">
          <div className="h-48 md:col-span-5 md:h-auto">
            <EditorialImage
              src={authBotanicalImg}
              alt="Rami di ulivo, foglie di salvia e tisana calda alla finestra"
              caption="Spazio personale · PNL & Bariclip"
              className="h-full w-full"
            />
          </div>

          <div className="p-8 md:col-span-7">
            <div className="flex items-center justify-between">
              <span className="font-editorial text-3xl font-semibold tracking-tight text-[#182420] dark:text-[#EAECE6]">
                Lucilla
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-[#1F6E5C] dark:text-[#36A68C]">
                <Lock className="h-3.5 w-3.5" />
                Area Riservata
              </span>
            </div>

            <h1 className="mt-5 font-editorial text-xl font-medium text-[#182420] dark:text-[#EAECE6]">
              Il tuo Coach quotidiano, sincronizzato su ogni dispositivo
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-[#5C6762] dark:text-[#A3B0AA]">
              Accedi con il tuo account Google personale per aprire il diario Bariclip, le routine PNL
              e le sessioni vocali Live con Lucilla in modo protetto.
            </p>

            {authError && (
              <div
                role="alert"
                className="mt-5 flex items-start gap-2.5 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-xs leading-relaxed text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1717] dark:text-[#FCA5A5]"
              >
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#B91C1C] dark:text-[#FCA5A5]" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={signingIn}
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#1F6E5C] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#185849] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" />
              <span>{signingIn ? 'Connessione a Google...' : 'Accedi con Google'}</span>
            </button>

            <div className="mt-6 border-t border-[#ECEEE8] pt-4 text-[11px] leading-relaxed text-[#5C6762] dark:border-[#2B3732] dark:text-[#A3B0AA]">
              <p>
                Accesso consentito esclusivamente a{' '}
                <span className="font-mono text-[#182420] dark:text-[#EAECE6]">
                  {ALLOWED_PERSONAL_EMAIL}
                </span>
                . I dati clinici ed emotivi sono cifrati in transito e salvati nel tuo database
                privato Firebase.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children(user, handleSignOut)}</>;
};

export const SignOutButton: React.FC<{ onSignOut: () => void }> = ({ onSignOut }) => (
  <button
    type="button"
    onClick={onSignOut}
    title="Esci dall'account"
    className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E4E6E0] bg-white px-2.5 py-2 text-xs font-medium text-[#5C6762] transition-colors hover:bg-[#F3F4F0] hover:text-[#182420] dark:border-[#2B3732] dark:bg-[#1B231F] dark:text-[#A3B0AA] dark:hover:bg-[#222D28] dark:hover:text-[#EAECE6]"
  >
    <LogOut className="h-3.5 w-3.5" />
    <span className="hidden sm:inline">Esci</span>
  </button>
);
