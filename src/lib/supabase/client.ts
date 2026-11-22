import { createBrowserClient } from '@supabase/ssr';
import { createDemoClient, isDemoPage } from '@/lib/demo/store';

const browserClient = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export function createClient(): ReturnType<typeof browserClient> {
  // Development previews (/preview/...) use sample data in the browser instead of Supabase.
  if (isDemoPage()) return createDemoClient() as unknown as ReturnType<typeof browserClient>;
  return browserClient();
}
