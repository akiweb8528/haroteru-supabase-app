import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerProfile } from '@/lib/auth';
import { Navbar } from '@/components/layout/Navbar';
import { SettingsView } from '@/features/account/components/SettingsView';

export const metadata: Metadata = { title: '設定' };

export default async function SettingsPage() {
  const profile = await getServerProfile();
  if (!profile) redirect('/auth/signin');

  return (
    <div className="min-h-app flex flex-col">
      <Navbar user={{ name: profile.name, email: profile.email, image: profile.image }} />
      <main className="flex-1">
        <SettingsView />
      </main>
    </div>
  );
}
