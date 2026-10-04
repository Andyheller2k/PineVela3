import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { queryClient } from '../lib/queryClient';
export default function PagePaymentReturn() {
  const [params] = useSearchParams();
  const { apiFetch, user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<any>(null);
  const reference = params.get('reference') || sessionStorage.getItem('pinevela.pendingPayment');
  async function verify() {
    setBusy(true); setError('');
    try {
      const payment = await apiFetch('/api/payments/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) });
      if (!payment?.paid) throw new Error('Payment has not been confirmed.');
      setResult(payment); sessionStorage.removeItem('pinevela.pendingPayment');
      if (payment.store) updateUser?.({ merchantSetupCompleted: payment.store.setupCompleted, merchantRegistrationFeePaid: payment.store.registrationFeePaid });
      await queryClient.invalidateQueries();
    } catch (err: any) { setError(err.message || 'Payment could not be verified.'); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-6"><section className="w-full max-w-lg space-y-5 rounded-3xl border border-blue-200 bg-white/80 p-8 text-slate-900 shadow-xl">
    <h1 className="text-2xl font-bold">Confirm your PineVela payment</h1>
    <p className="text-sm">Your account is activated only after PineVela verifies the transaction directly with Paystack.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {result ? <><p role="status">{result.mode === 'test' ? 'Test payment confirmed. This grants development access only.' : 'Payment confirmed.'}</p><Link className="block rounded-xl bg-blue-600 p-3 text-center text-white" to={result.purpose === 'housing' ? '/manager/dashboard' : '/digital-market'}>Continue to your dashboard</Link></> : user ? <button disabled={busy || !reference} onClick={verify} className="w-full rounded-xl bg-blue-600 p-3 text-white disabled:opacity-50">{busy ? 'Verifying payment…' : 'Verify payment'}</button> : <Link to="/login">Sign in to the account that started this payment</Link>}
    {!result && <Link className="block text-sm text-blue-700" to={user?.role === 'manager' ? '/manager/dashboard' : '/digital-market/onboard'}>Return without granting paid access</Link>}
  </section></main>;
}
