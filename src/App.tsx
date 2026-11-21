import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart3,
  BookOpen,
  Package,
  Settings as SettingsIcon,
  ShoppingCart,
} from 'lucide-react';
import { DailyFloatGate } from './components/DailyFloatGate';
import { DeniView } from './components/DeniView';
import { OnboardingWizard } from './components/OnboardingWizard';
import { PinModal } from './components/PinModal';
import { OfflineIndicator, PWAInstallButton } from './components/PWAStatusBar';
import { ReportsView } from './components/ReportsView';
import { SellView } from './components/SellView';
import { SettingsView } from './components/SettingsView';
import { StockView } from './components/StockView';
import { db, ensureAtLeastOneCart } from './db/database';
import { usePrivacyShield } from './hooks/usePrivacyShield';
import { useTheme } from './hooks/useTheme';
import type { TabKey } from './types/duka';
import { getTodayDateKey } from './utils/dates';
import { computeDailySummary } from './utils/finance';

declare global {
  interface Window {
    onMpesaMessageReceived?: (smsText: string) => void;
  }
}

export default function App() {
  const [todayDateKey, setTodayDateKey] = useState(() => getTodayDateKey());
  const [activeTab, setActiveTab] = useState<TabKey>('sell');
  const [incomingMpesaSms, setIncomingMpesaSms] = useState('');
  const [showForgotPinModal, setShowForgotPinModal] = useState(false);

  // PIN Prompt Coordinator
  const [pinRequest, setPinRequest] = useState<{
    title: string;
    subtitle?: string;
    onSuccess: () => void;
  } | null>(null);

  const settings = useLiveQuery(() => db.settings.get('shop'), []);
  const todayFloat = useLiveQuery(
    () => db.daily_floats.get(todayDateKey),
    [todayDateKey]
  );

  // Low-RAM Optimization: Query ONLY today's transactions on startup!
  const todayTransactions = useLiveQuery(
    () => db.transactions.where('date').equals(todayDateKey).toArray(),
    [todayDateKey]
  );

  const products = useLiveQuery(() => db.products.toArray(), []);
  const activeCarts = useLiveQuery(
    () => db.active_carts.orderBy('createdAt').toArray(),
    []
  );
  const debtors = useLiveQuery(() => db.debtors.toArray(), []);

  useTheme(settings?.theme ?? 'system');
  const { isUnlocked, secondsLeft, unlockFor60s, lockNow } = usePrivacyShield();

  // Keep todayDateKey fresh if device crosses midnight
  useEffect(() => {
    const interval = window.setInterval(() => {
      const latest = getTodayDateKey();
      setTodayDateKey((prev) => (prev === latest ? prev : latest));
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  // Ensure at least one FIFO cart exists once daily float is opened (and after last checkout)
  useEffect(() => {
    if (
      settings?.onboardingComplete &&
      todayFloat &&
      activeCarts !== undefined &&
      activeCarts.length === 0
    ) {
      void ensureAtLeastOneCart();
    }
  }, [settings?.onboardingComplete, todayFloat, activeCarts]);

  // Expose global Capacitor / Android M-Pesa notification intercept hook
  useEffect(() => {
    window.onMpesaMessageReceived = (smsText: string) => {
      if (typeof smsText === 'string' && smsText.trim()) {
        setIncomingMpesaSms(smsText.trim());
        setActiveTab('sell');
      }
    };
    return () => {
      delete window.onMpesaMessageReceived;
    };
  }, []);

  const clearIncomingMpesa = useCallback(() => {
    setIncomingMpesaSms('');
  }, []);

  const requirePin = useCallback(
    (action: () => void, title: string, subtitle: string) => {
      setPinRequest({
        title,
        subtitle,
        onSuccess: () => {
          setPinRequest(null);
          action();
        },
      });
    },
    []
  );

  const handleRequestUnlock = useCallback(() => {
    requirePin(
      () => unlockFor60s(),
      'Unlock Shop Balances',
      'Balances stay visible for 60 seconds before auto-locking.'
    );
  }, [requirePin, unlockFor60s]);

  const todaySummary = useMemo(
    () => computeDailySummary(todayFloat, todayTransactions ?? [], todayDateKey),
    [todayFloat, todayTransactions, todayDateKey]
  );

  // Loading IndexedDB initial records
  if (
    settings === undefined &&
    todayFloat === undefined &&
    products === undefined
  ) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
          Opening DukaPulse...
        </p>
      </div>
    );
  }

  // First launch -> 3-Step Onboarding Wizard
  if (!settings || !settings.onboardingComplete) {
    return (
      <>
        <OfflineIndicator />
        <OnboardingWizard onComplete={() => {}} />
      </>
    );
  }

  // New calendar day -> Mandatory Starting Float Gate
  if (!todayFloat) {
    return (
      <>
        <OfflineIndicator />
        <DailyFloatGate
          todayDateKey={todayDateKey}
          shopName={settings.shopName}
          onFloatSaved={() => void ensureAtLeastOneCart()}
        />
      </>
    );
  }

  const navItems: { id: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'sell', label: 'Sell', icon: ShoppingCart },
    { id: 'deni', label: 'Deni', icon: BookOpen },
    { id: 'stock', label: 'Stock', icon: Package },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-24 lg:pb-8">
      <OfflineIndicator />

      {/* Top Bar (3-zone contract on desktop, compact mobile header) */}
      <header className="no-print sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('sell')}
            className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap shrink-0"
          >
            DukaPulse
          </button>

          <nav
            aria-label="Primary navigation"
            className="hidden lg:flex items-center gap-6"
          >
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`min-h-[44px] px-1 text-sm font-bold whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    active
                      ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline text-xs font-semibold text-slate-600 dark:text-slate-400 truncate max-w-[180px]">
              {settings.shopName}
            </span>
            <PWAInstallButton compact />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-4">
        {activeTab === 'sell' && (
          <SellView
            settings={settings}
            dailyFloat={todayFloat}
            summary={todaySummary}
            products={products ?? []}
            activeCarts={activeCarts ?? []}
            debtors={debtors ?? []}
            todayDateKey={todayDateKey}
            isUnlocked={isUnlocked}
            secondsLeft={secondsLeft}
            incomingMpesaSms={incomingMpesaSms}
            onClearIncomingMpesa={clearIncomingMpesa}
            onRequestUnlock={handleRequestUnlock}
            onLockNow={lockNow}
            onRequirePin={requirePin}
            onGoToStock={() => setActiveTab('stock')}
          />
        )}

        {activeTab === 'deni' && (
          <DeniView
            debtors={debtors ?? []}
            settings={settings}
            todayDateKey={todayDateKey}
          />
        )}

        {activeTab === 'stock' && (
          <StockView
            products={products ?? []}
            isUnlocked={isUnlocked}
            onRequestUnlock={handleRequestUnlock}
            onLockNow={lockNow}
            onRequirePin={requirePin}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            settings={settings}
            todaySummary={todaySummary}
            todayTransactions={todayTransactions ?? []}
            products={products ?? []}
            debtors={debtors ?? []}
            todayDateKey={todayDateKey}
            isUnlocked={isUnlocked}
            onRequestUnlock={handleRequestUnlock}
            onRequirePin={requirePin}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onRequirePin={requirePin}
            showForgotModal={showForgotPinModal}
            onSetShowForgotModal={setShowForgotPinModal}
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Thumb Zone) */}
      <nav
        aria-label="Mobile bottom navigation"
        className="no-print lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe"
      >
        <div className="grid grid-cols-5 h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${
                  active
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Global PIN Verification Modal */}
      <PinModal
        isOpen={!!pinRequest}
        title={pinRequest?.title ?? 'Owner PIN Required'}
        subtitle={pinRequest?.subtitle}
        expectedPinHash={settings.pinHash}
        onSuccess={() => pinRequest?.onSuccess()}
        onClose={() => setPinRequest(null)}
        onForgotPin={() => {
          setActiveTab('settings');
          setShowForgotPinModal(true);
        }}
      />
    </div>
  );
}
