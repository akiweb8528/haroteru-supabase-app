'use client';

import useSWR, { mutate } from 'swr';
import { useSession } from '@/providers/SessionProvider';
import { userApi } from '@/features/account/api/user-client';

const ME_KEY = 'users/me';

export function useMe() {
  const { user } = useSession();
  const { data, error, isLoading, mutate: revalidate } = useSWR(
    user ? ME_KEY : null,
    () => userApi.me(),
    { revalidateOnFocus: false },
  );

  const refresh = () => mutate(ME_KEY);

  return {
    me: data,
    summary: data?.summary,
    isLoading,
    error,
    refresh,
    revalidate,
  };
}
