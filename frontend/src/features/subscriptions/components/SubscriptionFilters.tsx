'use client';

import { cn } from '@/lib/utils';
import type { SubscriptionListParams } from '@/features/subscriptions/api/subscription-client';

interface Props {
  filters: SubscriptionListParams;
  onChange: (filters: SubscriptionListParams) => void;
}

export function SubscriptionFilters({ filters, onChange }: Props) {
  const setPartial = (next: Partial<SubscriptionListParams>) => onChange({ ...filters, ...next });

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">検索・絞り込み</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <input
          type="text"
          placeholder="サービス名やメモで検索"
          defaultValue={filters.search || ''}
          onChange={(e) => setPartial({ search: e.target.value || undefined })}
          className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />

        <select value={filters.billingCycle || ''} onChange={(e) => setPartial({ billingCycle: e.target.value || undefined })} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
          <option value="">支払い頻度すべて</option>
          <option value="monthly">月額</option>
          <option value="yearly">年額</option>
        </select>

        <select value={filters.sort || 'position'} onChange={(e) => setPartial({ sort: e.target.value, order: e.target.value === 'amount_yen' ? 'desc' : 'asc' })} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
          <option value="position">登録順</option>
          <option value="amount_yen">金額順</option>
          <option value="name">名前順</option>
          <option value="created_at">新しい順</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { label: 'すべて', value: undefined },
          { label: 'ロック中', value: true },
          { label: '未ロック', value: false },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() => setPartial({ locked: item.value })}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition',
              filters.locked === item.value ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
