/**
 * Supabase client singleton.
 *
 * Reads PUBLIC_SUPABASE_URL + PUBLIC_SUPABASE_ANON_KEY from the env. If
 * either is missing, getSupabase() returns null — the rest of the app
 * checks this and degrades to the local-only experience. So we can ship
 * this code before the env vars are wired up in Cloudflare, and the site
 * will keep working identically to today.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from './logger';

const URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

let instance: SupabaseClient | null = null;

export function isConfigured(): boolean {
  return Boolean(URL && ANON);
}

export function getSupabase(): SupabaseClient | null {
  if (!isConfigured()) {
    return null;
  }
  if (!instance) {
    logger.info('supabase', 'creating client', {
      url: URL,
      anonKeyPrefix: ANON!.slice(0, 12),
    });
    instance = createClient(URL!, ANON!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
  }
  return instance;
}
