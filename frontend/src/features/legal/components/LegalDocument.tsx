import Link from 'next/link';

interface Section {
  title: string;
  body: string;
}

interface Props {
  title: string;
  updatedAt: string;
  summary: string;
  sections: Section[];
}

export function LegalDocument({ title, updatedAt, summary, sections }: Props) {
  return (
    <main className="min-h-app safe-area-pb safe-area-px bg-gray-50 px-4 py-16 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm sm:p-10 dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-8">
            <Link
              href="/"
              className="text-sm font-medium text-brand-600 transition hover:text-brand-800 dark:text-brand-400 dark:hover:text-brand-300"
            >
              ← ホームへ戻る
            </Link>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl dark:text-white">
              {title}
            </h1>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">最終更新日：{updatedAt}</p>
            <p className="mt-6 text-base leading-7 text-gray-600 dark:text-gray-300">{summary}</p>
          </div>

          <div className="space-y-8">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{section.title}</h2>
                <p className="mt-3 whitespace-pre-line leading-7 text-gray-600 dark:text-gray-300">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
