import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  ClipboardPaste,
  MessageCircle,
  Search,
  Smartphone,
  Users,
  X,
} from 'lucide-react';
import {
  db,
  DuplicateMpesaError,
  recordDeniRepayment,
} from '../db/database';
import type { Debtor, MpesaLog, ShopSettings } from '../types/duka';
import { formatKES, formatWhatsAppPhone } from '../utils/dates';
import { parseMpesaSms } from '../utils/mpesaParser';

interface DeniViewProps {
  debtors: Debtor[];
  settings: ShopSettings;
  todayDateKey: string;
}

export const DeniView: React.FC<DeniViewProps> = ({
  debtors,
  settings,
  todayDateKey,
}) => {
  const [search, setSearch] = useState('');
  const [repayDebtor, setRepayDebtor] = useState<Debtor | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState<'cash' | 'mpesa'>('cash');
  const [smsText, setSmsText] = useState('');
  const [duplicateLog, setDuplicateLog] = useState<MpesaLog | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const sortedDebtors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...debtors]
      .filter((d) =>
        q
          ? d.name.toLowerCase().includes(q) ||
            d.phone.toLowerCase().includes(q)
          : true
      )
      .sort((a, b) => b.balance - a.balance);
  }, [debtors, search]);

  const totalUnpaid = useMemo(
    () =>
      Math.round(
        debtors.reduce((sum, d) => sum + Math.max(0, d.balance), 0) * 100
      ) / 100,
    [debtors]
  );

  const owingCount = useMemo(
    () => debtors.filter((d) => d.balance > 0).length,
    [debtors]
  );

  const parsedSms = useMemo(() => {
    if (repayMethod !== 'mpesa' || !smsText.trim()) return null;
    return parseMpesaSms(smsText);
  }, [repayMethod, smsText]);

  React.useEffect(() => {
    let active = true;
    if (parsedSms?.isValid && parsedSms.code) {
      void db.mpesa_logs.get(parsedSms.code).then((found) => {
        if (active) setDuplicateLog(found ?? null);
      });
    } else {
      setDuplicateLog(null);
    }
    return () => {
      active = false;
    };
  }, [parsedSms]);

  const openRepayModal = (debtor: Debtor) => {
    setRepayDebtor(debtor);
    setRepayAmount(String(debtor.balance));
    setRepayMethod('cash');
    setSmsText('');
    setDuplicateLog(null);
    setError('');
  };

  const buildWhatsAppLink = (debtor: Debtor): string => {
    const payDetails =
      settings.receivingMethod === 'till'
        ? `M-Pesa Buy Goods Till: ${settings.tillNumber}`
        : settings.receivingMethod === 'paybill'
          ? `M-Pesa Paybill: ${settings.paybillNumber}, Account: ${settings.accountNumber}`
          : `M-Pesa / Pochi: ${settings.phoneNumber}`;

    const message = `Hello ${debtor.name}, friendly reminder from ${settings.shopName}. Your current Deni balance is ${formatKES(debtor.balance)}. Please pay via ${payDetails}. Asante!`;
    const phone = formatWhatsAppPhone(debtor.phone);
    return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  };

  const handleConfirmRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayDebtor?.id) return;
    const amt = Number(repayAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid repayment amount.');
      return;
    }
    if (repayMethod === 'mpesa') {
      if (!parsedSms?.isValid) {
        setError(parsedSms?.error || 'Paste a valid M-Pesa confirmation SMS.');
        return;
      }
      if (duplicateLog) {
        setError(`Duplicate M-Pesa code ${duplicateLog.code} already used.`);
        return;
      }
    }

    setSubmitting(true);
    setError('');
    try {
      await recordDeniRepayment({
        debtorId: repayDebtor.id,
        amount: amt,
        method: repayMethod,
        parsedSms: repayMethod === 'mpesa' && parsedSms ? parsedSms : undefined,
        dateKey: todayDateKey,
      });
      setFeedback(
        `Recorded ${formatKES(Math.min(amt, repayDebtor.balance))} Deni payment from ${repayDebtor.name}.`
      );
      setRepayDebtor(null);
    } catch (err) {
      if (err instanceof DuplicateMpesaError) {
        setDuplicateLog(err.existingLog);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Repayment failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Total Unpaid Deni
          </p>
          <p className="mt-1 font-mono-tabular text-xl font-extrabold text-amber-700 dark:text-amber-400">
            {formatKES(totalUnpaid)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Customers Owing
          </p>
          <p className="mt-1 font-mono-tabular text-xl font-extrabold text-slate-900 dark:text-slate-50">
            {owingCount}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-4 py-3 text-xs font-semibold text-emerald-900 dark:text-emerald-200"
        >
          {feedback}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="deni-search" className="sr-only">
            Search debtors
          </label>
          <input
            id="deni-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Deni Book by name or phone..."
            className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-50"
          />
        </div>

        {sortedDebtors.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              No Deni records yet
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              When you sell on credit from the Sell tab, customers appear here sorted by highest balance.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedDebtors.map((d) => (
              <div
                key={d.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {d.name}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                    {d.phone || 'No phone number'} · Total Given {formatKES(d.totalGiven)} · Repaid {formatKES(d.totalRepaid)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono-tabular text-sm font-extrabold mr-1 ${
                      d.balance > 0
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    {d.balance > 0 ? formatKES(d.balance) : 'Cleared'}
                  </span>

                  {d.balance > 0 && (
                    <>
                      <a
                        href={buildWhatsAppLink(d)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Send WhatsApp reminder to ${d.name}`}
                        className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                      >
                        <MessageCircle className="h-4 w-4" />
                        <span>Remind</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => openRepayModal(d)}
                        className="min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white whitespace-nowrap"
                      >
                        Record Pay
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Repayment Modal */}
      {repayDebtor && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/80 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="repay-modal-title"
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3
                  id="repay-modal-title"
                  className="text-base font-extrabold text-slate-900 dark:text-slate-50"
                >
                  Deni Repayment — {repayDebtor.name}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-mono-tabular">
                  Outstanding: {formatKES(repayDebtor.balance)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRepayDebtor(null)}
                aria-label="Close repayment modal"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmRepayment} className="mt-4 space-y-3.5">
              <div>
                <label
                  htmlFor="repay-amount-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Amount Paid (KES) — Partial or Full
                </label>
                <input
                  id="repay-amount-input"
                  type="number"
                  min="1"
                  max={repayDebtor.balance}
                  step="any"
                  required
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 font-mono-tabular text-lg font-bold text-slate-900 dark:text-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRepayMethod('cash')}
                  className={`min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
                    repayMethod === 'cash'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Banknote className="h-4 w-4" />
                  <span>Cash</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRepayMethod('mpesa')}
                  className={`min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
                    repayMethod === 'mpesa'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Smartphone className="h-4 w-4" />
                  <span>M-Pesa</span>
                </button>
              </div>

              {repayMethod === 'mpesa' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="repay-mpesa-sms"
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Paste M-Pesa SMS
                    </label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const txt = await navigator.clipboard.readText();
                          if (txt) setSmsText(txt);
                        } catch {
                          setError('Long-press in box to paste SMS.');
                        }
                      }}
                      className="text-xs font-bold text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1"
                    >
                      <ClipboardPaste className="h-3.5 w-3.5" />
                      <span>Paste</span>
                    </button>
                  </div>
                  <textarea
                    id="repay-mpesa-sms"
                    rows={2}
                    value={smsText}
                    onChange={(e) => setSmsText(e.target.value)}
                    placeholder="Paste M-Pesa confirmation SMS..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-50"
                  />
                  {duplicateLog && (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-600 bg-rose-50 dark:bg-rose-950/70 p-2.5 text-xs text-rose-800 dark:text-rose-200 flex items-center gap-2"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                      <span>Duplicate M-Pesa code {duplicateLog.code} already used!</span>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !!duplicateLog}
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
              >
                Confirm Deni Repayment
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
