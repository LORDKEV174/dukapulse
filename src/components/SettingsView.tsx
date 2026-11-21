import React, { useState } from 'react';
import {
  KeyRound,
  Monitor,
  Moon,
  Shield,
  Smartphone,
  Store,
  Sun,
  X,
} from 'lucide-react';
import { db, logAudit } from '../db/database';
import type { AgentMode, ReceivingMethod, ShopSettings, ThemeMode } from '../types/duka';
import { hashPin, hashRecoveryAnswer, isValidPin } from '../utils/crypto';
import { PWAInstallButton } from './PWAStatusBar';

interface SettingsViewProps {
  settings: ShopSettings;
  onRequirePin: (action: () => void, title: string, subtitle: string) => void;
  showForgotModal: boolean;
  onSetShowForgotModal: (open: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onRequirePin,
  showForgotModal,
  onSetShowForgotModal,
}) => {
  const [feedback, setFeedback] = useState('');
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Shop editor modal
  const [showShopEdit, setShowShopEdit] = useState(false);
  const [shopName, setShopName] = useState(settings.shopName);
  const [receivingMethod, setReceivingMethod] = useState<ReceivingMethod>(
    settings.receivingMethod
  );
  const [tillNumber, setTillNumber] = useState(settings.tillNumber);
  const [paybillNumber, setPaybillNumber] = useState(settings.paybillNumber);
  const [accountNumber, setAccountNumber] = useState(settings.accountNumber);
  const [phoneNumber, setPhoneNumber] = useState(settings.phoneNumber);

  // Change PIN modal
  const [showChangePin, setShowChangePin] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Forgot PIN recovery state
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [resetNewPin, setResetNewPin] = useState('');
  const [resetError, setResetError] = useState('');

  const handleThemeChange = async (theme: ThemeMode) => {
    await db.settings.update('shop', { theme, updatedAt: Date.now() });
  };

  const handleToggleAgentAfterPin = () => {
    const nextEnabled = !settings.agentEnabled;
    onRequirePin(
      async () => {
        await db.settings.update('shop', {
          agentEnabled: nextEnabled,
          updatedAt: Date.now(),
        });
        await logAudit(
          'agent_toggle',
          `M-Pesa Agent Services turned ${nextEnabled ? 'ON' : 'OFF'}`,
          `Mode: ${settings.agentMode}`
        );
        setFeedback(
          `M-Pesa Agent Services ${nextEnabled ? 'enabled' : 'disabled'}.`
        );
      },
      nextEnabled ? 'Enable M-Pesa Agent Services' : 'Disable M-Pesa Agent Services',
      'Owner PIN required to toggle M-Pesa Agent Deposit & Withdraw.'
    );
  };

  const handleAgentModeChangeAfterPin = (mode: AgentMode) => {
    if (mode === settings.agentMode) return;
    onRequirePin(
      async () => {
        await db.settings.update('shop', {
          agentMode: mode,
          updatedAt: Date.now(),
        });
        await logAudit(
          'agent_toggle',
          `Changed Agent Commission Split to ${mode === 'direct' ? 'Direct (100%)' : 'Sub-Agent (80%)'}`,
          ''
        );
      },
      'Change Agent Split Mode',
      'Owner PIN required to switch Direct vs Sub-Agent commission.'
    );
  };

  const openShopEditorAfterPin = () => {
    onRequirePin(
      () => {
        setShopName(settings.shopName);
        setReceivingMethod(settings.receivingMethod);
        setTillNumber(settings.tillNumber);
        setPaybillNumber(settings.paybillNumber);
        setAccountNumber(settings.accountNumber);
        setPhoneNumber(settings.phoneNumber);
        setShowShopEdit(true);
      },
      'Edit Shop & Payment Details',
      'Owner PIN required to change shop name or Till/Paybill details.'
    );
  };

  const handleSaveShopDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopName.trim()) return;
    await db.settings.update('shop', {
      shopName: shopName.trim(),
      receivingMethod,
      tillNumber: tillNumber.trim(),
      paybillNumber: paybillNumber.trim(),
      accountNumber: accountNumber.trim(),
      phoneNumber: phoneNumber.trim(),
      updatedAt: Date.now(),
    });
    await logAudit(
      'settings_edit',
      `Updated shop & M-Pesa receiving details (${receivingMethod})`,
      `Shop: ${shopName.trim()}`
    );
    setShowShopEdit(false);
    setFeedback('Shop and M-Pesa receiving details updated.');
  };

  const handleChangePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const curHash = await hashPin(currentPin);
    if (curHash !== settings.pinHash) {
      setPinError('Current Owner PIN is incorrect.');
      return;
    }
    if (!isValidPin(newPin)) {
      setPinError('New PIN must be exactly 4 digits.');
      return;
    }
    if (newPin !== confirmNewPin) {
      setPinError('New PIN and confirmation do not match.');
      return;
    }
    const nextHash = await hashPin(newPin);
    await db.settings.update('shop', { pinHash: nextHash, updatedAt: Date.now() });
    await logAudit('pin_change', 'Owner PIN changed', 'Verified current PIN');
    setShowChangePin(false);
    setCurrentPin('');
    setNewPin('');
    setConfirmNewPin('');
    setPinError('');
    setFeedback('Owner PIN updated successfully.');
  };

  const handleForgotPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ansHash = await hashRecoveryAnswer(recoveryAnswer);
    if (ansHash !== settings.recoveryAnswerHash) {
      setResetError('Secret Recovery Answer does not match.');
      return;
    }
    if (!isValidPin(resetNewPin)) {
      setResetError('New PIN must be exactly 4 digits.');
      return;
    }
    const nextHash = await hashPin(resetNewPin);
    await db.settings.update('shop', { pinHash: nextHash, updatedAt: Date.now() });
    await logAudit(
      'pin_change',
      'Owner PIN reset via Secret Recovery Answer',
      settings.recoveryQuestion
    );
    onSetShowForgotModal(false);
    setRecoveryAnswer('');
    setResetNewPin('');
    setResetError('');
    setFeedback('Owner PIN reset successfully using Secret Recovery Answer.');
  };

  const paymentSummary =
    settings.receivingMethod === 'till'
      ? `M-Pesa Buy Goods Till: ${settings.tillNumber}`
      : settings.receivingMethod === 'paybill'
        ? `M-Pesa Paybill: ${settings.paybillNumber} · Acc: ${settings.accountNumber}`
        : `Pochi / Send Money: ${settings.phoneNumber}`;

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-4 py-3 text-xs font-semibold text-emerald-900 dark:text-emerald-200"
        >
          {feedback}
        </div>
      )}

      {/* Theme Switcher */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Display Theme
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            High-contrast Light mode for bright sun, Dark mode for night shifts, or follow Android System.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'system' as const, label: 'System', icon: Monitor },
            { id: 'light' as const, label: 'Light', icon: Sun },
            { id: 'dark' as const, label: 'Dark', icon: Moon },
          ].map((opt) => {
            const Icon = opt.icon;
            const active = settings.theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => void handleThemeChange(opt.id)}
                className={`min-h-[44px] rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
                  active
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Shop Details */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Store className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {settings.shopName}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 font-mono-tabular mt-0.5">
              {paymentSummary}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openShopEditorAfterPin}
          className="min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
        >
          Edit Shop Details
        </button>
      </section>

      {/* M-Pesa Agent Services Toggle */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Smartphone className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Enable M-Pesa Agent Services
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Adds M-Pesa Deposit & Withdraw buttons to Sell screen with automatic Safaricom tariff commissions.
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={settings.agentEnabled}
            aria-label="Enable M-Pesa Agent Services"
            onClick={handleToggleAgentAfterPin}
            className={`min-h-[44px] min-w-[64px] rounded-xl px-3 text-xs font-extrabold transition-colors ${
              settings.agentEnabled
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {settings.agentEnabled ? 'ON' : 'OFF'}
          </button>
        </div>

        {settings.agentEnabled && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleAgentModeChangeAfterPin('direct')}
              className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-bold ${
                settings.agentMode === 'direct'
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              Direct Agent (100%)
            </button>
            <button
              type="button"
              onClick={() => handleAgentModeChangeAfterPin('subagent')}
              className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-bold ${
                settings.agentMode === 'subagent'
                  ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              Sub-Agent (80% Split)
            </button>
          </div>
        )}
      </section>

      {/* Security & PIN */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Security & Owner PIN
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setCurrentPin('');
              setNewPin('');
              setConfirmNewPin('');
              setPinError('');
              setShowChangePin(true);
            }}
            className="min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-bold text-slate-800 dark:text-slate-200"
          >
            Change Owner PIN
          </button>
          <button
            type="button"
            onClick={() => {
              setRecoveryAnswer('');
              setResetNewPin('');
              setResetError('');
              onSetShowForgotModal(true);
            }}
            className="min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-400"
          >
            Forgot PIN?
          </button>
        </div>
      </section>

      {/* Install PWA & Legal */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <PWAInstallButton />
        <button
          type="button"
          onClick={() => setShowTermsModal(true)}
          className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Shield className="h-4 w-4 text-emerald-600" />
          <span>Terms & Privacy Notice (Kenya DPA 2019)</span>
        </button>
      </section>

      {/* Edit Shop Details Modal */}
      {showShopEdit && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/80 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-shop-title"
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 id="edit-shop-title" className="text-base font-bold text-slate-900 dark:text-slate-50">
                Edit Shop & M-Pesa Details
              </h3>
              <button
                type="button"
                onClick={() => setShowShopEdit(false)}
                aria-label="Close shop editor"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveShopDetails} className="mt-4 space-y-3">
              <div>
                <label htmlFor="edit-shop-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Shop Name
                </label>
                <input
                  id="edit-shop-name"
                  type="text"
                  required
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50"
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'till' as const, label: 'Till' },
                  { id: 'paybill' as const, label: 'Paybill' },
                  { id: 'pochi' as const, label: 'Pochi' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setReceivingMethod(m.id)}
                    className={`min-h-[44px] rounded-xl border text-xs font-bold ${
                      receivingMethod === m.id
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {receivingMethod === 'till' && (
                <input
                  type="text"
                  required
                  value={tillNumber}
                  onChange={(e) => setTillNumber(e.target.value)}
                  placeholder="Till Number"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:text-slate-50"
                />
              )}
              {receivingMethod === 'paybill' && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={paybillNumber}
                    onChange={(e) => setPaybillNumber(e.target.value)}
                    placeholder="Paybill"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:text-slate-50"
                  />
                  <input
                    type="text"
                    required
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Account"
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:text-slate-50"
                  />
                </div>
              )}
              {receivingMethod === 'pochi' && (
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Phone Number"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm text-slate-900 dark:text-slate-50"
                />
              )}
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
              >
                Save Shop Details
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Change PIN Modal */}
      {showChangePin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="change-pin-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 id="change-pin-title" className="text-base font-bold text-slate-900 dark:text-slate-50">
                Change Owner PIN
              </h3>
              <button
                type="button"
                onClick={() => setShowChangePin(false)}
                aria-label="Close change PIN dialog"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleChangePinSubmit} className="mt-4 space-y-3">
              <div>
                <label htmlFor="cur-pin" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Current 4-Digit PIN
                </label>
                <input
                  id="cur-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-base text-slate-900 dark:text-slate-50"
                />
              </div>
              <div>
                <label htmlFor="next-pin" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  New 4-Digit PIN
                </label>
                <input
                  id="next-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-base text-slate-900 dark:text-slate-50"
                />
              </div>
              <div>
                <label htmlFor="confirm-next-pin" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Confirm New PIN
                </label>
                <input
                  id="confirm-next-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={confirmNewPin}
                  onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-base text-slate-900 dark:text-slate-50"
                />
              </div>
              {pinError && <p role="alert" className="text-xs font-semibold text-rose-600">{pinError}</p>}
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
              >
                Update Owner PIN
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Forgot PIN Recovery Modal */}
      {showForgotModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-pin-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 id="forgot-pin-title" className="text-base font-bold text-slate-900 dark:text-slate-50">
                Recover Owner PIN
              </h3>
              <button
                type="button"
                onClick={() => onSetShowForgotModal(false)}
                aria-label="Close PIN recovery dialog"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleForgotPinSubmit} className="mt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {settings.recoveryQuestion}
              </p>
              <div>
                <label htmlFor="recover-answer" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Secret Recovery Answer
                </label>
                <input
                  id="recover-answer"
                  type="text"
                  required
                  value={recoveryAnswer}
                  onChange={(e) => setRecoveryAnswer(e.target.value)}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50"
                />
              </div>
              <div>
                <label htmlFor="recover-new-pin" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  New 4-Digit PIN
                </label>
                <input
                  id="recover-new-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  required
                  value={resetNewPin}
                  onChange={(e) => setResetNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-base text-slate-900 dark:text-slate-50"
                />
              </div>
              {resetError && <p role="alert" className="text-xs font-semibold text-rose-600">{resetError}</p>}
              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
              >
                Reset PIN
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Terms & Privacy Notice Modal */}
      {showTermsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 id="terms-modal-title" className="text-base font-extrabold text-slate-900 dark:text-slate-50">
                Terms & Privacy Notice
              </h3>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                aria-label="Close terms and privacy modal"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <p>
                <strong>1. Local Device Ownership:</strong> All inventory, daily sales, M-Pesa verification logs, and Deni ledgers belong exclusively to the Shop Owner and are stored locally in IndexedDB on this device. No cloud server receives your shop records.
              </p>
              <p>
                <strong>2. Kenya Data Protection Act (2019):</strong> When saving customer names and phone numbers in the Deni Book or sending WhatsApp payment reminders, the Shop Owner agrees to obtain customer consent and safeguard phone numbers responsibly in compliance with the Kenya Data Protection Act (2019).
              </p>
              <p>
                <strong>3. Record-Keeping Tool Disclaimer:</strong> DukaPulse is an offline retail record-keeping and drawer-reconciliation ledger. It is <strong>not</strong> a mobile money wallet, bank account, or KRA eTIMS fiscal invoicing system.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTermsModal(false)}
              className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
