import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck, X } from 'lucide-react';
import { hashPin, isValidPin } from '../utils/crypto';

interface PinModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  expectedPinHash: string;
  onSuccess: () => void;
  onClose: () => void;
  onForgotPin?: () => void;
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  title,
  subtitle,
  expectedPinHash,
  onSuccess,
  onClose,
  onForgotPin,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setChecking(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const verify = async (candidate: string) => {
    if (!isValidPin(candidate)) {
      setError('Enter your 4-digit Owner PIN.');
      return;
    }
    setChecking(true);
    setError('');
    try {
      const hashed = await hashPin(candidate);
      if (hashed === expectedPinHash) {
        setPin('');
        onSuccess();
      } else {
        setError('Incorrect Owner PIN. Try again.');
        setPin('');
      }
    } finally {
      setChecking(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (checking || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setError('');
    if (next.length === 4) {
      void verify(next);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void verify(pin);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/80 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-modal-title"
    >
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="pin-modal-title"
                className="text-base font-bold text-slate-900 dark:text-slate-50"
              >
                {title}
              </h2>
              {subtitle && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close PIN dialog"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="mt-5">
          <label htmlFor="owner-pin-input" className="sr-only">
            4-Digit Owner PIN
          </label>
          <input
            id="owner-pin-input"
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoFocus
            value={pin}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/\D/g, '').slice(0, 4);
              setPin(cleaned);
              setError('');
              if (cleaned.length === 4) {
                void verify(cleaned);
              }
            }}
            placeholder="••••"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-center font-mono-tabular text-2xl tracking-[0.6em] text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
          />

          {error && (
            <p
              role="alert"
              className="mt-2 text-center text-xs font-semibold text-rose-600 dark:text-rose-400"
            >
              {error}
            </p>
          )}

          {/* Fast Thumb Keypad */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleDigit(d)}
                className="h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono-tabular text-lg font-bold text-slate-900 dark:text-slate-100 active:bg-slate-200 dark:active:bg-slate-800"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={handleBackspace}
              className="h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono-tabular text-lg font-bold text-slate-900 dark:text-slate-100 active:bg-slate-200 dark:active:bg-slate-800"
            >
              0
            </button>
            <button
              type="submit"
              disabled={checking || pin.length !== 4}
              className="h-12 rounded-xl bg-emerald-600 text-xs font-bold text-white disabled:opacity-40 hover:bg-emerald-700 flex items-center justify-center gap-1"
            >
              <ShieldCheck className="h-4 w-4" />
              Verify
            </button>
          </div>
        </form>

        {onForgotPin && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                onClose();
                onForgotPin();
              }}
              className="min-h-[40px] px-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              Forgot PIN? Recover with Secret Answer
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
