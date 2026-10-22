'use client';

import { useState } from 'react';
import type { TrackedSubscription, UpdateTrackedSubscriptionInput } from '@/types';
import { billingCycleLabels, categoryLabels, formatCurrency, cn } from '@/lib/utils';
import { SubscriptionForm } from '@/features/subscriptions/components/SubscriptionForm';
import { usePreferences } from '@/providers/PreferencesProvider';

interface Props {
  subscription: TrackedSubscription;
  onUpdate: (id: string, input: UpdateTrackedSubscriptionInput) => Promise<TrackedSubscription>;
  onDelete: (id: string) => Promise<void>;
  canReorder?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  onDragOver?: (id: string) => void;
  onDrop?: (id: string) => void;
  onTouchDragStart?: (id: string) => void;
  onTouchDragMove?: (id: string, touch: { clientX: number; clientY: number }) => void;
  onTouchDragEnd?: (id: string) => void;
  onTouchDragCancel?: () => void;
}

interface DeleteSubscriptionDialogProps {
  subscriptionName: string;
  message: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteSubscriptionDialog({
  subscriptionName,
  message,
  isDeleting,
  onCancel,
  onConfirm,
}: DeleteSubscriptionDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-subscription-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-1 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </span>
          <h2 id="delete-subscription-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
            削除の確認
          </h2>
        </div>
        <p className="mt-3 break-all text-sm text-gray-600 dark:text-gray-300">
          <span className="font-medium text-gray-900 dark:text-gray-100">「{subscriptionName}」</span>{message}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            キャンセル
          </button>
          <button
            onClick={() => void onConfirm()}
            disabled={isDeleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-600"
          >
            {isDeleting ? '削除中...' : '削除する'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SubscriptionCard({
  subscription,
  onUpdate,
  onDelete,
  canReorder = false,
  isDragging = false,
  isDropTarget = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  onTouchDragCancel,
}: Props) {
  const { taste } = usePreferences();
  const isSimpleTaste = taste === 'simple';
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingLock, setIsTogglingLock] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isNoteExpanded, setIsNoteExpanded] = useState(false);
  const hasLongNote = subscription.note.length > 120 || subscription.note.includes('\n');

  const handleDelete = async () => {
    setShowConfirm(false);
    setIsDeleting(true);

    try {
      await onDelete(subscription.id);
    } catch {
      setIsDeleting(false);
    }
  };

  const handleToggleLock = async () => {
    setIsTogglingLock(true);

    try {
      await onUpdate(subscription.id, { locked: !subscription.locked });
    } finally {
      setIsTogglingLock(false);
    }
  };

  const openEdit = () => {
    if (isDeleting || isTogglingLock || isDragging || !isSimpleTaste) return;
    setIsEditing(true);
  };

  if (isEditing) {
    return (
      <SubscriptionForm
        initialValues={subscription}
        submitLabel="変更を保存"
        onSubmit={async (input) => {
          await onUpdate(subscription.id, input);
          setIsEditing(false);
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <>
      <div
        data-subscription-card-id={subscription.id}
        className={cn(
          'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition dark:border-gray-700 dark:bg-gray-900',
          isDeleting && 'pointer-events-none opacity-50',
          isDragging && 'opacity-40',
          isDropTarget && 'border-brand-400 ring-2 ring-brand-200 dark:ring-brand-900/50',
          isSimpleTaste && !isDragging && 'cursor-pointer hover:border-brand-200 hover:bg-brand-50/40 dark:hover:border-brand-900/50 dark:hover:bg-brand-950/20',
        )}
        onClick={openEdit}
        onKeyDown={(event) => {
          if (!isSimpleTaste) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openEdit();
        }}
        role={isSimpleTaste ? 'button' : undefined}
        tabIndex={isSimpleTaste ? 0 : undefined}
        aria-label={isSimpleTaste ? `${subscription.name} を編集` : undefined}
        onDragOver={(event) => {
          if (!canReorder || !onDragOver) return;
          event.preventDefault();
          onDragOver(subscription.id);
        }}
        onDrop={(event) => {
          if (!canReorder || !onDrop) return;
          event.preventDefault();
          onDrop(subscription.id);
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-2">
            <button
              type="button"
              draggable={canReorder}
              onClick={(event) => event.stopPropagation()}
              onDragStart={(event) => {
                if (!canReorder || !onDragStart) return;
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', subscription.id);
                onDragStart(subscription.id);
              }}
              onDragEnd={() => onDragEnd?.()}
              onTouchStart={() => {
                if (!canReorder || !onTouchDragStart) return;
                onTouchDragStart(subscription.id);
              }}
              onTouchMove={(event) => {
                if (!canReorder || !onTouchDragMove) return;
                const touch = event.touches[0];
                if (!touch) return;
                onTouchDragMove(subscription.id, { clientX: touch.clientX, clientY: touch.clientY });
              }}
              onTouchEnd={() => {
                if (!canReorder || !onTouchDragEnd) return;
                onTouchDragEnd(subscription.id);
              }}
              onTouchCancel={() => onTouchDragCancel?.()}
              aria-label={canReorder ? 'ドラッグして並び替える' : '並び替えはできません'}
              title={canReorder ? 'ドラッグして並び替える' : '登録順のときだけ並び替えできます'}
              className={cn(
                '-ml-3 self-center rounded-lg p-2 text-gray-400 transition touch-none',
                canReorder
                  ? 'cursor-grab hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing active:scale-95 active:bg-brand-50 active:text-brand-700 active:ring-2 active:ring-brand-200 dark:hover:bg-gray-800 dark:hover:text-gray-200 dark:active:bg-brand-950/40 dark:active:text-brand-300 dark:active:ring-brand-900/70'
                  : 'cursor-not-allowed opacity-40',
                isDragging && canReorder && 'scale-95 bg-brand-50 text-brand-700 ring-2 ring-brand-200 dark:bg-brand-950/40 dark:text-brand-300 dark:ring-brand-900/70',
              )}
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path d="M7 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16 4a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm0 6a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Zm-1.5 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
              </svg>
            </button>
            <div className="min-w-0">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 break-all text-lg font-semibold text-gray-900 dark:text-gray-100">{subscription.name}</h3>
              {subscription.locked && !isSimpleTaste && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">ロック中</span>}
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{formatCurrency(subscription.amountYen)} / {billingCycleLabels[subscription.billingCycle]}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(event) => {
                event.stopPropagation();
                void handleToggleLock();
              }}
              disabled={isDeleting || isTogglingLock}
              aria-pressed={subscription.locked}
              aria-label={subscription.locked ? 'ロックを解除' : 'ロックする'}
              title={subscription.locked ? 'ロックを解除' : 'ロックする'}
              className={cn(
                'rounded-lg p-2 transition disabled:cursor-not-allowed disabled:opacity-50',
                subscription.locked
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50'
                  : 'text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
              )}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" aria-hidden="true">
                {subscription.locked ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 0h10.5A2.25 2.25 0 0 1 19.5 12.75v6A2.25 2.25 0 0 1 17.25 21h-10.5A2.25 2.25 0 0 1 4.5 18.75v-6A2.25 2.25 0 0 1 6.75 10.5Z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 10.5V6.75a3.75 3.75 0 1 1 7.5 0m-9 3.75h10.5A2.25 2.25 0 0 1 19.5 12.75v6A2.25 2.25 0 0 1 17.25 21h-10.5A2.25 2.25 0 0 1 4.5 18.75v-6A2.25 2.25 0 0 1 6.75 10.5Z" />
                )}
              </svg>
            </button>
            {!isSimpleTaste && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setIsEditing(true);
                }}
                disabled={isDeleting || isTogglingLock}
                className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                編集
              </button>
            )}
            {!subscription.locked && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  setShowConfirm(true);
                }}
                disabled={isDeleting || isTogglingLock}
                className="rounded-lg px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                削除
              </button>
            )}
          </div>
        </div>

        {subscription.category && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {categoryLabels[subscription.category]}
            </span>
          </div>
        )}

        {subscription.note && (
          <div className="mt-4">
            <p
              className="whitespace-pre-wrap break-all text-sm leading-6 text-gray-600 dark:text-gray-300"
              style={isNoteExpanded ? undefined : {
                display: '-webkit-box',
                WebkitBoxOrient: 'vertical',
                WebkitLineClamp: 1,
                overflow: 'hidden',
              }}
            >
              {subscription.note}
            </p>
            {hasLongNote && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsNoteExpanded((current) => !current);
                }}
                className="mt-2 text-sm font-medium text-brand-600 transition hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
              >
                {isNoteExpanded ? '閉じる' : '詳細を見る'}
              </button>
            )}
          </div>
        )}
      </div>

      {showConfirm && (
        <DeleteSubscriptionDialog
          subscriptionName={subscription.name}
          message={taste === 'simple' ? '削除します。この操作は取り消せません。' : 'を消すで。これ、取り消せへんからな。'}
          isDeleting={isDeleting}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleDelete}
        />
      )}
    </>
  );
}
