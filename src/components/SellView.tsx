import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { createNextCustomerCart, db, ensureAtLeastOneCart } from '../db/database';
import type {
  ActiveCart,
  DailyFloat,
  Debtor,
  Product,
  ShopSettings,
} from '../types/duka';
import { formatKES } from '../utils/dates';
import type { DailySummary } from '../utils/finance';
import { AgentModal } from './AgentModal';
import { CheckoutModal } from './CheckoutModal';
import { DailyLedgerStrip } from './DailyLedgerStrip';

interface SellViewProps {
  settings: ShopSettings;
  dailyFloat: DailyFloat;
  summary: DailySummary;
  products: Product[];
  activeCarts: ActiveCart[];
  debtors: Debtor[];
  todayDateKey: string;
  isUnlocked: boolean;
  secondsLeft: number;
  incomingMpesaSms: string;
  onClearIncomingMpesa: () => void;
  onRequestUnlock: () => void;
  onLockNow: () => void;
  onRequirePin: (action: () => void, title: string, subtitle: string) => void;
  onGoToStock: () => void;
}

export const SellView: React.FC<SellViewProps> = ({
  settings,
  dailyFloat,
  summary,
  products,
  activeCarts,
  debtors,
  todayDateKey,
  isUnlocked,
  secondsLeft,
  incomingMpesaSms,
  onClearIncomingMpesa,
  onRequestUnlock,
  onLockNow,
  onRequirePin,
  onGoToStock,
}) => {
  const [selectedCartId, setSelectedCartId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showCheckout, setShowCheckout] = useState(false);
  const [showMobileCartSheet, setShowMobileCartSheet] = useState(false);
  const [agentModalOp, setAgentModalOp] = useState<'deposit' | 'withdraw' | null>(null);
  const [feedback, setFeedback] = useState('');

  // FIFO ordering strictly by arrival createdAt
  const sortedCarts = useMemo(
    () => [...activeCarts].sort((a, b) => a.createdAt - b.createdAt),
    [activeCarts]
  );

  const activeCart = useMemo(() => {
    if (sortedCarts.length === 0) return null;
    return sortedCarts.find((c) => c.id === selectedCartId) || sortedCarts[0];
  }, [sortedCarts, selectedCartId]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const cartItemCount = useMemo(
    () => (activeCart ? activeCart.items.reduce((s, i) => s + i.qty, 0) : 0),
    [activeCart]
  );

  const cartTotal = useMemo(
    () =>
      activeCart
        ? Math.round(
            activeCart.items.reduce((s, i) => s + i.sellingPrice * i.qty, 0) * 100
          ) / 100
        : 0,
    [activeCart]
  );

  // Auto-open checkout when native Capacitor M-Pesa message arrives and a cart has items
  React.useEffect(() => {
    if (incomingMpesaSms && activeCart && activeCart.items.length > 0) {
      setShowCheckout(true);
    }
  }, [incomingMpesaSms, activeCart]);

  const addItemToCart = async (product: Product) => {
    if (!product.id) return;
    const targetCart = activeCart ?? (await ensureAtLeastOneCart());
    if (product.stockQty <= 0) {
      setFeedback(`${product.name} is out of stock. Restock first in Stock tab.`);
      return;
    }

    const existing = targetCart.items.find((i) => i.productId === product.id);
    const currentQty = existing ? existing.qty : 0;
    if (currentQty + 1 > product.stockQty) {
      setFeedback(`Only ${product.stockQty} units of ${product.name} left in stock.`);
      return;
    }

    const nextItems = existing
      ? targetCart.items.map((i) =>
          i.productId === product.id ? { ...i, qty: i.qty + 1 } : i
        )
      : [
          ...targetCart.items,
          {
            productId: product.id,
            name: product.name,
            buyingPrice: product.buyingPrice,
            sellingPrice: product.sellingPrice,
            qty: 1,
          },
        ];

    await db.active_carts.update(targetCart.id, { items: nextItems });
    setSelectedCartId(targetCart.id);
    setFeedback('');
  };

  const updateCartItemQty = async (productId: number, delta: number) => {
    if (!activeCart) return;
    const prod = products.find((p) => p.id === productId);
    const nextItems = activeCart.items
      .map((item) => {
        if (item.productId !== productId) return item;
        const nextQty = item.qty + delta;
        if (delta > 0 && prod && nextQty > prod.stockQty) {
          setFeedback(`Only ${prod.stockQty} units of ${prod.name} in stock.`);
          return item;
        }
        return { ...item, qty: nextQty };
      })
      .filter((item) => item.qty > 0);

    await db.active_carts.update(activeCart.id, { items: nextItems });
  };

  const handleAddNextCustomer = async () => {
    const newCart = await createNextCustomerCart();
    setSelectedCartId(newCart.id);
  };

  const handleCloseCart = async (cart: ActiveCart) => {
    if (sortedCarts.length <= 1) {
      await db.active_carts.update(cart.id, { items: [] });
      return;
    }
    await db.active_carts.delete(cart.id);
    if (activeCart?.id === cart.id) {
      const remaining = sortedCarts.filter((c) => c.id !== cart.id);
      setSelectedCartId(remaining[0]?.id || '');
    }
  };

  const renderCartBody = () => {
    if (!activeCart) return null;
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {sortedCarts[0]?.id === activeCart.id ? '#1 NEXT (FIFO)' : 'Queued Cart'}
            </p>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-50">
              {activeCart.label}
            </h3>
          </div>
          {activeCart.items.length > 0 && (
            <button
              type="button"
              onClick={() => void db.active_carts.update(activeCart.id, { items: [] })}
              className="min-h-[40px] px-2.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              Clear Basket
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto py-3 space-y-2.5 min-h-[160px] max-h-[44vh] lg:max-h-[420px]">
          {activeCart.items.length === 0 ? (
            <div className="py-10 text-center">
              <ShoppingBag className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-700" />
              <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                Tap products to add to {activeCart.label}&apos;s basket
              </p>
            </div>
          ) : (
            activeCart.items.map((item) => (
              <div
                key={item.productId}
                className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {item.name}
                  </p>
                  <p className="font-mono-tabular text-[11px] text-slate-600 dark:text-slate-400">
                    {formatKES(item.sellingPrice)} × {item.qty} ={' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {formatKES(item.sellingPrice * item.qty)}
                    </strong>
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={`Decrease quantity of ${item.name}`}
                    onClick={() => void updateCartItemQty(item.productId, -1)}
                    className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center font-mono-tabular text-xs font-bold text-slate-900 dark:text-slate-100">
                    {item.qty}
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase quantity of ${item.name}`}
                    onClick={() => void updateCartItemQty(item.productId, 1)}
                    className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-700 dark:text-slate-200"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-600 dark:text-slate-400">
              Basket Total
            </span>
            <span className="font-mono-tabular text-lg font-extrabold text-slate-900 dark:text-slate-50">
              {formatKES(cartTotal)}
            </span>
          </div>
          <button
            type="button"
            disabled={activeCart.items.length === 0}
            onClick={() => {
              setShowMobileCartSheet(false);
              setShowCheckout(true);
            }}
            className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-40 transition-colors"
          >
            Checkout ({formatKES(cartTotal)})
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <DailyLedgerStrip
        summary={summary}
        dailyFloat={dailyFloat}
        isUnlocked={isUnlocked}
        secondsLeft={secondsLeft}
        onRequestUnlock={onRequestUnlock}
        onLockNow={onLockNow}
        onRequirePin={onRequirePin}
      />

      {feedback && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 px-4 py-3 text-xs font-semibold text-emerald-900 dark:text-emerald-200"
        >
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback('')}
            aria-label="Dismiss notification"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* FIFO Multi-Customer Queue Bar + Optional Agent Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 flex-1 min-w-0">
          {sortedCarts.map((cart, index) => {
            const isFifoNext = index === 0;
            const isActive = activeCart?.id === cart.id;
            const count = cart.items.reduce((s, i) => s + i.qty, 0);
            return (
              <div
                key={cart.id}
                className={`inline-flex items-center rounded-xl border shrink-0 transition-colors ${
                  isActive
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCartId(cart.id)}
                  className="min-h-[44px] px-3 py-1.5 text-xs font-bold whitespace-nowrap flex items-center gap-1.5"
                >
                  <span>
                    {isFifoNext ? `${cart.label} · #1 NEXT (FIFO)` : cart.label}
                  </span>
                  {count > 0 && (
                    <span
                      className={`font-mono-tabular px-1.5 py-0.5 rounded-md text-[11px] ${
                        isActive
                          ? 'bg-emerald-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
                {sortedCarts.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove ${cart.label}`}
                    onClick={() => void handleCloseCart(cart)}
                    className={`min-h-[44px] pr-2.5 pl-1 flex items-center justify-center ${
                      isActive
                        ? 'text-emerald-100 hover:text-white'
                        : 'text-slate-400 hover:text-rose-600'
                    }`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => void handleAddNextCustomer()}
            className="min-h-[44px] shrink-0 inline-flex items-center gap-1 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-400 whitespace-nowrap"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>+ Next Customer</span>
          </button>
        </div>

        {settings.agentEnabled && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAgentModalOp('deposit')}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 whitespace-nowrap"
            >
              <ArrowDownLeft className="h-4 w-4" />
              <span>M-Pesa Deposit</span>
            </button>
            <button
              type="button"
              onClick={() => setAgentModalOp('withdraw')}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap"
            >
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              <span>M-Pesa Withdraw</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Split: Products Grid + Desktop Cart Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">
        {/* Left: Search & Tap Grid */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 space-y-3.5">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <label htmlFor="sell-product-search" className="sr-only">
              Search products to sell
            </label>
            <input
              id="sell-product-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items by name..."
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-50 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          {products.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <Package className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700" />
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  No products in stock yet
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Add your shop items in the Stock tab to start ringing up sales.
                </p>
              </div>
              <button
                type="button"
                onClick={onGoToStock}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-xs font-bold text-white"
              >
                <Plus className="h-4 w-4" />
                <span>Add First Products</span>
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No items match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredProducts.map((p) => {
                const isOut = p.stockQty <= 0;
                const isLow = !isOut && p.stockQty <= p.lowStockAlert;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={isOut}
                    onClick={() => void addItemToCart(p)}
                    className={`min-h-[88px] rounded-xl border p-3 text-left flex flex-col justify-between transition-colors active:scale-[0.99] ${
                      isOut
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 opacity-50 cursor-not-allowed'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-emerald-600'
                    }`}
                  >
                    <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-2">
                      {p.name}
                    </p>
                    <div className="mt-2 flex items-baseline justify-between gap-2">
                      <span className="font-mono-tabular text-sm font-extrabold text-emerald-700 dark:text-emerald-400">
                        {formatKES(p.sellingPrice)}
                      </span>
                      <span
                        className={`font-mono-tabular text-[11px] font-semibold ${
                          isOut
                            ? 'text-rose-600 dark:text-rose-400'
                            : isLow
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {isOut ? 'Out' : `${p.stockQty} left`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Desktop Cart */}
        <aside
          aria-label="Active customer basket"
          className="hidden lg:block rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sticky top-20"
        >
          {renderCartBody()}
        </aside>
      </div>

      {/* Mobile Bottom Floating Checkout Trigger (sits cleanly above bottom nav) */}
      {activeCart && cartItemCount > 0 && (
        <div className="lg:hidden fixed bottom-[72px] left-3 right-3 z-30">
          <div className="flex items-center gap-2 rounded-2xl bg-slate-900 dark:bg-emerald-600 p-2 text-white shadow-lg">
            <button
              type="button"
              onClick={() => setShowMobileCartSheet(true)}
              className="flex-1 min-h-[44px] px-3 text-left flex items-center justify-between"
            >
              <div>
                <p className="text-[11px] font-medium text-slate-300 dark:text-emerald-100">
                  {activeCart.label} · {cartItemCount} {cartItemCount === 1 ? 'item' : 'items'}
                </p>
                <p className="font-mono-tabular text-sm font-extrabold">
                  {formatKES(cartTotal)}
                </p>
              </div>
              <span className="text-xs font-bold underline">View Basket</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCheckout(true)}
              className="min-h-[44px] px-4 rounded-xl bg-emerald-500 dark:bg-white text-white dark:text-emerald-900 text-xs font-extrabold whitespace-nowrap"
            >
              Pay Now
            </button>
          </div>
        </div>
      )}

      {/* Mobile Cart Sheet */}
      {showMobileCartSheet && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-slate-900/80"
          role="dialog"
          aria-modal="true"
          aria-label="Customer basket sheet"
        >
          <div className="w-full rounded-t-3xl bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-5">
            <div className="flex justify-end mb-2">
              <button
                type="button"
                onClick={() => setShowMobileCartSheet(false)}
                aria-label="Close basket"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {renderCartBody()}
          </div>
        </div>
      )}

      <CheckoutModal
        isOpen={showCheckout}
        cart={activeCart}
        settings={settings}
        debtors={debtors}
        todayDateKey={todayDateKey}
        incomingMpesaSms={incomingMpesaSms}
        onClearIncomingMpesa={onClearIncomingMpesa}
        onSuccess={(msg) => {
          setShowCheckout(false);
          setFeedback(msg);
        }}
        onClose={() => setShowCheckout(false)}
      />

      {agentModalOp && (
        <AgentModal
          isOpen={true}
          initialOp={agentModalOp}
          agentMode={settings.agentMode}
          todayDateKey={todayDateKey}
          onSuccess={(msg) => {
            setAgentModalOp(null);
            setFeedback(msg);
          }}
          onClose={() => setAgentModalOp(null)}
        />
      )}
    </div>
  );
};
