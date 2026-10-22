import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="safe-area-pb safe-area-px border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between dark:text-gray-400">
        <div className="space-y-1">
          <p>ご利用にあたっては利用規約とプライバシーポリシーをご確認ください。</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">© AkiWeb Hakoniwa</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/terms" className="transition hover:text-gray-700 dark:hover:text-gray-200">
            利用規約
          </Link>
          <Link href="/privacy" className="transition hover:text-gray-700 dark:hover:text-gray-200">
            プライバシーポリシー
          </Link>
        </div>
      </div>
    </footer>
  );
}
