import React, { useState } from 'react';
import { Download, Smartphone, WifiOff, X } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="no-print flex items-center justify-center gap-2 bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>Offline Mode — All sales, Deni & stock save locally to your phone</span>
    </div>
  );
};

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className={
          compact
            ? 'min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0'
            : 'min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700'
        }
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>Install DukaPulse App</span>
      </button>
    );
  }

  // In header compact mode, only show fallback button on iOS to keep header clean
  if (compact && !isIOS) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className={
          compact
            ? 'min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0'
            : 'min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white'
        }
      >
        <Smartphone className="h-4 w-4 shrink-0" />
        <span>{isIOS ? 'Install on iPhone' : 'Install App on Phone'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/80 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3
                id="pwa-install-guide-title"
                className="text-base font-extrabold text-slate-900 dark:text-slate-50"
              >
                Install DukaPulse on Your Phone
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2 text-xs text-slate-600 dark:text-slate-300 list-decimal list-inside leading-relaxed">
                <li>
                  Tap the <strong>Share</strong> icon in Safari at the bottom of your screen.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong> to launch DukaPulse offline from your home screen.
                </li>
              </ol>
            ) : (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    1. Android Chrome (Wireless)
                  </p>
                  <p className="mt-0.5">
                    Open the app URL directly in Chrome (not inside a preview frame), tap the <strong>⋮ Menu</strong> in the top-right, then tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                  </p>
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    2. Android via USB Cable (ADB)
                  </p>
                  <p className="mt-0.5">
                    Enable <strong>USB Debugging</strong> on your phone, connect USB, run{' '}
                    <code className="font-mono-tabular bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                      adb reverse tcp:3000 tcp:3000
                    </code>{' '}
                    on your PC, and open{' '}
                    <code className="font-mono-tabular bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                      http://localhost:3000
                    </code>{' '}
                    in Chrome on your phone.
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-100 text-xs font-bold text-white dark:text-slate-900"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
