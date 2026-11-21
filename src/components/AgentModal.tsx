import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, X } from 'lucide-react';
import { recordAgentOperation } from '../db/database';
import type { AgentMode } from '../types/duka';
import { formatKES } from '../utils/dates';
import { calculateAgentTransaction } from '../utils/tariffs';

interface AgentModalProps {
  isOpen: boolean;
  initialOp: 'deposit' | 'withdraw';
  agentMode: AgentMode;
  todayDateKey: string;
  onSuccess: (msg: string) => void;
  onClose: () => void;
}

export const AgentModal: React.FC<AgentModalProps> = ({
  isOpen,
  initialOp,
  agentMode,
  todayDateKey,
  onSuccess,
  onClose,
}) => {
  const [opType, setOpType] = useState<'deposit' | 'withdraw'>(initialOp);
  const [amount, setAmount] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setOpType(initialOp);
      setAmount('');
      setCustomerPhone('');
      setError('');
      setSubmitting(false);
    }
  }, [isOpen, initialOp]);

  const calc = useMemo(() => {
    const num = Number(amount);
    if (!amount || !Number.isFinite(num)) return null;
    return calculateAgentTransaction(opType, num, agentMode);
  }, [opType, amount, agentMode]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(amount);
    const check = calculateAgentTransaction(opType, num, agentMode);
    if (!check.valid) {
      setError(check.error || 'Enter a valid amount.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await recordAgentOperation({
        opType,
        amount: num,
        mode: agentMode,
        customerPhone: customerPhone.trim() || undefined,
        dateKey: todayDateKey,
      });
      onSuccess(
        `M-Pesa ${opType === 'deposit' ? 'Deposit' : 'Withdraw'} (${formatKES(num)}) recorded · Commission ${formatKES(check.commissionEarned)}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save agent operation.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/80 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-modal-title"
    >
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="agent-modal-title"
              className="text-base font-extrabold text-slate-900 dark:text-slate-50"
            >
              M-Pesa Agent Service
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {agentMode === 'direct'
                ? 'Direct Agent (100% Tariff Commission)'
                : 'Sub-Agent (80% Split Commission)'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close M-Pesa Agent modal"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setOpType('deposit')}
            className={`min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
              opType === 'deposit'
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <ArrowDownLeft className="h-4 w-4" />
            <span>M-Pesa Deposit</span>
          </button>
          <button
            type="button"
            onClick={() => setOpType('withdraw')}
            className={`min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
              opType === 'withdraw'
                ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
            <span>M-Pesa Withdraw</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          <div>
            <label
              htmlFor="agent-amount-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Amount (KES)
            </label>
            <input
              id="agent-amount-input"
              type="number"
              min="10"
              max="250000"
              step="1"
              required
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError('');
              }}
              placeholder="e.g. 1000"
              className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 font-mono-tabular text-lg font-bold text-slate-900 dark:text-slate-50"
            />
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[200, 500, 1000, 5000].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono-tabular text-xs font-bold text-slate-800 dark:text-slate-200"
              >
                {v.toLocaleString()}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="agent-phone-input"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
            >
              Customer Phone (Optional)
            </label>
            <input
              id="agent-phone-input"
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="e.g. 0712345678"
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 font-mono-tabular text-sm text-slate-900 dark:text-slate-50"
            />
          </div>

          {calc && calc.valid && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Commission Earned (Today&apos;s Profit):
                </span>
                <span className="font-mono-tabular font-extrabold text-emerald-700 dark:text-emerald-400">
                  {formatKES(calc.commissionEarned)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  Drawer Cash Impact:
                </span>
                <span className="font-mono-tabular font-bold text-slate-900 dark:text-slate-100">
                  {calc.cashDelta >= 0 ? `+${formatKES(calc.cashDelta)}` : formatKES(calc.cashDelta)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">
                  M-Pesa Float Impact:
                </span>
                <span className="font-mono-tabular font-bold text-slate-900 dark:text-slate-100">
                  {calc.mpesaDelta >= 0 ? `+${formatKES(calc.mpesaDelta)}` : formatKES(calc.mpesaDelta)}
                </span>
              </div>
            </div>
          )}

          {calc && !calc.valid && (
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
              {calc.error}
            </p>
          )}

          {error && (
            <p role="alert" className="text-xs font-semibold text-rose-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !calc?.valid}
            className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
          >
            Record {opType === 'deposit' ? 'M-Pesa Deposit' : 'M-Pesa Withdraw'}
          </button>
        </form>
      </div>
    </div>
  );
};
