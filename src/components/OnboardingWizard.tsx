import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Lock, PackagePlus, ShieldCheck, Store, Trash2 } from 'lucide-react';
import { db } from '../db/database';
import type { Product, ReceivingMethod, ShopSettings } from '../types/duka';
import { hashPin, hashRecoveryAnswer, isValidPin } from '../utils/crypto';
import { formatKES } from '../utils/dates';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const RECOVERY_QUESTIONS = [
  "What is your mother's first name?",
  'Which primary school did you attend?',
  'What is the name of your home village or estate?',
  'What is your favourite Kenyan town?',
];

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  onComplete,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Security
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [recoveryQuestion, setRecoveryQuestion] = useState(RECOVERY_QUESTIONS[0]);
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [step1Error, setStep1Error] = useState('');

  // Step 2: Shop & Payment Details
  const [shopName, setShopName] = useState('');
  const [receivingMethod, setReceivingMethod] = useState<ReceivingMethod>('till');
  const [tillNumber, setTillNumber] = useState('');
  const [paybillNumber, setPaybillNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [step2Error, setStep2Error] = useState('');

  // Step 3: Initial Inventory
  const [draftItems, setDraftItems] = useState<Omit<Product, 'id' | 'updatedAt'>[]>([]);
  const [prodName, setProdName] = useState('');
  const [buyingPrice, setBuyingPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [lowStockAlert, setLowStockAlert] = useState('5');
  const [step3Error, setStep3Error] = useState('');
  const [saving, setSaving] = useState(false);

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPin(pin)) {
      setStep1Error('Owner PIN must be exactly 4 digits (e.g. 2580).');
      return;
    }
    if (pin !== confirmPin) {
      setStep1Error('PIN and Confirm PIN do not match.');
      return;
    }
    if (recoveryAnswer.trim().length < 2) {
      setStep1Error('Enter a secret recovery answer (at least 2 characters) in case you forget your PIN.');
      return;
    }
    setStep1Error('');
    setStep(2);
  };

  const handleStep2Next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim()) {
      setStep2Error('Enter your Shop / Duka Name.');
      return;
    }
    if (receivingMethod === 'till' && !tillNumber.trim()) {
      setStep2Error('Enter your M-Pesa Buy Goods Till Number.');
      return;
    }
    if (receivingMethod === 'paybill' && (!paybillNumber.trim() || !accountNumber.trim())) {
      setStep2Error('Enter both your M-Pesa Paybill and Account Number.');
      return;
    }
    if (receivingMethod === 'pochi' && !phoneNumber.trim()) {
      setStep2Error('Enter your Pochi / Send Money phone number.');
      return;
    }
    setStep2Error('');
    setStep(3);
  };

  const handleAddDraftItem = (e: React.FormEvent) => {
    e.preventDefault();
    const bp = Number(buyingPrice);
    const sp = Number(sellingPrice);
    const qty = Number(stockQty);
    const alert = Number(lowStockAlert || '5');

    if (!prodName.trim()) {
      setStep3Error('Enter item name.');
      return;
    }
    if (!Number.isFinite(bp) || bp < 0 || !Number.isFinite(sp) || sp <= 0) {
      setStep3Error('Enter valid Buying and Selling prices.');
      return;
    }
    if (!Number.isFinite(qty) || qty < 0) {
      setStep3Error('Enter valid starting Stock Qty.');
      return;
    }

    setDraftItems((prev) => [
      ...prev,
      {
        name: prodName.trim(),
        buyingPrice: bp,
        sellingPrice: sp,
        stockQty: qty,
        lowStockAlert: Number.isFinite(alert) && alert >= 0 ? alert : 5,
      },
    ]);
    setProdName('');
    setBuyingPrice('');
    setSellingPrice('');
    setStockQty('');
    setLowStockAlert('5');
    setStep3Error('');
  };

  const finishOnboarding = async () => {
    setSaving(true);
    setStep3Error('');
    try {
      const [pinHash, recoveryAnswerHash] = await Promise.all([
        hashPin(pin),
        hashRecoveryAnswer(recoveryAnswer),
      ]);

      const settings: ShopSettings = {
        id: 'shop',
        shopName: shopName.trim(),
        receivingMethod,
        tillNumber: tillNumber.trim(),
        paybillNumber: paybillNumber.trim(),
        accountNumber: accountNumber.trim(),
        phoneNumber: phoneNumber.trim(),
        pinHash,
        recoveryQuestion,
        recoveryAnswerHash,
        theme: 'system',
        agentEnabled: false,
        agentMode: 'direct',
        onboardingComplete: true,
        updatedAt: Date.now(),
      };

      await db.transaction('rw', [db.settings, db.products], async () => {
        await db.settings.put(settings);
        const now = Date.now();
        if (draftItems.length > 0) {
          await db.products.bulkAdd(
            draftItems.map((item) => ({ ...item, updatedAt: now }))
          );
        }
      });
      onComplete();
    } catch (err) {
      setStep3Error(
        err instanceof Error ? err.message : 'Failed to save shop setup.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
        {/* Header & Step Progress */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
              DukaPulse Setup
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
              Offline-first POS & ledger · Step {step} of 3
            </p>
          </div>
          <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 3`}>
            {[1, 2, 3].map((s) => (
              <span
                key={s}
                className={`h-2.5 w-7 rounded-full transition-colors ${
                  s <= step
                    ? 'bg-emerald-600'
                    : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step 1: Security */}
        {step === 1 && (
          <form onSubmit={handleStep1Next} className="mt-6 space-y-4">
            <div className="flex items-center gap-2.5 text-emerald-700 dark:text-emerald-400">
              <Lock className="h-5 w-5" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                1. Owner PIN & Recovery Lock
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Protects your daily cash drawer, profit totals, buying prices, and stock edits. Stored securely as SHA-256 hashes on this phone only.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="setup-pin"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Create 4-Digit Owner PIN
                </label>
                <input
                  id="setup-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="e.g. 2580"
                  required
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 font-mono-tabular text-lg tracking-widest text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="setup-confirm-pin"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Confirm 4-Digit PIN
                </label>
                <input
                  id="setup-confirm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) =>
                    setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="Repeat PIN"
                  required
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 font-mono-tabular text-lg tracking-widest text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="setup-recovery-q"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Secret Recovery Question
              </label>
              <select
                id="setup-recovery-q"
                value={recoveryQuestion}
                onChange={(e) => setRecoveryQuestion(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
              >
                {RECOVERY_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="setup-recovery-a"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Secret Recovery Answer
              </label>
              <input
                id="setup-recovery-a"
                type="text"
                value={recoveryAnswer}
                onChange={(e) => setRecoveryAnswer(e.target.value)}
                placeholder="Type your secret answer"
                required
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            {step1Error && (
              <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {step1Error}
              </p>
            )}

            <button
              type="submit"
              className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <span>Continue to Shop Details</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Step 2: Shop & Payment Details */}
        {step === 2 && (
          <form onSubmit={handleStep2Next} className="mt-6 space-y-4">
            <div className="flex items-center gap-2.5 text-emerald-700 dark:text-emerald-400">
              <Store className="h-5 w-5" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                2. Shop & M-Pesa Receiving Details
              </h2>
            </div>

            <div>
              <label
                htmlFor="setup-shop-name"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Shop / Duka Name
              </label>
              <input
                id="setup-shop-name"
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g. Wanjiku Corner Duka"
                required
                className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                How do customers pay via M-Pesa?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'till' as const, label: 'Buy Goods Till' },
                  { id: 'paybill' as const, label: 'M-Pesa Paybill' },
                  { id: 'pochi' as const, label: 'Pochi / Send Money' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setReceivingMethod(opt.id)}
                    className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
                      receivingMethod === opt.id
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {receivingMethod === 'till' && (
              <div>
                <label
                  htmlFor="setup-till"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Till Number
                </label>
                <input
                  id="setup-till"
                  type="text"
                  inputMode="numeric"
                  value={tillNumber}
                  onChange={(e) => setTillNumber(e.target.value)}
                  placeholder="e.g. 5432109"
                  required
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 font-mono-tabular text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            )}

            {receivingMethod === 'paybill' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="setup-paybill"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Paybill Number
                  </label>
                  <input
                    id="setup-paybill"
                    type="text"
                    inputMode="numeric"
                    value={paybillNumber}
                    onChange={(e) => setPaybillNumber(e.target.value)}
                    placeholder="e.g. 522522"
                    required
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 font-mono-tabular text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="setup-account"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Account Number
                  </label>
                  <input
                    id="setup-account"
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="e.g. 1234567"
                    required
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 font-mono-tabular text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {receivingMethod === 'pochi' && (
              <div>
                <label
                  htmlFor="setup-phone"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Pochi / Send Money Phone Number
                </label>
                <input
                  id="setup-phone"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g. 0712345678"
                  required
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-2.5 font-mono-tabular text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            )}

            {step2Error && (
              <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                {step2Error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="min-h-[48px] px-5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300"
              >
                Back
              </button>
              <button
                type="submit"
                className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2"
              >
                <span>Continue to Initial Stock</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}

        {/* Step 3: Initial Inventory */}
        {step === 3 && (
          <div className="mt-6 space-y-5">
            <div className="flex items-center gap-2.5 text-emerald-700 dark:text-emerald-400">
              <PackagePlus className="h-5 w-5" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-50">
                3. Quick-Add Initial Inventory (Optional)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
              DukaPulse starts completely clean with zero fake items. Add your first products now or skip straight to the shop.
            </p>

            <form onSubmit={handleAddDraftItem} className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
              <div>
                <label
                  htmlFor="init-item-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Product Name
                </label>
                <input
                  id="init-item-name"
                  type="text"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="e.g. Jogoo Maize Meal 2kg"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label
                    htmlFor="init-buy"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Buying (KES)
                  </label>
                  <input
                    id="init-buy"
                    type="number"
                    min="0"
                    step="any"
                    value={buyingPrice}
                    onChange={(e) => setBuyingPrice(e.target.value)}
                    placeholder="130"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="init-sell"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Selling (KES)
                  </label>
                  <input
                    id="init-sell"
                    type="number"
                    min="1"
                    step="any"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    placeholder="160"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="init-qty"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Stock Qty
                  </label>
                  <input
                    id="init-qty"
                    type="number"
                    min="0"
                    step="any"
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    placeholder="20"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="init-alert"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Low Alert
                  </label>
                  <input
                    id="init-alert"
                    type="number"
                    min="0"
                    value={lowStockAlert}
                    onChange={(e) => setLowStockAlert(e.target.value)}
                    placeholder="5"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {step3Error && (
                <p role="alert" className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {step3Error}
                </p>
              )}

              <button
                type="submit"
                className="w-full min-h-[44px] rounded-xl border border-emerald-600 text-emerald-700 dark:text-emerald-400 font-bold text-xs sm:text-sm hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                + Add Item to Starting Stock
              </button>
            </form>

            {draftItems.length > 0 && (
              <div className="space-y-2 max-h-44 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Items ready to save ({draftItems.length})
                </p>
                {draftItems.map((item, idx) => (
                  <div
                    key={`${item.name}-${idx}`}
                    className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-bold text-slate-900 dark:text-slate-100">
                        {item.name}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 font-mono-tabular">
                        Buy {formatKES(item.buyingPrice)} · Sell {formatKES(item.sellingPrice)} · Qty {item.stockQty}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() =>
                        setDraftItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="min-h-[48px] px-5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-300"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void finishOnboarding()}
                className="flex-1 min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {draftItems.length > 0 ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Finish & Open Shop ({draftItems.length} items)</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    <span>Skip to Shop</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
