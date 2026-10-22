import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/auth';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { sanitizeCallbackUrl } from '@/lib/utils';
import { SignInButton } from '@/components/auth/SignInButton';

export const metadata: Metadata = { title: 'サインイン' };

interface Props {
  searchParams: { callbackUrl?: string; error?: string };
}

const errorMessages: Record<string, string> = {
  OAuthSignin: 'Googleサインインがでけへんかった。もういっぺん試してや。',
  OAuthCallback: 'Googleサインインが途中で止まってもた。もういっぺん試してや。',
  OAuthAccountNotLinked: 'そのメアドはもう別のアカウントにくっついとるで。',
  SessionExpired: 'セッションが切れてもた。もういっぺんサインインしてや。',
  default: 'えらいこっちゃ、なんかこけた。もういっぺん試してや。',
};

export default async function SignInPage({ searchParams }: Props) {
  const user = await getServerUser();
  const callbackUrl = sanitizeCallbackUrl(searchParams.callbackUrl);
  if (user && !searchParams.error) redirect(callbackUrl);

  const errorMessage = searchParams.error
    ? (errorMessages[searchParams.error] ?? errorMessages.default)
    : null;

  return (
    <main className="min-h-app safe-area-pb safe-area-px flex items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-6 flex justify-center">
            <BrandLogo size={56} />
          </div>

          <h1 className="mb-1 text-center text-2xl font-bold text-gray-900 dark:text-white">
            同期を有効にする
          </h1>
          <p className="mb-6 text-center text-sm text-gray-500 dark:text-gray-400">
            サブスク払ろてるのデータをGoogleアカウントに保存するで
          </p>
          <div className="mb-6 text-center">
            <Link
              href="/"
              className="text-sm font-medium text-brand-600 transition hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              ホーム画面に戻る
            </Link>
          </div>

          {errorMessage && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
              {errorMessage}
            </div>
          )}

          <SignInButton callbackUrl={callbackUrl} />

          <p className="mt-6 text-center text-xs leading-6 text-gray-500 dark:text-gray-400">
            続行すると
            {' '}
            <Link href="/terms" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2 transition hover:text-gray-700 dark:hover:text-gray-200">
              利用規約
            </Link>
            {' '}
            と
            {' '}
            <Link href="/privacy" target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2 transition hover:text-gray-700 dark:hover:text-gray-200">
              プライバシーポリシー
            </Link>
            {' '}
            に同意したものとみなします。
          </p>
        </div>
      </div>
    </main>
  );
}
