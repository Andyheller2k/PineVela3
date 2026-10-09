import React, { useState,useRef,useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { queryClient } from '../lib/queryClient';
import {pendingPaymentReference,clearPendingPayment} from '../lib/payments';
import {usesSupabasePersistence} from '../lib/persistence';
export default function PagePaymentReturn() {
  const [params] = useSearchParams();
  const { apiFetch, user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<any>(null);
  const [pendingData,setPending]=useState<{account?:string;rows:any[]}>({rows:[]}),[selected,setSelected]=useState<{account?:string;reference:string}|null>(null);
  const pending=pendingData.account===user?.id?pendingData.rows:[];
  const visibleResult=result?.forAccount===user?.id?result:null;
  const account=useRef(user?.id),generation=useRef(0),mounted=useRef(true);
  if(account.current!==user?.id){account.current=user?.id;generation.current++;}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setBusy(false);setError('');setResult(null);},[user?.id,params.get('reference')]);
  const reference = (selected?.account===user?.id?selected?.reference:'') || params.get('reference') || visibleResult?.reference || pendingPaymentReference(user?.id);
  const activeReference=useRef(reference);
  if(activeReference.current!==reference){activeReference.current=reference;generation.current++;}
  useEffect(()=>{setBusy(false);setError('');setResult(null);},[reference]);
  useEffect(()=>{
    setPending({rows:[]});setSelected(null);
    if(!usesSupabasePersistence || !user || !['merchant','manager'].includes(user.role))return;
    let live=true;const id=user.id,epoch=generation.current;
    void apiFetch('/api/payments/paystack/pending').then(rows=>{if(live && account.current===id && generation.current===epoch)setPending({account:id,rows:Array.isArray(rows)?rows:[]});}).catch(err=>{if(live && account.current===id && generation.current===epoch)setError(err.message || 'Could not load unfinished payments.');});
    return()=>{live=false;};
  },[user?.id]);
  async function verify() {
    const id=user?.id,epoch=generation.current;
    const current=()=>mounted.current && account.current===id && generation.current===epoch;
    setBusy(true); setError('');
    try {
      const payment = await apiFetch('/api/payments/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) });
      if(!current())return;
      if (!payment?.paid) throw new Error('Payment has not been confirmed.');
      setResult({...payment,forAccount:id});
      if(pendingPaymentReference(id)===reference)clearPendingPayment(id);
      if (payment.store && payment.accessGranted!==false) updateUser?.({ merchantSetupCompleted: payment.store.setupCompleted, merchantRegistrationFeePaid: payment.store.registrationFeePaid });
      await queryClient.invalidateQueries();
    } catch (err: any) { if(current())setError(err.message || 'Payment could not be verified.'); }
    finally { if(current())setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-slate-100 p-6"><section className="w-full max-w-lg space-y-5 rounded-3xl border border-blue-200 bg-white/80 p-8 text-slate-900 shadow-xl">
    <h1 className="text-2xl font-bold">Confirm your PineVela payment</h1>
    <p className="text-sm">Your account is activated only after PineVela verifies the transaction directly with Paystack.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!visibleResult && pending.length>0 && <label className="block text-sm">Unfinished payments<select aria-label="Unfinished payments" className="mt-2 w-full rounded-xl border border-blue-200 p-3" value={reference || ''} onChange={e=>{setSelected({account:user?.id,reference:e.target.value});setError('');}}><option value="">Choose a payment to verify</option>{reference && !pending.some(p=>p.reference===reference) && <option value={reference}>Returned payment</option>}{pending.map(p=><option key={p.reference} value={p.reference}>{p.purpose.replaceAll('_',' ')} — GHS {p.amount} — {new Date(p.createdAt).toLocaleDateString()}</option>)}</select></label>}
    {visibleResult ? <><p role="status">{visibleResult.reviewRequired?visibleResult.message:visibleResult.mode === 'test' ? 'Test payment confirmed. This grants development access only.' : 'Payment confirmed.'}</p>{visibleResult.accessGranted!==false && <Link className="block rounded-xl bg-blue-600 p-3 text-center text-white" to={visibleResult.purpose === 'housing' ? '/manager/dashboard' : '/digital-market'}>Continue to your dashboard</Link>}</> : user ? <><p className="text-sm">If you chose mobile money, approve the charge on your phone first. Keep your payment reference and verify before starting another checkout.</p><button disabled={busy || !reference} onClick={verify} className="w-full rounded-xl bg-blue-600 p-3 text-white disabled:opacity-50">{busy ? 'Verifying payment…' : 'Verify payment'}</button></> : <Link to="/login">Sign in to the account that started this payment</Link>}
    {!visibleResult && <Link className="block text-sm text-blue-700" to={user?.role === 'manager' ? '/manager/dashboard' : '/digital-market/onboard'}>Return without granting paid access</Link>}
  </section></main>;
}
