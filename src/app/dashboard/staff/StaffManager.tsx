'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import type { Member } from '@/lib/types';
import { addStaff, removeStaff, resetStaffPassword, type ActionResult } from './actions';

export default function StaffManager({ members, currentUserId }: { members: Member[]; currentUserId: string }) {
  const [state, formAction, adding] = useActionState<ActionResult | null, FormData>(addStaff, null);
  const [msg, setMsg] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state) setMsg(state);
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const remove = (m: Member) => {
    if (!confirm(`Remove ${m.display_name || m.email}? They won't be able to log in any more.`)) return;
    startTransition(async () => setMsg(await removeStaff(m.user_id)));
  };
  const reset = (m: Member) => {
    const pw = prompt(`New password for ${m.display_name || m.email} (at least 8 characters)`);
    if (pw) startTransition(async () => setMsg(await resetStaffPassword(m.user_id, pw)));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Staff</h1>
        <p className="text-muted">Staff accounts can see and update orders and mark items sold out. They can’t change the menu, tables or settings.</p>
      </div>

      <div className="card divide-y divide-line">
        {members.map(m => (
          <div key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-soft font-bold">
              {(m.display_name || m.email || '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{m.display_name || (m.role === 'owner' ? 'Owner' : 'Staff')}{m.user_id === currentUserId && ' (you)'}</div>
              <div className="truncate text-sm text-muted">{m.email}</div>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${m.role === 'owner' ? 'bg-ink text-cream' : 'bg-soft'}`}>{m.role}</span>
            {m.role === 'staff' && (
              <>
                <button className="btn-secondary btn-sm" disabled={pending} onClick={() => reset(m)}>Reset password</button>
                <button className="btn-secondary btn-sm text-danger" disabled={pending} onClick={() => remove(m)}>Remove</button>
              </>
            )}
          </div>
        ))}
      </div>

      <form ref={formRef} action={formAction} className="card space-y-4 p-5">
        <h2 className="text-lg font-bold">Add a staff account</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="s-name">Name</label>
            <input id="s-name" name="name" className="input" required maxLength={60} placeholder="Juan" />
          </div>
          <div>
            <label className="label" htmlFor="s-email">Email</label>
            <input id="s-email" name="email" type="email" className="input" required autoComplete="off" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="s-pw">Temporary password</label>
          <input id="s-pw" name="password" type="text" className="input" required minLength={8} autoComplete="new-password" />
          <p className="mt-1 text-xs text-muted">Share it with them privately. They log in at the same login page as you.</p>
        </div>
        <button className="btn" disabled={adding}>{adding ? 'Adding…' : 'Add staff'}</button>
      </form>

      {msg && <p className={`text-sm ${msg.ok ? 'text-ok' : 'text-danger'}`}>{msg.message}</p>}
    </div>
  );
}
