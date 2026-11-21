import React, { useState } from 'react';
import { Edit3, Eye, EyeOff, Lock, X } from 'lucide-react';
import { db, logAudit } from '../db/database';
import type { DailyFloat } from '../types/duka';
import { formatKES } from '../utils/dates';
import type { DailySummary } from '../utils/finance';

interface DailyLedgerStripProps {
  summary: DailySummary;
  dailyFloat: DailyFloat;
  isUnlocked: boolean;
  secondsLeft: number;
  onRequestUnlock: () => void;
  onLockNow: () => void;
  onRequirePin: (action: () => void, title: string, subtitle: string) => void;
}

const MASKED = 'KES •••••';

export const DailyLedgerStrip: React.FC<DailyLedgerStripProps> = ({
  summary,
  dailyFloat,
  isUnlocked,
  secondsLeft,
  onRequestUnlock,
  onLockNow,
  onRequirePin,
}) => {
  const [showFloatEditor, setShowFloatEditor] = useState(false);
  const [editCash, setEditCash] = useState('');
  const [editMpesa, setEditMpesa] = useState('');
  const [floatError, setFloatError] = useState('');

  const openFloatEditorAfterPin = () => {
    onRequirePin(
      () => {
        setEditCash(String(dailyFloat.openingCash));
        setEditMpesa(String(dailyFloat.openingMpesa));
        setFloatError('');
        setShowFloatEditor(true);
      },
      'Edit Opening Float',
      'Owner PIN required to adjust today’s starting cash or M-Pesa balance.'
    );
  };

  const handleSaveFloat = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextCash = Number(editCash);
    const nextMpesa = Number(editMpesa);
    if (
      !Number.isFinite(nextCash) ||
      nextCash < 0 ||
      !Number.isFinite(nextMpesa) ||
      nextMpesa < 0
    ) {
      setFloatError('Enter valid non-negative numbers.');
      return;
    }
    await db.daily_floats.update(dailyFloat.date, {
      openingCash: Math.round(nextCash * 100) / 100,
      openingMpesa: Math.round(nextMpesa * 100) / 100,
      updatedAt: Date.now(),
    });
    await logAudit(
      'edit_float',
      `Edited opening float for ${dailyFloat.date}`,
      `Cash: ${formatKES(dailyFloat.openingCash)} -> ${formatKES(nextCash)} · M-Pesa: ${formatKES(dailyFloat.openingMpesa)} -> ${formatKES(nextMpesa)}`,
      dailyFloat.date
    );
    setShowFloatEditor(false);
  };

  const metrics = [
    { label: 'Expected Cash in Drawer', value: formatKES(summary.expectedCash) },
    { label: 'Expected M-Pesa Balance', value: formatKES(summary.expectedMpesa) },
    { label: "Today's Sales", value: formatKES(summary.todaysSales) },
    { label: 'Given on Deni', value: formatKES(summary.givenOnDeni) },
    {
      label: "Today's Profit",
      value: formatKES(summary.todaysProfit),
      highlight: true,
    },
  ];

  return (
    <section
      aria-label="Today's Financial Shield"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            Daily Drawer & Profit
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {isUnlocked ? `Unlocked (${secondsLeft}s)` : 'Privacy Masked'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openFloatEditorAfterPin}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Edit Float</span>
          </button>
          <button
            type="button"
            onClick={isUnlocked ? onLockNow : onRequestUnlock}
            aria-label={isUnlocked ? 'Lock financial totals' : 'Unlock financial totals with PIN'}
            className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              isUnlocked
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            {isUnlocked ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                <span>Hide Balances</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                <span>Unlock Balances</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 px-3 py-2.5"
          >
            <p className="text-[11px] font-medium leading-tight text-slate-600 dark:text-slate-400">
              {m.label}
            </p>
            <p
              className={`mt-1 font-mono-tabular text-sm sm:text-base font-bold truncate ${
                m.highlight && isUnlocked
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-900 dark:text-slate-50'
              }`}
            >
              {isUnlocked ? m.value : MASKED}
            </p>
          </div>
        ))}
      </div>

      {showFloatEditor && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/80 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-float-title"
        >
          <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3
                id="edit-float-title"
                className="text-base font-bold text-slate-900 dark:text-slate-50"
              >
                Edit Today&apos;s Opening Float
              </h3>
              <button
                type="button"
                onClick={() => setShowFloatEditor(false)}
                aria-label="Close float editor"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveFloat} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="edit-open-cash"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Opening Physical Cash (KES)
                </label>
                <input
                  id="edit-open-cash"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={editCash}
                  onChange={(e) => setEditCash(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm font-bold text-slate-900 dark:text-slate-50"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-open-mpesa"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Opening M-Pesa Balance (KES)
                </label>
                <input
                  id="edit-open-mpesa"
                  type="number"
                  min="0"
                  step="any"
                  required
                  value={editMpesa}
                  onChange={(e) => setEditMpesa(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm font-bold text-slate-900 dark:text-slate-50"
                />
              </div>
              {floatError && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {floatError}
                </p>
              )}
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
              >
                Save Opening Float & Log Audit
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
