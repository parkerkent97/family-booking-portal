"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
export default function LoginPage() {
  const [step, setStep] = useState('password');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [recover, setRecover] = useState(false);
  const [pin, setPin] = useState('');
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api('/api/session').then(s => { if (s.named) window.location.href = '/calendar'; else setStep('name'); }).catch(() => {}); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (step === 'password') { await api('/api/session', { password, admin }); setPassword(''); setStep('name'); }
      else { await api('/api/name', { firstName, lastName, recover, pin }); window.location.href = '/calendar'; }
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-white p-6"><div className="mx-auto max-w-lg py-12">
    <h1 className="text-3xl font-bold text-slate-900">Bay Ave &amp; Bear Ln</h1>
    <p className="mt-2 mb-6 text-slate-600">{step === 'password' ? 'Enter the family password to access our house calendars.' : 'Who’s booking? Enter your name so everyone knows whose stay it is.'}</p>
    <form onSubmit={submit} className="surface p-6 space-y-5">
      {step === 'password' ? <><label className="block font-semibold">{admin ? 'Admin password' : 'Family password'}<input className="mt-2 w-full rounded-lg border p-3" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={e => setPassword(e.target.value)} /></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={admin} onChange={e => setAdmin(e.target.checked)} />Sign in as admin</label></> : <><label className="block font-semibold">First name<input autoFocus className="mt-2 w-full rounded-lg border p-3" autoComplete="given-name" required maxLength={80} value={firstName} onChange={e => setFirstName(e.target.value)} /></label><label className="block font-semibold">Last name<input className="mt-2 w-full rounded-lg border p-3" autoComplete="family-name" required maxLength={80} value={lastName} onChange={e => setLastName(e.target.value)} /></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={recover} onChange={e=>setRecover(e.target.checked)} />Use my personal PIN to access my bookings</label>{recover && <label className="block">Personal PIN<input type="password" inputMode="numeric" autoComplete="current-password" required pattern="[0-9]{6,12}" maxLength={12} className="mt-2 w-full rounded-lg border p-3" value={pin} onChange={e=>setPin(e.target.value)} /></label>}</>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-[#679436] px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : step === 'password' ? 'Unlock calendars' : 'Continue to calendars'}</button>
    </form><p className="mt-4 text-sm text-slate-500">No email needed. After signing in, optionally set a personal PIN under My access to manage your bookings on another device.</p></div></main>;
}
