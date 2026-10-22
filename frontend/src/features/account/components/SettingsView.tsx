'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/providers/SessionProvider';
import { cn } from '@/lib/utils';
import { tasteLabels } from '@/lib/taste';
import { userApi } from '@/features/account/api/user-client';
import { usePreferences } from '@/providers/PreferencesProvider';

export function SettingsView() {
  const { user } = useSession();
  const router = useRouter();
  const { theme, useGoogleAvatar, taste, setTheme, setUseGoogleAvatar, setTaste, resetPreferences } = usePreferences();

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const userEmail = user?.email ?? null;
  const userName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null;
  const userImage = user?.user_metadata?.avatar_url ?? user?.user_metadata?.picture ?? null;
  const initials = (userName as string)?.[0]?.toUpperCase() ?? '?';
  const copy = taste === 'ossan'
    ? {
        pageDescription: '同期設定とアプリの見た目を管理するで。',
        syncDescription: 'Googleアカウントでログインしたら、登録したサブスクを端末またいで持ち歩けるんや。',
        iconDescription: 'ナビゲーションバーに出るアイコンを選んでや。',
        googleAvatarDescription: 'Googleのプロフィール写真を使うで',
        anonymousAvatarDescription: 'シンプルなシルエットを使うで',
        themeDescription: 'アプリの見た目を選んでや。',
        lightThemeDescription: '明るい感じ',
        darkThemeDescription: '暗い感じ',
        tasteDescription: 'サブスク画面や説明文の雰囲気を選べるで。',
        deleteDescription: 'アカウントを消したら、同期済みのサブスク情報と設定が全部なくなるで。ほんまに消えるからな。',
        deleteConfirmDescription: '念のため、メールアドレス',
        deleteError: 'アカウントを消せへんかった。ちょい待ってからもういっぺん試してや。',
      }
    : {
        pageDescription: '同期設定と表示設定を管理します。',
        syncDescription: 'Googleアカウントでログインすると、登録したサブスクを複数端末で同期できます。',
        iconDescription: 'ナビゲーションバーに表示するアイコンを選択できます。',
        googleAvatarDescription: 'Googleのプロフィール写真を使用します',
        anonymousAvatarDescription: '匿名アイコンを使用します',
        themeDescription: 'アプリの表示テーマを選択できます。',
        lightThemeDescription: '明るい表示',
        darkThemeDescription: '暗い表示',
        tasteDescription: 'サブスク画面の説明文のテイストを選択できます。',
        deleteDescription: 'アカウントを削除すると、同期済みのサブスク情報と設定がすべて削除されます。',
        deleteConfirmDescription: '確認のため、メールアドレス',
        deleteError: 'アカウントの削除に失敗しました。時間を空けてもう一度お試しください。',
      };

  async function handleDeleteAccount() {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await userApi.deleteAccount();
      resetPreferences();
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/');
      router.refresh();
    } catch {
      setDeleteError(copy.deleteError);
      setIsDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">設定</h1>
      <p className="mb-8 text-gray-500 dark:text-gray-400">{copy.pageDescription}</p>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">同期アカウント</h2>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{copy.syncDescription}</p>

        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {userImage ? (
              <Image src={userImage as string} alt={(userName as string) ?? 'User'} width={48} height={48} className="rounded-full" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-600">
                {initials}
              </div>
            )}
            <div>
              <p className="font-medium text-gray-900 dark:text-gray-100">{userName as string}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{userEmail}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">説明テイスト</h2>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{copy.tasteDescription}</p>

        <div className="flex gap-4">
          {(['ossan', 'simple'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTaste(value)}
              className={cn(
                'flex flex-1 flex-col items-start gap-3 rounded-xl border-2 p-4 text-left transition',
                taste === value
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
              )}
            >
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{tasteLabels[value]}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {value === 'ossan'
                    ? '説明多めの関西のおっさん口調で案内するで'
                    : '必要最低限の説明だけを一般的な口調で表示する'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">アイコン</h2>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{copy.iconDescription}</p>

        <div className="flex gap-4">
          <button
            onClick={() => setUseGoogleAvatar(true)}
            className={cn(
              'flex flex-1 flex-col items-center gap-3 rounded-xl border-2 p-4 transition',
              useGoogleAvatar
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
            )}
          >
            {userImage ? (
              <Image src={userImage as string} alt={(userName as string) ?? 'User'} width={48} height={48} className="rounded-full" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-semibold text-brand-600">{initials}</div>
            )}
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Googleアイコン</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{copy.googleAvatarDescription}</p>
            </div>
          </button>

          <button
            onClick={() => setUseGoogleAvatar(false)}
            className={cn(
              'flex flex-1 flex-col items-center gap-3 rounded-xl border-2 p-4 transition',
              !useGoogleAvatar
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-600">
              <svg className="h-7 w-7 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">匿名アイコン</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{copy.anonymousAvatarDescription}</p>
            </div>
          </button>
        </div>
      </section>

      <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-gray-100">テーマ</h2>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{copy.themeDescription}</p>

        <div className="flex gap-4">
          {(['light', 'dark'] as const).map((value) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-1 flex-col items-center gap-3 rounded-xl border-2 p-4 transition',
                theme === value
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600',
              )}
            >
              <div className={cn('flex h-12 w-12 items-center justify-center rounded-full text-gray-100', value === 'light' ? 'bg-yellow-100' : 'bg-gray-800')}>
                {value === 'light' ? '☀' : '☾'}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{value === 'light' ? 'ライト' : 'ダーク'}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{value === 'light' ? copy.lightThemeDescription : copy.darkThemeDescription}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm dark:border-red-900/50 dark:bg-gray-900">
        <h2 className="mb-1 text-lg font-semibold text-red-600 dark:text-red-400">アカウント削除</h2>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">{copy.deleteDescription}</p>

        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            アカウントを削除する
          </button>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-900/30 dark:bg-red-900/10">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">{copy.deleteConfirmDescription} <span className="font-bold">{userEmail}</span> を入力してください。</p>
            </div>

            <input
              type="email"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder={userEmail ?? ''}
              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
            />

            {deleteError && <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteConfirm(false);
                  setDeleteInput('');
                  setDeleteError(null);
                }}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                キャンセル
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteInput !== userEmail || isDeleting}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeleting ? '削除中...' : '完全に削除する'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
