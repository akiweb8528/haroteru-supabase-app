'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  status: AuthStatus;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  user: null,
  status: 'loading',
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session: initial } }) => {
      setSession(initial);
      setStatus(initial ? 'authenticated' : 'unauthenticated');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setStatus(newSession ? 'authenticated' : 'unauthenticated');
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ session, user: session?.user ?? null, status }),
    [session, status],
  );

  return (
    <SessionContext.Provider value={value}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
