import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import OnboardingForm from './OnboardingForm';

export const metadata = { title: 'Set up your cafe · QRave' };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data } = await supabase.from('cafe_members').select('cafe_id').eq('user_id', user.id).maybeSingle();
  if (data) redirect('/dashboard');

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="card w-full max-w-md p-6 sm:p-8">
        <OnboardingForm />
      </div>
    </main>
  );
}
