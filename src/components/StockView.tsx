import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Edit3,
  Eye,
  EyeOff,
  Package,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { db, logAudit } from '../db/database';
import type { Product } from '../types/duka';
import { formatKES } from '../utils/dates';
import { computeStockValuation } from '../utils/finance';

interface StockViewProps {
  products: Product[];
  isUnlocked: boolean;
  onRequestUnlock: () => void;
  onLockNow: () => void;
  onRequirePin: (action: () => void, title: string, subtitle: string) => void;
}

const MASKED = 'KES •••••';

export const StockView: React.FC<StockViewProps> = ({
  products,
  isUnlocked,
  onRequestUnlock,
  onLockNow,
  onRequirePin,
}) => {
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  // Add/Edit modal state
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isAddMode, setIsAddMode] = useState(false);
  const [name, setName] = useState('');
  const [buyingPrice, setBuyingPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [lowStockAlert, setLowStockAlert] = useState('5');
  const [formError, setFormError] = useState('');

  const valuation = useMemo(() => computeStockValuation(products), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => (lowOnly ? p.stockQty <= p.lowStockAlert : true))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search, lowOnly]);

  const openAddAfterPin = () => {
    onRequirePin(
      () => {
        setIsAddMode(true);
        setEditingProduct(null);
        setName('');
        setBuyingPrice('');
        setSellingPrice('');
        setStockQty('');
        setLowStockAlert('5');
        setFormError('');
      },
      'Add New Stock Item',
      'Owner PIN required to add products or set buying prices.'
    );
  };

  const openEditAfterPin = (product: Product) => {
    onRequirePin(
      () => {
        setIsAddMode(false);
        setEditingProduct(product);
        setName(product.name);
        setBuyingPrice(String(product.buyingPrice));
        setSellingPrice(String(product.sellingPrice));
        setStockQty(String(product.stockQty));
        setLowStockAlert(String(product.lowStockAlert));
        setFormError('');
      },
      `Edit "${product.name}"`,
      'Owner PIN required to modify stock or prices.'
    );
  };

  const handleDeleteAfterPin = (product: Product) => {
    if (!product.id) return;
    onRequirePin(
      async () => {
        await db.products.delete(product.id!);
        await logAudit(
          'stock_delete',
          `Deleted product "${product.name}"`,
          `Remaining Qty: ${product.stockQty} · Sell Price: ${formatKES(product.sellingPrice)}`
        );
      },
      `Delete "${product.name}"`,
      'Owner PIN required to remove an item from stock.'
    );
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const bp = Number(buyingPrice);
    const sp = Number(sellingPrice);
    const qty = Number(stockQty);
    const alert = Number(lowStockAlert || '5');

    if (!name.trim()) {
      setFormError('Enter product name.');
      return;
    }
    if (!Number.isFinite(bp) || bp < 0 || !Number.isFinite(sp) || sp <= 0) {
      setFormError('Enter valid Buying and Selling prices.');
      return;
    }
    if (!Number.isFinite(qty) || qty < 0) {
      setFormError('Enter valid Stock Qty.');
      return;
    }

    const now = Date.now();
    if (isAddMode) {
      await db.products.add({
        name: name.trim(),
        buyingPrice: bp,
        sellingPrice: sp,
        stockQty: qty,
        lowStockAlert: Number.isFinite(alert) && alert >= 0 ? alert : 5,
        updatedAt: now,
      });
      await logAudit(
        'stock_add',
        `Added stock item "${name.trim()}"`,
        `Qty: ${qty} · Buy: ${formatKES(bp)} · Sell: ${formatKES(sp)}`
      );
      setIsAddMode(false);
    } else if (editingProduct?.id) {
      await db.products.update(editingProduct.id, {
        name: name.trim(),
        buyingPrice: bp,
        sellingPrice: sp,
        stockQty: qty,
        lowStockAlert: Number.isFinite(alert) && alert >= 0 ? alert : 5,
        updatedAt: now,
      });
      await logAudit(
        'stock_edit',
        `Edited "${name.trim()}"`,
        `Qty: ${editingProduct.stockQty} -> ${qty} · Sell: ${formatKES(editingProduct.sellingPrice)} -> ${formatKES(sp)}`
      );
      setEditingProduct(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Asset Valuation Strip (PIN-Masked) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Stock Asset Valuation
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {valuation.totalSkuCount} products · {valuation.totalUnits} total units ·{' '}
              {valuation.lowStockCount} low stock
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={isUnlocked ? onLockNow : onRequestUnlock}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200"
            >
              {isUnlocked ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span>{isUnlocked ? 'Hide Cost' : 'Unlock Cost'}</span>
            </button>
            <button
              type="button"
              onClick={openAddAfterPin}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white"
            >
              <Plus className="h-4 w-4" />
              <span>Add Stock</span>
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Stock Asset Value (At Buying Price)
            </p>
            <p className="mt-1 font-mono-tabular text-lg font-extrabold text-slate-900 dark:text-slate-50">
              {isUnlocked ? formatKES(valuation.stockAssetValue) : MASKED}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 p-3">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Projected Shelf Profit
            </p>
            <p className="mt-1 font-mono-tabular text-lg font-extrabold text-emerald-700 dark:text-emerald-400">
              {isUnlocked ? formatKES(valuation.projectedShelfProfit) : MASKED}
            </p>
          </div>
        </div>
      </div>

      {/* Product List */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <label htmlFor="stock-search" className="sr-only">
              Search stock items
            </label>
            <input
              id="stock-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-4 py-2 text-sm text-slate-900 dark:text-slate-50"
            />
          </div>
          <button
            type="button"
            onClick={() => setLowOnly((v) => !v)}
            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold whitespace-nowrap ${
              lowOnly
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            <span>Low Stock ({valuation.lowStockCount})</span>
          </button>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Package className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-700" />
            <p className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              {products.length === 0 ? 'Stock is empty' : 'No matching items'}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Tap &ldquo;Add Stock&rdquo; above and verify your Owner PIN to add items.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((p) => {
              const isLow = p.stockQty <= p.lowStockAlert;
              return (
                <div
                  key={p.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {p.name}
                      </p>
                      {isLow && (
                        <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 shrink-0">
                          · Low Stock
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 font-mono-tabular text-xs text-slate-600 dark:text-slate-400">
                      Sell {formatKES(p.sellingPrice)} · Buy{' '}
                      {isUnlocked ? formatKES(p.buyingPrice) : '•••••'} · Qty{' '}
                      <strong className="text-slate-900 dark:text-slate-100">
                        {p.stockQty}
                      </strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditAfterPin(p)}
                      aria-label={`Edit ${p.name}`}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAfterPin(p)}
                      aria-label={`Delete ${p.name}`}
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {(isAddMode || editingProduct) && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/80 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stock-form-title"
        >
          <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3
                id="stock-form-title"
                className="text-base font-extrabold text-slate-900 dark:text-slate-50"
              >
                {isAddMode ? 'Add Stock Product' : `Edit ${editingProduct?.name}`}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddMode(false);
                  setEditingProduct(null);
                }}
                aria-label="Close product form"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="stock-name"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Product Name
                </label>
                <input
                  id="stock-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Brookside Milk 500ml"
                  className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="stock-buy"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Buying Price (KES)
                  </label>
                  <input
                    id="stock-buy"
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={buyingPrice}
                    onChange={(e) => setBuyingPrice(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm font-bold text-slate-900 dark:text-slate-50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="stock-sell"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Selling Price (KES)
                  </label>
                  <input
                    id="stock-sell"
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm font-bold text-slate-900 dark:text-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="stock-qty"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Stock Qty
                  </label>
                  <input
                    id="stock-qty"
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm font-bold text-slate-900 dark:text-slate-50"
                  />
                </div>
                <div>
                  <label
                    htmlFor="stock-alert"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Low Stock Alert Level
                  </label>
                  <input
                    id="stock-alert"
                    type="number"
                    min="0"
                    value={lowStockAlert}
                    onChange={(e) => setLowStockAlert(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 font-mono-tabular text-sm font-bold text-slate-900 dark:text-slate-50"
                  />
                </div>
              </div>

              {formError && (
                <p role="alert" className="text-xs font-semibold text-rose-600">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold"
              >
                {isAddMode ? 'Save Product to Stock' : 'Save Stock Changes'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
