'use client';

import { useCallback, useState } from 'react';
import type { TrackedSubscription, UpdateTrackedSubscriptionInput } from '@/types';
import { SubscriptionCard } from '@/features/subscriptions/components/SubscriptionCard';
import { usePreferences } from '@/providers/PreferencesProvider';
import { ApiError } from '@/shared/api/http-client';

interface Props {
  subscriptions: TrackedSubscription[];
  isLoading: boolean;
  error: Error | null | undefined;
  onUpdate: (id: string, input: UpdateTrackedSubscriptionInput) => Promise<TrackedSubscription>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (draggedId: string, targetId: string) => Promise<void>;
  canReorder: boolean;
}

interface TouchPoint {
  clientX: number;
  clientY: number;
}

export function SubscriptionList({ subscriptions, isLoading, error, onUpdate, onDelete, onReorder, canReorder }: Props) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const { taste } = usePreferences();
  const resetDragState = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
  }, []);

  const handleTouchMove = useCallback((touch: TouchPoint, sourceId: string) => {
    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    const targetCard = targetElement?.closest<HTMLElement>('[data-subscription-card-id]');
    const targetId = targetCard?.dataset.subscriptionCardId ?? null;

    if (!targetId || targetId === sourceId) {
      setDropTargetId(null);
      return;
    }

    setDropTargetId(targetId);
  }, []);

  const handleTouchDrop = useCallback(async (sourceId: string) => {
    if (!dropTargetId || dropTargetId === sourceId) {
      resetDragState();
      return;
    }

    try {
      await onReorder(sourceId, dropTargetId);
    } finally {
      resetDragState();
    }
  }, [dropTargetId, onReorder, resetDragState]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />)}
      </div>
    );
  }

  if (error) {
    const isOfflineError = error instanceof ApiError && error.code === 'offline';
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-8 text-center text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300">
        {isOfflineError
          ? (taste === 'simple' ? 'オフラインのため一覧を更新できません。通信が戻ると再読み込みできます。' : 'オフラインやから一覧を更新でけへん。通信が戻ったらまた読み込めるで。')
          : (taste === 'simple' ? '一覧を読み込めませんでした。' : '一覧を読み込めへんかった。')}
      </div>
    );
  }

  if (subscriptions.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 px-6 py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        {taste === 'simple'
          ? 'まだサブスクがありません。まずは1件登録して、今の支出を見える化しましょう。'
          : 'まだサブスクがあらへん。まず1件登録して、今の支出を見える化しようや。'}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {subscriptions.map((item) => (
        <SubscriptionCard
          key={item.id}
          subscription={item}
          onUpdate={onUpdate}
          onDelete={onDelete}
          canReorder={canReorder}
          isDragging={draggedId === item.id}
          isDropTarget={dropTargetId === item.id}
          onDragStart={setDraggedId}
          onDragEnd={resetDragState}
          onDragOver={(targetId) => {
            if (!draggedId || draggedId === targetId) return;
            setDropTargetId(targetId);
          }}
          onDrop={async (targetId) => {
            if (!draggedId || draggedId === targetId) {
              resetDragState();
              return;
            }
            try {
              await onReorder(draggedId, targetId);
            } finally {
              resetDragState();
            }
          }}
          onTouchDragStart={(id) => {
            setDraggedId(id);
            setDropTargetId(null);
          }}
          onTouchDragMove={(id, touch) => handleTouchMove(touch, id)}
          onTouchDragEnd={(id) => {
            void handleTouchDrop(id);
          }}
          onTouchDragCancel={resetDragState}
        />
      ))}
    </div>
  );
}
