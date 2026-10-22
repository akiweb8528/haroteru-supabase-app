'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/providers/SessionProvider';
import { cn, formatCurrency } from '@/lib/utils';
import type { SubscriptionListParams } from '@/features/subscriptions/api/subscription-client';
import { SubscriptionFilters } from '@/features/subscriptions/components/SubscriptionFilters';
import { SubscriptionForm } from '@/features/subscriptions/components/SubscriptionForm';
import { SubscriptionList } from '@/features/subscriptions/components/SubscriptionList';
import { useLocalSubscriptions } from '@/features/subscriptions/hooks/useLocalSubscriptions';
import {
  hasLocalSubscriptions,
  LOCAL_SUBSCRIPTIONS_UPDATED_EVENT,
  requestLocalSubscriptionsMigration,
} from '@/features/subscriptions/lib/local-storage';
import { useSubscriptions } from '@/features/subscriptions/hooks/useSubscriptions';
import { usePreferences } from '@/providers/PreferencesProvider';

interface Props {
  isGuest?: boolean;
}

function roundToHighestPlace(n: number): number {
  if (n === 0) return 0;
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)));
  return Math.round(n / magnitude) * magnitude;
}

function formatApprox(n: number): string {
  if (n === 0) return '約0円';
  return `約${roundToHighestPlace(n).toLocaleString('ja-JP')}円`;
}

export function SubscriptionDashboard({ isGuest = false }: Props) {
  const { status } = useSession();
  const [showForm, setShowForm] = useState(false);
  const [showApprox, setShowApprox] = useState(true);
  const [filters, setFilters] = useState<SubscriptionListParams>({ sort: 'position', order: 'asc' });
  const [hasPendingLocalMigration, setHasPendingLocalMigration] = useState(false);
  const { taste } = usePreferences();
  const formRef = useRef<HTMLDivElement | null>(null);

  const serverHook = useSubscriptions(isGuest ? null : filters);
  const localHook = useLocalSubscriptions(filters);
  const { subscriptions, meta, isLoading, error, create, update, remove, reorder, syncState, syncNow } = isGuest ? localHook : serverHook;
  const [recoveredFromOffline, setRecoveredFromOffline] = useState(false);
  const prevIsOnlineRef = useRef(syncState.isOnline);
  useEffect(() => {
    if (!prevIsOnlineRef.current && syncState.isOnline && syncState.pendingCount > 0) {
      setRecoveredFromOffline(true);
    }
    if (syncState.pendingCount === 0) {
      setRecoveredFromOffline(false);
    }
    prevIsOnlineRef.current = syncState.isOnline;
  }, [syncState.isOnline, syncState.pendingCount]);
  const summary = meta?.summary;
  const hasSubscriptions = subscriptions.length > 0;
  const isMigrationLoading = !isGuest && status === 'authenticated' && hasPendingLocalMigration && !hasSubscriptions && !error;
  const canReorder = (filters.sort ?? 'position') === 'position' && (filters.order ?? 'asc') === 'asc';
  const dashboardCopy = isGuest || taste === 'ossan'
    ? {
        eyebrow: isGuest ? '登録なしですぐ使えるで、サブスクのダッシュボード' : 'すぐ使えるサブスクのダッシュボードやで',
        title: '今なんぼ払ろてるか、すぐ分かるで。',
        description: '必要なサブスクも、なんとなく続いとるサブスクも、まとめて見える化やで。ロックして残すもんと、見直し候補を同じ一覧で管理できるんや。',
      }
    : {
        eyebrow: '',
        title: 'ダッシュボード',
        description: '',
      };
  const guestSyncCopy = taste === 'simple'
    ? '現在のデータはこの端末に保存されています。Googleで同期すると、別の端末でも同じ一覧を利用できます。'
    : '今のデータはこの端末だけに入っとるで。Googleで同期したら、別の端末でも同じ一覧が見られるんや。';
  const reorderHelpText = taste === 'simple'
    ? '並び替えは「登録順」のときだけ使えます。'
    : '並び替えは「登録順」のときだけ使えるで。';
  const migrationLoadingText = taste === 'simple'
    ? 'ローカルに保存されていたサブスクを同期しています。少々お待ちください。'
    : 'ローカルに保存しとったサブスクを同期しとるところやで。少し待ってな。';
  const migrationRetryText = taste === 'simple'
    ? 'まだ同期しきれていないサブスクがこの端末に残っています。もう一回同期を試してください。'
    : 'まだ同期しきれてへんサブスクがこの端末に残っとるで。すまんけど、もう一回同期を試してや。';
  const authenticatedOfflineCopy = taste === 'simple'
    ? `オフライン中です。この端末に ${syncState.pendingCount} 件の変更を保留しています。通信が戻ると自動で同期します。`
    : `いまはオフラインやで。この端末に ${syncState.pendingCount} 件ぶんの変更を預かっとる。通信が戻ったら自動で同期するわ。`;
  const authenticatedSyncingCopy = taste === 'simple'
    ? '保留していた変更を同期しています。'
    : '保留しとった変更を同期しとるで。';
  const authenticatedSyncErrorCopy = syncState.syncError ?? (taste === 'simple'
    ? '同期に失敗しました。通信が戻ってから再試行してください。'
    : '同期に失敗してもうた。通信が戻ってから再試行してや。');
  const detailToggleLabel = showApprox
    ? (taste === 'simple' ? '正確にする' : '細かくするで')
    : (taste === 'simple' ? '概算にする' : '雑にするで');

  const fmtAmount = (n: number) => showApprox ? formatApprox(n) : formatCurrency(n);

  useEffect(() => {
    if (!showForm) return;

    const formTop = formRef.current?.getBoundingClientRect().top;
    if (formTop == null) return;

    window.scrollTo({
      top: window.scrollY + formTop - 200,
      behavior: 'smooth',
    });
  }, [showForm]);

  useEffect(() => {
    if (isGuest) return;

    const syncPendingMigration = () => {
      setHasPendingLocalMigration(hasLocalSubscriptions());
    };

    syncPendingMigration();
    window.addEventListener(LOCAL_SUBSCRIPTIONS_UPDATED_EVENT, syncPendingMigration);
    return () => {
      window.removeEventListener(LOCAL_SUBSCRIPTIONS_UPDATED_EVENT, syncPendingMigration);
    };
  }, [isGuest]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-600">{dashboardCopy.eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{dashboardCopy.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">{dashboardCopy.description}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">サブスクを追加</button>
      </div>

      <div className="mb-6 grid gap-3 grid-cols-2">
        {[
          { label: '月', value: fmtAmount(summary?.monthlyEstimate ?? 0) },
          { label: '年', value: fmtAmount(summary?.yearlyEstimate ?? 0) },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {card.label}
              <button
                onClick={() => setShowApprox((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white ml-2 px-3 py-1 text-xs font-medium text-gray-500 transition hover:border-gray-300 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200"
              >
                {detailToggleLabel}
              </button>
            </p>
            <p className="mt-2 break-all text-[clamp(1.125rem,5vw,1.5rem)] font-semibold leading-tight text-gray-900 dark:text-white">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      {isGuest && (
        <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-200">
          <p>{guestSyncCopy}</p>
          <Link href="/auth/signin?callbackUrl=%2Fsubscriptions" className="mt-2 inline-block font-semibold underline underline-offset-2">
            Googleで同期を有効にする
          </Link>
        </div>
      )}

      {!isGuest && syncState.pendingCount > 0 && status === 'authenticated' && (!syncState.isOnline || recoveredFromOffline) && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
          <p>{syncState.isOnline ? authenticatedSyncingCopy : authenticatedOfflineCopy}</p>
        </div>
      )}

      {!isGuest && syncState.syncError && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-200">
          <p>{authenticatedSyncErrorCopy}</p>
          <button
            type="button"
            onClick={() => {
              void syncNow();
            }}
            className="mt-2 font-semibold underline underline-offset-2"
          >
            同期を再試行する
          </button>
        </div>
      )}

      {showForm && (
        <div
          ref={formRef}
          className={cn(
            'mb-4',
            !hasSubscriptions && 'pb-[45vh]',
          )}
        >
          <SubscriptionForm onSubmit={async (input) => { await create(input); setShowForm(false); }} onCancel={() => setShowForm(false)} />
        </div>
      )}

      <div className="mb-4"><SubscriptionFilters filters={filters} onChange={setFilters} /></div>

      {!canReorder && (
        <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">
          {reorderHelpText}
        </p>
      )}

      {isMigrationLoading && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
          {migrationLoadingText}
        </div>
      )}

      {!isMigrationLoading && !isGuest && status === 'authenticated' && hasPendingLocalMigration && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
          <p>{migrationRetryText}</p>
          <button
            type="button"
            onClick={() => requestLocalSubscriptionsMigration()}
            className="mt-2 font-semibold underline underline-offset-2"
          >
            同期を再試行する
          </button>
        </div>
      )}

      <SubscriptionList
        subscriptions={subscriptions}
        isLoading={isLoading || isMigrationLoading}
        error={error}
        onUpdate={update}
        onDelete={remove}
        onReorder={reorder}
        canReorder={canReorder}
      />

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full rounded-2xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          サブスクを追加
        </button>
      </div>
    </div>
  );
}
