import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardPaste,
  Smartphone,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  db,
  DuplicateMpesaError,
  recordCashSale,
  recordDeniSale,
  recordMpesaSale,
} from '../db/database';
import type { ActiveCart, Debtor, MpesaLog, ShopSettings } from '../types/duka';
import { formatKES } from '../utils/dates';
import { parseMpesaSms } from '../utils/mpesaParser';

interface CheckoutModalProps {
  isOpen: boolean;
  cart: ActiveCart | null;
  settings: ShopSettings;
  debtors: Debtor[];
  todayDateKey: string;
  incomingMpesaSms?: string;
  onClearIncomingMpesa?: () => void;
  onSuccess: (message: string) => void;
  onClose: () => void;
}

type PayTab = 'cash' | 'mpesa' | 'deni';

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  cart,
  settings,
  debtors,
  todayDateKey,
  incomingMpesaSms,
  onClearIncomingMpesa,
  onSuccess,
  onClose,
}) => {
  const [payTab, setPayTab] = useState<PayTab>('cash');

  // Cash state
  const [cashTendered, setCashTendered] = useState('');

  // M-Pesa state
  const [smsText, setSmsText] = useState('');
  const [duplicateLog, setDuplicateLog] = useState<MpesaLog | null>(null);

  // Deni state
  const [deniMode, setDeniMode] = useState<'existing' | 'new'>('new');
  const [selectedDebtorId, setSelectedDebtorId] = useState<number | ''>('');
  const [debtorSearch, setDebtorSearch] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const cartTotal = useMemo(() => {
    if (!cart) return 0;
    return Math.round(
      cart.items.reduce((sum, i) => sum + i.sellingPrice * i.qty, 0) * 100
    ) / 100;
  }, [cart]);

  useEffect(() => {
    if (isOpen) {
      setPayTab(incomingMpesaSms ? 'mpesa' : 'cash');
      setCashTendered('');
      setSmsText(incomingMpesaSms || '');
      setDuplicateLog(null);
      setDeniMode(debtors.length > 0 ? 'existing' : 'new');
      setSelectedDebtorId(debtors[0]?.id ?? '');
      setDebtorSearch('');
      setNewCustomerName('');
      setNewCustomerPhone('');
      setError('');
      setSubmitting(false);
      if (incomingMpesaSms) {
        onClearIncomingMpesa?.();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Support native Capacitor auto-intercept incoming SMS while modal is already open
  useEffect(() => {
    if (isOpen && incomingMpesaSms) {
      setPayTab('mpesa');
      setSmsText(incomingMpesaSms);
      setError('');
      onClearIncomingMpesa?.();
    }
  }, [isOpen, incomingMpesaSms, onClearIncomingMpesa]);

  const parsedSms = useMemo(() => {
    if (!smsText.trim()) return null;
    return parseMpesaSms(smsText);
  }, [smsText]);

  // Proactive duplicate M-Pesa fraud check whenever a valid 10-char code is parsed
  useEffect(() => {
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

  const filteredDebtors = useMemo(() => {
    const q = debtorSearch.trim().toLowerCase();
    if (!q) return debtors;
    return debtors.filter(
      (d) =>
        d.name.toLowerCase().includes(q) || d.phone.toLowerCase().includes(q)
    );
  }, [debtors, debtorSearch]);

  if (!isOpen || !cart) return null;

  const tenderedNum = cashTendered === '' ? cartTotal : Number(cashTendered);
  const cashChange =
    Number.isFinite(tenderedNum) && tenderedNum >= cartTotal
      ? Math.round((tenderedNum - cartTotal) * 100) / 100
      : 0;
  const cashShortfall =
    Number.isFinite(tenderedNum) && tenderedNum < cartTotal
      ? Math.round((cartTotal - tenderedNum) * 100) / 100
      : 0;

  const mpesaCashChange =
    parsedSms?.isValid && parsedSms.amount > cartTotal
      ? Math.round((parsedSms.amount - cartTotal) * 100) / 100
      : 0;

  const handlePasteClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setSmsText(clip);
        setError('');
      } else {
        setError('Clipboard is empty. Copy the M-Pesa SMS first.');
      }
    } catch {
      setError('Clipboard access blocked. Long-press inside the box to paste.');
    }
  };

  const handleConfirmCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(tenderedNum) || tenderedNum < cartTotal) {
      setError('Amount tendered cannot be less than cart total.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await recordCashSale({
        cart,
        amountTendered: tenderedNum,
        dateKey: todayDateKey,
      });
      onSuccess(
        cashChange > 0
          ? `Cash sale recorded (${formatKES(cartTotal)}). Give change: ${formatKES(cashChange)}.`
          : `Cash sale recorded (${formatKES(cartTotal)}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmMpesa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedSms || !parsedSms.isValid) {
      setError(parsedSms?.error || 'Paste a valid Safaricom M-Pesa SMS.');
      return;
    }
    if (duplicateLog) {
      setError(`Fraud Alert: Code ${duplicateLog.code} was already used!`);
      return;
    }
    if (parsedSms.amount < cartTotal) {
      setError(
        `M-Pesa amount (${formatKES(parsedSms.amount)}) is less than cart total (${formatKES(cartTotal)}).`
      );
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await recordMpesaSale({
        cart,
        parsedSms,
        dateKey: todayDateKey,
      });
      onSuccess(
        res.cashChange > 0
          ? `M-Pesa ${parsedSms.code} verified! Give cash change: ${formatKES(res.cashChange)}.`
          : `M-Pesa ${parsedSms.code} (${formatKES(parsedSms.amount)}) verified!`
      );
    } catch (err) {
      if (err instanceof DuplicateMpesaError) {
        setDuplicateLog(err.existingLog);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'M-Pesa verification failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDeni = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deniMode === 'existing' && !selectedDebtorId) {
      setError('Select a customer from Deni Book or switch to New Customer.');
      return;
    }
    if (deniMode === 'new' && !newCustomerName.trim()) {
      setError('Enter the customer name.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await recordDeniSale({
        cart,
        debtorId: deniMode === 'existing' ? Number(selectedDebtorId) : undefined,
        newDebtorName: deniMode === 'new' ? newCustomerName : undefined,
        newDebtorPhone: deniMode === 'new' ? newCustomerPhone : undefined,
        dateKey: todayDateKey,
      });
      onSuccess(`Deni credit of ${formatKES(cartTotal)} recorded.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record Deni.');
    } finally {
      setSubmitting(false);
    }
  };

  const paymentTargetLine =
    settings.receivingMethod === 'till'
      ? `Buy Goods Till: ${settings.tillNumber}`
      : settings.receivingMethod === 'paybill'
        ? `Paybill: ${settings.paybillNumber} · Acc: ${settings.accountNumber}`
        : `Pochi / Send Money: ${settings.phoneNumber}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/80 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
    >
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              {cart.label} · {cart.items.reduce((s, i) => s + i.qty, 0)}{' '}
              {cart.items.reduce((s, i) => s + i.qty, 0) === 1 ? 'item' : 'items'}
            </p>
            <h2
              id="checkout-modal-title"
              className="text-xl font-extrabold text-slate-900 dark:text-slate-50 font-mono-tabular mt-0.5"
            >
              Total: {formatKES(cartTotal)}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Payment Mode Tabs */}
        <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 dark:bg-slate-950 p-1 border border-slate-200 dark:border-slate-800">
          {[
            { id: 'cash' as const, label: 'Cash', icon: Banknote },
            { id: 'mpesa' as const, label: 'M-Pesa', icon: Smartphone },
            { id: 'deni' as const, label: 'Deni', icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = payTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setPayTab(tab.id);
                  setError('');
                }}
                className={`min-h-[44px] rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* CASH MODE */}
        {payTab === 'cash' && (
          <form onSubmit={handleConfirmCash} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="cash-tendered-input"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Amount Tendered (KES) — Leave blank for Exact
              </label>
              <input
                id="cash-tendered-input"
                type="number"
                min="0"
                step="any"
                value={cashTendered}
                onChange={(e) => {
                  setCashTendered(e.target.value);
                  setError('');
                }}
                placeholder={`${cartTotal} (Exact)`}
                className="w-full min-h-[48px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 font-mono-tabular text-lg font-bold text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setCashTendered(String(cartTotal))}
                className="min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-emerald-500"
              >
                Exact
              </button>
              {[500, 1000, 2000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setCashTendered(String(amt))}
                  className="min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 font-mono-tabular text-xs font-bold text-slate-800 dark:text-slate-200 hover:border-emerald-500"
                >
                  {amt.toLocaleString()}
                </button>
              ))}
            </div>

            {cashChange > 0 && (
              <div className="rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 p-3.5 text-center">
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  GIVE CHANGE: {formatKES(cashChange)}
                </p>
              </div>
            )}

            {cashShortfall > 0 && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 p-3 text-center">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Short by {formatKES(cashShortfall)}
                </p>
              </div>
            )}

            {error && (
              <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || cashShortfall > 0}
              className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-50"
            >
              Complete Cash Sale ({formatKES(cartTotal)})
            </button>
          </form>
        )}

        {/* M-PESA MODE */}
        {payTab === 'mpesa' && (
          <form onSubmit={handleConfirmMpesa} className="mt-5 space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-xs">
              <p className="font-semibold text-slate-600 dark:text-slate-400">
                Customer pays to:
              </p>
              <p className="font-mono-tabular font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                {paymentTargetLine}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="mpesa-sms-textarea"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Verify M-Pesa Payment SMS
                </label>
                <button
                  type="button"
                  onClick={() => void handlePasteClipboard()}
                  className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  <ClipboardPaste className="h-3.5 w-3.5" />
                  <span>Paste SMS</span>
                </button>
              </div>
              <textarea
                id="mpesa-sms-textarea"
                rows={3}
                value={smsText}
                onChange={(e) => {
                  setSmsText(e.target.value);
                  setError('');
                }}
                placeholder="Paste Safaricom M-Pesa SMS e.g. UCK4X9M2PQ Confirmed. You have received Ksh500.00 from JOHN DOE 0712345678 on 21/11/26 at 10:05 AM..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2.5 text-xs text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            {/* Duplicate Fraud Alert */}
            {duplicateLog && (
              <div
                role="alert"
                className="rounded-xl border-2 border-rose-600 bg-rose-50 dark:bg-rose-950/80 p-3.5 text-rose-900 dark:text-rose-100"
              >
                <div className="flex items-center gap-2 font-extrabold text-xs">
                  <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>RED FRAUD ALERT: DUPLICATE M-PESA CODE</span>
                </div>
                <p className="mt-1 text-xs">
                  Code <strong className="font-mono-tabular">{duplicateLog.code}</strong> ({formatKES(duplicateLog.amount)}) was already logged on {duplicateLog.date} from {duplicateLog.senderName}. Do NOT release goods.
                </p>
              </div>
            )}

            {/* Parsed SMS Preview */}
            {parsedSms && parsedSms.isValid && !duplicateLog && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 p-3.5 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Code Verified: <span className="font-mono-tabular">{parsedSms.code}</span>
                  </span>
                  <span className="font-mono-tabular font-extrabold text-slate-900 dark:text-slate-50">
                    {formatKES(parsedSms.amount)}
                  </span>
                </div>
                <p className="text-slate-700 dark:text-slate-300">
                  From: <strong>{parsedSms.senderName}</strong>
                  {parsedSms.senderPhone ? ` · ${parsedSms.senderPhone}` : ''}
                  {parsedSms.rawTimestamp ? ` · ${parsedSms.rawTimestamp}` : ''}
                </p>
                {parsedSms.amount < cartTotal && (
                  <p className="font-bold text-rose-600 dark:text-rose-400">
                    Underpaid by {formatKES(cartTotal - parsedSms.amount)}.
                  </p>
                )}
              </div>
            )}

            {parsedSms && !parsedSms.isValid && smsText.trim().length > 5 && (
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {parsedSms.error}
              </p>
            )}

            {mpesaCashChange > 0 && !duplicateLog && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 p-3.5 text-center">
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  GIVE CASH CHANGE: {formatKES(mpesaCashChange)}
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                  Subtracts {formatKES(mpesaCashChange)} from Drawer Cash and adds {formatKES(parsedSms!.amount)} to M-Pesa.
                </p>
              </div>
            )}

            {error && (
              <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={
                submitting ||
                !parsedSms?.isValid ||
                !!duplicateLog ||
                parsedSms.amount < cartTotal
              }
              className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm disabled:opacity-50"
            >
              Verify & Complete M-Pesa Sale
            </button>
          </form>
        )}

        {/* DENI (CREDIT) MODE */}
        {payTab === 'deni' && (
          <form onSubmit={handleConfirmDeni} className="mt-5 space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeniMode('existing')}
                disabled={debtors.length === 0}
                className={`flex-1 min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                  deniMode === 'existing'
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Users className="h-4 w-4" />
                <span>Existing Debtor ({debtors.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setDeniMode('new')}
                className={`flex-1 min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
                  deniMode === 'new'
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <UserPlus className="h-4 w-4" />
                <span>New Customer</span>
              </button>
            </div>

            {deniMode === 'existing' ? (
              <div className="space-y-2.5">
                <input
                  type="search"
                  value={debtorSearch}
                  onChange={(e) => setDebtorSearch(e.target.value)}
                  placeholder="Search customer name or phone..."
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50"
                />
                <div className="max-h-44 overflow-y-auto space-y-1.5">
                  {filteredDebtors.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setSelectedDebtorId(d.id!)}
                      className={`w-full min-h-[48px] flex items-center justify-between rounded-xl border px-3.5 py-2 text-left text-xs ${
                        selectedDebtorId === d.id
                          ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-slate-900 dark:text-slate-100">
                          {d.name}
                        </p>
                        <p className="text-slate-600 dark:text-slate-400">
                          {d.phone || 'No phone'}
                        </p>
                      </div>
                      <span className="font-mono-tabular font-bold text-amber-700 dark:text-amber-400">
                        Owes {formatKES(d.balance)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="deni-new-name"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Customer Name
                  </label>
                  <input
                    id="deni-new-name"
                    type="text"
                    required
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="e.g. Mama Njeri"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="deni-new-phone"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Phone Number (for WhatsApp Reminders)
                  </label>
                  <input
                    id="deni-new-phone"
                    type="tel"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="e.g. 0712345678"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:text-slate-50"
                  />
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              Stock deducts immediately. Cash In and Profit stay at KES 0 until repayment is recorded.
            </p>

            {error && (
              <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full min-h-[48px] rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm disabled:opacity-50"
            >
              Give on Deni ({formatKES(cartTotal)})
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
