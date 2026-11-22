'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
      });
      if (error) setError(error.message);
      else if (data.session) router.push('/onboarding');
      else setCheckEmail(true);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else {
        router.push('/dashboard');
        router.refresh();
        return;
      }
    }
    setBusy(false);
  }

  if (checkEmail) {
    return (
      <div className="text-center">
        <div className="text-5xl">📬</div>
        <h1 className="mt-4 text-2xl font-bold">Check your email</h1>
        <p className="mt-2 text-muted">We sent a confirmation link to <strong>{email}</strong>. Open it to finish setting up your cafe.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="text-center">
        <Link href="/" className="text-xl font-bold">☕ QRave</Link>
        <h1 className="mt-6 text-2xl font-bold">{mode === 'signup' ? 'Create your cafe account' : 'Welcome back'}</h1>
        <p className="mt-1 text-muted">{mode === 'signup' ? 'Set up your menu and QR codes in minutes.' : 'Log in to your cafe dashboard.'}</p>
      </div>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" className="input" type="password" required minLength={8}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />
        {mode === 'signup' && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button className="btn w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
      <p className="text-center text-sm text-muted">
        {mode === 'signup' ? <>Already have an account? <Link className="font-semibold text-brand" href="/login">Log in</Link></>
          : <>New here? <Link className="font-semibold text-brand" href="/signup">Create your cafe</Link></>}
      </p>
    </form>
  );
}
