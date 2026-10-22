'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { BillingCycle, CreateTrackedSubscriptionInput, SubscriptionCategory, UpdateTrackedSubscriptionInput } from '@/types';
import { ApiError } from '@/shared/api/http-client';
import { usePreferences } from '@/providers/PreferencesProvider';

type Input = CreateTrackedSubscriptionInput & UpdateTrackedSubscriptionInput;

interface Props {
  initialValues?: Partial<Input>;
  onSubmit: (input: Input) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

const categories: { value: SubscriptionCategory; label: string }[] = [
  { value: 'video', label: '動画' },
  { value: 'music', label: '音楽' },
  { value: 'productivity', label: '仕事効率化' },
  { value: 'learning', label: '学習' },
  { value: 'shopping', label: '買い物' },
  { value: 'lifestyle', label: '生活' },
  { value: 'utilities', label: 'インフラ' },
];

const MAX_AMOUNT_YEN = 1_000_000;
const MAX_NAME_LENGTH = 50;
const MAX_NOTE_LENGTH = 500;

function clampAmountInput(value: string): string {
  if (!value) {
    return '';
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }

  return String(Math.min(Math.max(Math.trunc(numeric), 0), MAX_AMOUNT_YEN));
}

export function SubscriptionForm({ initialValues, onSubmit, onCancel, submitLabel = 'サブスクを追加' }: Props) {
  const { taste } = usePreferences();
  const isEditing = initialValues !== undefined;
  const formRef = useRef<HTMLFormElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const billingCycleRef = useRef<HTMLSelectElement | null>(null);
  const categoryRef = useRef<HTMLSelectElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const [name, setName] = useState(initialValues?.name ?? '');
  const [amountYen, setAmountYen] = useState(String(initialValues?.amountYen ?? ''));
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(initialValues?.billingCycle ?? 'monthly');
  const [category, setCategory] = useState<SubscriptionCategory | ''>(initialValues?.category ?? '');
  const locked = initialValues?.locked ?? false;
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const servicePlaceholder = taste === 'ossan' ? 'Amazon Prime、Netflix、 とか' : 'Amazon Prime、Netflix、 など';
  const notePlaceholder = taste === 'ossan' ? '家族共有、見直し候補とか' : '家族共有、見直し候補など';
  const amountLimitError = taste === 'ossan' ? '金額は100万円以下で入力してや。' : '金額は100万円以下で入力してください。';
  const submitError =
    taste === 'ossan'
      ? '保存でけへんかった。すまんけどもういっぺん試してや。'
      : '保存できませんでした。時間を空けてもう一度お試しください。';
  const offlineSubmitError =
    taste === 'ossan'
      ? 'オフライン中は同期保存でけへんで。通信が戻ってからもういっぺん頼むわ。'
      : 'オフライン中は同期保存できません。通信が戻ってからもう一度お試しください。';

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const focusNextField = (current: 'name' | 'amount' | 'billingCycle' | 'category') => {
    const nextFieldMap = {
      name: amountInputRef,
      amount: noteRef,
      billingCycle: noteRef,
      category: noteRef,
    } satisfies Record<typeof current, React.RefObject<HTMLElement | null>>;

    nextFieldMap[current].current?.focus();
  };

  const handleFieldSubmit = (
    event: KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    current: 'name' | 'amount' | 'billingCycle' | 'category' | 'note',
  ) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    if (current === 'note') return;

    event.preventDefault();

    focusNextField(current);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(amountYen);
    if (!name.trim() || !Number.isFinite(amount) || amount <= 0) return;
    if (amount > MAX_AMOUNT_YEN) {
      setError(amountLimitError);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSubmit({
        name: name.trim(),
        amountYen: amount,
        billingCycle,
        category: category || undefined,
        clearCategory: isEditing && !category && initialValues?.category !== undefined,
        reviewPriority: initialValues?.reviewPriority ?? 'medium',
        locked,
        billingDay: initialValues?.billingDay,
        clearBillingDay: false,
        note: note.trim(),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === 'offline' ? offlineSubmitError : err.message);
      } else {
        setError(submitError);
      }
      setIsSubmitting(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="rounded-2xl border-2 border-brand-200 bg-white p-5 shadow-sm shadow-brand-100/40 dark:border-brand-800/50 dark:bg-gray-900 dark:shadow-none">
      {error && <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-300">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">サービス名</span>
          <input ref={nameInputRef} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(event) => handleFieldSubmit(event, 'name')} enterKeyHint="next" maxLength={MAX_NAME_LENGTH} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-brand-400 focus:outline-none sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" placeholder={servicePlaceholder} />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">金額</span>
          <input
            ref={amountInputRef}
            type="number"
            min={1}
            max={MAX_AMOUNT_YEN}
            inputMode="numeric"
            value={amountYen}
            onChange={(e) => setAmountYen(clampAmountInput(e.target.value))}
            onKeyDown={(event) => handleFieldSubmit(event, 'amount')}
            enterKeyHint="next"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-brand-400 focus:outline-none sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            placeholder="980"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">支払い頻度</span>
          <select ref={billingCycleRef} value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as BillingCycle)} onKeyDown={(event) => handleFieldSubmit(event, 'billingCycle')} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-brand-400 focus:outline-none sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
            <option value="monthly">月額</option>
            <option value="yearly">年額</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">カテゴリ</span>
          <select ref={categoryRef} value={category} onChange={(e) => setCategory(e.target.value as SubscriptionCategory | '')} onKeyDown={(event) => handleFieldSubmit(event, 'category')} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-brand-400 focus:outline-none sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
            <option value="">未選択</option>
            {categories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">メモ</span>
        <textarea ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(event) => handleFieldSubmit(event, 'note')} enterKeyHint="done" rows={3} maxLength={MAX_NOTE_LENGTH} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-brand-400 focus:outline-none sm:text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" placeholder={notePlaceholder} />
      </label>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">キャンセル</button>
        <button type="submit" disabled={isSubmitting} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">{isSubmitting ? '保存中...' : submitLabel}</button>
      </div>
    </form>
  );
}
