import React, { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall.ts';
import { useOnlineStatus } from '../hooks/useOnlineStatus.ts';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 text-xs font-medium text-[#182420] transition-colors hover:bg-[#F3F4F0] dark:border-[#2B3732] dark:bg-[#1B231F] dark:text-[#EAECE6] dark:hover:bg-[#222D28]"
      >
        <Download className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
        <span>Installa App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#D7DBD2] bg-white px-2.5 py-1.5 text-xs font-medium text-[#182420] transition-colors hover:bg-[#F3F4F0] dark:border-[#2B3732] dark:bg-[#1B231F] dark:text-[#EAECE6]"
        >
          <Smartphone className="h-3.5 w-3.5 text-[#1F6E5C] dark:text-[#36A68C]" />
          <span>Installa su iOS</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Installa Lucilla su iPhone o iPad"
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#182420]/45 p-4 backdrop-blur-xs"
          >
            <div className="w-full max-w-sm rounded-2xl border border-[#E4E6E0] bg-white p-6 shadow-xl dark:border-[#2B3732] dark:bg-[#1B231F]">
              <h3 className="font-editorial text-lg font-medium text-[#182420] dark:text-[#EAECE6]">
                Installa Lucilla su iPhone / iPad
              </h3>
              <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs leading-relaxed text-[#5C6762] dark:text-[#A3B0AA]">
                <li>
                  Tocca il pulsante <strong>Condividi</strong> nella barra di Safari.
                </li>
                <li>
                  Scorri verso il basso e tocca <strong>Aggiungi alla schermata Home</strong>.
                </li>
                <li>
                  Conferma toccando <strong>Aggiungi</strong> per aprire Lucilla come app dedicata.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-[#1F6E5C] py-2 text-xs font-semibold text-white hover:bg-[#185849]"
              >
                Ho capito
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="no-print border-b border-[#F3D09B] bg-[#FFFBEB] px-4 py-2 text-xs text-[#92400E] dark:border-[#78350F] dark:bg-[#292011] dark:text-[#FDE68A]">
      <div className="mx-auto flex max-w-7xl items-center gap-2 sm:px-2">
        <WifiOff className="h-3.5 w-3.5 shrink-0 text-[#B45309] dark:text-[#FBBF24]" />
        <span>
          Modalità offline: stai consultando i dati salvati in cache. Le modifiche si sincronizzeranno al ritorno della connessione.
        </span>
      </div>
    </div>
  );
};
