'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSession } from '@/providers/SessionProvider';
import useSWR, { mutate as globalMutate } from 'swr';
import { userApi } from '@/features/account/api/user-client';
import type { CopyTaste } from '@/lib/taste';

export type Theme = 'light' | 'dark';

interface PreferencesContextValue {
  theme: Theme;
  useGoogleAvatar: boolean;
  taste: CopyTaste;
  setTheme: (theme: Theme) => Promise<void>;
  setUseGoogleAvatar: (value: boolean) => Promise<void>;
  setTaste: (taste: CopyTaste) => Promise<void>;
  resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const ME_KEY = 'users/me';

function applyThemeToDom(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try { localStorage.setItem('theme', theme); } catch {}
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [theme, setThemeState] = useState<Theme>('light');
  const [useGoogleAvatar, setUseGoogleAvatarState] = useState(true);
  const [taste, setTasteState] = useState<CopyTaste>('ossan');
  const [localInitialized, setLocalInitialized] = useState(false);
  const pendingThemeRef = useRef<Theme | null>(null);

  // Fetch from API when authenticated (shares cache with useMe hook via same key)
  const { data: me } = useSWR(
    user ? ME_KEY : null,
    () => userApi.me(),
    { revalidateOnFocus: false },
  );

  // Step 1: read localStorage on mount (before API response)
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme') as Theme | null;
    const t: Theme = storedTheme === 'dark' ? 'dark' : 'light';
    setThemeState(t);
    applyThemeToDom(t);

    const storedAvatar = localStorage.getItem('useGoogleAvatar');
    if (storedAvatar !== null) {
      setUseGoogleAvatarState(storedAvatar !== 'false');
    }

    const storedTaste = localStorage.getItem('taste');
    setTasteState(storedTaste === 'simple' ? 'simple' : 'ossan');
    setLocalInitialized(true);
  }, []);

  // Step 2: once API data arrives, sync to local state + localStorage cache
  useEffect(() => {
    if (!me || !localInitialized) return;

    const serverTheme: Theme = me.theme === 'dark' ? 'dark' : 'light';
    if (pendingThemeRef.current && serverTheme !== pendingThemeRef.current) {
      return;
    }
    pendingThemeRef.current = null;
    setThemeState(serverTheme);
    applyThemeToDom(serverTheme);

    setUseGoogleAvatarState(me.useGoogleAvatar);
    try { localStorage.setItem('useGoogleAvatar', String(me.useGoogleAvatar)); } catch {}
    setTasteState(me.taste === 'simple' ? 'simple' : 'ossan');
    try { localStorage.setItem('taste', me.taste === 'simple' ? 'simple' : 'ossan'); } catch {}
  }, [me, localInitialized]);

  async function setTheme(t: Theme) {
    pendingThemeRef.current = t;
    setThemeState(t);
    applyThemeToDom(t);
    if (user) {
      await globalMutate(
        ME_KEY,
        (current: unknown) => (current ? { ...(current as Record<string, unknown>), theme: t } : current),
        false,
      );
      const updated = await userApi.updatePreferences({ theme: t });
      await globalMutate(ME_KEY, updated, false);
    }
  }

  async function setUseGoogleAvatar(value: boolean) {
    setUseGoogleAvatarState(value);
    try { localStorage.setItem('useGoogleAvatar', String(value)); } catch {}
    if (user) {
      const updated = await userApi.updatePreferences({ useGoogleAvatar: value });
      await globalMutate(ME_KEY, updated, false);
    }
  }

  async function setTaste(value: CopyTaste) {
    setTasteState(value);
    try { localStorage.setItem('taste', value); } catch {}
    if (user) {
      const updated = await userApi.updatePreferences({ taste: value });
      await globalMutate(ME_KEY, updated, false);
    }
  }

  // Used on sign-out: resets local state/DOM without calling API
  function resetPreferences() {
    pendingThemeRef.current = null;
    setThemeState('light');
    setUseGoogleAvatarState(true);
    setTasteState('ossan');
    document.documentElement.classList.remove('dark');
    try {
      localStorage.setItem('theme', 'light');
      localStorage.setItem('useGoogleAvatar', 'true');
      localStorage.setItem('taste', 'ossan');
    } catch {}
  }

  return (
    <PreferencesContext.Provider value={{ theme, useGoogleAvatar, taste, setTheme, setUseGoogleAvatar, setTaste, resetPreferences }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}
