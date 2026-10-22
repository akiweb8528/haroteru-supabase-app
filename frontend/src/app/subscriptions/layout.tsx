import { getServerProfile } from '@/lib/auth';
import { Navbar } from '@/components/layout/Navbar';
import { SiteFooter } from '@/components/layout/SiteFooter';

export default async function SubscriptionsLayout({ children }: { children: React.ReactNode }) {
  const profile = await getServerProfile();
  if (!profile) return children;

  return (
    <div className="min-h-app flex flex-col">
      <Navbar user={{ name: profile.name, email: profile.email, image: profile.image }} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
