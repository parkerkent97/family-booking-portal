"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client';
import HouseManagement from './HouseManagement';
export default function AdminPage() {
  const [allowed, setAllowed] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/api/session').then(s => { if (s.admin && s.named) setAllowed(true); else window.location.href = '/calendar'; }).catch(() => { window.location.href = '/login'; }); }, []);
  return <main className="min-h-screen p-6"><div className="max-w-3xl mx-auto space-y-6"><h1 className="text-3xl font-bold">Admin settings</h1><Link href="/calendar" className="text-[#064789] underline">Back to calendar</Link>{allowed && <form className="surface p-6 space-y-4" onSubmit={async e => {
    e.preventDefault(); setMessage('');
    if (password !== confirm) { setMessage('Passwords do not match.'); return; }
    setBusy(true);
    try { await api('/api/password', { password }); setPassword(''); setConfirm(''); setMessage('Family password changed. Share it with your family; everyone else must sign in again.'); }
    catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }}><h2 className="text-xl font-semibold">Change family password</h2><p className="text-slate-600 text-sm">This signs everyone else out. Your admin password stays the same.</p><label className="block">New family password<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} className="w-full mt-2 rounded-lg border p-3" value={password} onChange={e => setPassword(e.target.value)} /></label><label className="block">Confirm password<input type="password" autoComplete="new-password" required className="w-full mt-2 rounded-lg border p-3" value={confirm} onChange={e => setConfirm(e.target.value)} /></label><button disabled={busy} className="bg-[#679436] text-white rounded-lg px-5 py-3">{busy ? 'Saving…' : 'Change password'}</button><p role="status">{message}</p></form>}{allowed && <HouseManagement />}</div></main>;
}
