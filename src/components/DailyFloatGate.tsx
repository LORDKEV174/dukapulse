import React, { useEffect, useState } from 'react';
import { Banknote, CopyCheck, Play } from 'lucide-react';
import { db, getPreviousWorkDayClosing } from '../db/database';
import { formatDayDate, formatKES } from '../utils/dates';

interface DailyFloatGateProps {
  todayDateKey: string;
  shopName: string;
  onFloatSaved: () => void;
}

export const DailyFloatGate: React.FC<DailyFloatGateProps> = ({
  todayDateKey,
  shopName,
  onFloatSaved,
}) => {
  const [openingCash, setOpeningCash] = useState('');
  const [openingMpesa, setOpeningMpesa] = useState('');
  const [prevClosing, setPrevClosing] = useState<{
    prevDate: string;
    closingCash: number;
    closingMpesa: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getPreviousWorkDayClosing(todayDateKey).then((res) => {
      if (active) setPrevClosing(res);
    });
    return () => {
      active = false;
    };
  }, [todayDateKey]);

  const handleCopyPrevious = () => {
    if (!prevClosing) return;
    setOpeningCash(String(prevClosing.closingCash));
    setOpeningMpesa(String(prevClosing.closingMpesa));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cash = Number(openingCash === '' ? '0' : openingCash);
    const mpesa = Number(openingMpesa === '' ? '0' : openingMpesa);
    if (!Number.isFinite(cash) || cash < 0 || !Number.isFinite(mpesa) || mpesa < 0) {
      setError('Enter valid non-negative opening amounts (0 or higher).');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const now = Date.now();
      await db.daily_floats.put({
        date: todayDateKey,
        openingCash: Math.round(cash * 100) / 100,
        openingMpesa: Math.round(mpesa * 100) / 100,
        createdAt: now,
        updatedAt: now,
      });
      onFloatSaved();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save today starting float.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {shopName}
            </p>
            <h1 className="text-lg font-extrabold text-slate-900 dark:text-slate-50">
              Open Today&apos;s Till & Float
            </h1>
          </div>
        </div>

        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Work Day: <strong className="text-slate-900 dark:text-slate-100">{formatDayDate(todayDateKey)}</strong>. Enter your starting cash in drawer and M-Pesa balance before selling.
        </p>

        {prevClosing && (
          <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-3.5">
            <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              Previous work day ({formatDayDate(prevClosing.prevDate)}) closed at:
            </p>
            <p className="mt-1 font-mono-tabular text-xs text-emerald-800 dark:text-emerald-300">
              Cash {formatKES(prevClosing.closingCash)} · M-Pesa {formatKES(prevClosing.closingMpesa)}
            </p>
            <button
              type="button"
              onClick={handleCopyPrevious}
              className="mt-2.5 w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2"
            >
              <CopyCheck className="h-4 w-4" />
              <span>Copy Previous Closing Balances</span>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="opening-cash-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Opening Physical Cash in Drawer (KES)
            </label>
            <input
              id="opening-cash-input"
              type="number"
              min="0"
              step="any"
              required
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="e.g. 3500"
              className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 font-mono-tabular text-base font-bold text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="opening-mpesa-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Opening M-Pesa Balance (KES)
            </label>
            <input
              id="opening-mpesa-input"
              type="number"
              min="0"
              step="any"
              required
              value={openingMpesa}
              onChange={(e) => setOpeningMpesa(e.target.value)}
              placeholder="e.g. 12000"
              className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 font-mono-tabular text-base font-bold text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            <span>Start Work Day & Open POS</span>
          </button>
        </form>
      </div>
    </div>
  );
};
