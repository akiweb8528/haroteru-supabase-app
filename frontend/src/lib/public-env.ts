type PublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
  NEXT_PUBLIC_SITE_URL: string;
  NEXT_PUBLIC_GA_MEASUREMENT_ID: string;
  NEXT_PUBLIC_APP_ENV: string;
};

declare global {
  interface Window {
    __HAROTERU_PUBLIC_ENV__?: Partial<PublicEnv>;
  }
}

function readRuntimeEnv(): Partial<PublicEnv> {
  if (typeof window === 'undefined') {
    return {};
  }

  return window.__HAROTERU_PUBLIC_ENV__ ?? {};
}

export function getPublicEnvValue(key: keyof PublicEnv): string {
  const runtimeValue = readRuntimeEnv()[key];
  if (typeof runtimeValue === 'string' && runtimeValue.length > 0) {
    return runtimeValue;
  }

  const buildTimeValue = process.env[key];
  if (typeof buildTimeValue === 'string') {
    return buildTimeValue;
  }

  return '';
}
