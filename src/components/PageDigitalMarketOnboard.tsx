import { usePlatformSettings } from '../context/PlatformSettingsContext';
import { openPaymentCheckout } from '../lib/payments';
import OnboardingProgress, { STORE_SETUP_STEPS } from './OnboardingProgress';
import { sessionFetch as fetch } from '../lib/session';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Store, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  MapPin, 
  Building2, 
  CreditCard,
  Phone,
  User,
  X
} from 'lucide-react';
import PineLogo from './PineLogo';
import { useAuth } from '../context/AuthContext';
import { safeJson } from '../lib/api';
import { motion } from 'motion/react';

const DIGITAL_MARKET_CATEGORIES = [
  "Electronics, Gadgets & Accessories",
  "Laptops, Phones & Computing Gear",
  "Textbooks, Handouts & Study Materials",
  "Hostel Furniture & Room Appliances",
  "Student Fashion, Footwear & Thrift Boutique",
  "Beauty, Skincare, Haircare & Grooming",
  "Groceries, Packed Foods, Snacks & Drinks",
  "Beddings, Mattresses, Curtains & Room Decor",
  "Stationery, Printing, Binding & Graphic Design",
  "Campus Services, Peer Tutoring & Tech Repair",
  "Sports, Fitness, Gym Wear & Supplements",
  "Provisions, Cookware & Kitchen Utensils",
  "Handmade Crafts, Art & Campus Merchandise",
  "Musical Instruments & Audio Equipment",
  "General Campus Essentials"
];

export default function PageDigitalMarketOnboard() {
  const navigate = useNavigate();
  const { user, apiFetch, logout, setSessionUser } = useAuth();

  const { settings } = usePlatformSettings();
  const [selectedPlan, setSelectedPlan] = useState<'default' | 'star' | 'pro'>('default');
  // Role Protection Guard: Only merchant and student roles can access store onboarding
  useEffect(() => {
    if (user) {
      if (user.role === 'staff') {
        navigate('/staff/dashboard', { replace: true });
      } else if (user.role === 'manager') {
        navigate('/manager/dashboard', { replace: true });
      } else if (user.role === 'admin') {
        navigate('/admin/dashboard', { replace: true });
      }
    }
  }, [user?.role]);

  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Prefilled / fetched app details
  const [appData, setAppData] = useState<any>(null);
  const [storeData, setStoreData] = useState<any>(null);

  // Form fields (no online placeholder images)
  const [storeName, setStoreName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [location, setLocation] = useState<string>('');
  const [category, setCategory] = useState<string>(DIGITAL_MARKET_CATEGORIES[0]);
  const [deliveryMode, setDeliveryMode] = useState<string>('Campus Meetup');
  const [profilePicture, setProfilePicture] = useState<string>('');
  const [coverPicture, setCoverPicture] = useState<string>('');
  const registrationFee = settings?.registrationFee;
  const checkoutTotal = settings ? settings.registrationFee + settings.semesterFee + settings.subscriptionPrices[selectedPlan] : undefined;

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const targetEmail = user?.email || '';
        const targetId = user?.id || '';
        const res = await fetch(`/api/digital-market/status?email=${encodeURIComponent(targetEmail)}&userId=${encodeURIComponent(targetId)}`, { headers: { Authorization: `Bearer ${user?.token || ''}` } });
        if (res.ok) {
          const data = await safeJson(res);
          if (data) {
            setAppData(data.application);
            setStoreData(data.store);
            
            // If already completed setup and activated, go directly to registered store
            if (data.store && data.store.setupCompleted && data.store.registrationFeePaid) {
              navigate('/digital-market', { replace: true });
              return;
            }

            const ref = data.application || data.store;
            if (ref) {
              setStoreName(ref.storeName || `${ref.fullName || user?.name || 'Student'}'s Campus Store`);
              setUsername(ref.fullName ? ref.fullName.toLowerCase().replace(/[^a-z0-9]/g, '') : 'studentstore');
              setLocation(ref.university ? `${ref.university} Campus` : 'KNUST Campus');
              setCategory(ref.categoryToSell || ref.category || DIGITAL_MARKET_CATEGORIES[0]);
              setDescription(ref.description || `Official student digital market store by ${ref.fullName || user?.name || 'Student'}.`);
            }
          }
        }
      } catch (err) {
        console.error("Error loading digital market status for onboarding:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [user?.id, user?.email]);

  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await apiFetch('/api/digital-market/store-setup', {
        method: 'POST',
        body: JSON.stringify({
          studentEmail: appData?.studentEmail || storeData?.studentEmail || user?.email || '',
          storeName: storeName.trim(),
          username: username.trim(),
          location: location.trim(),
          category,
          deliveryMode: deliveryMode.trim(),
          profilePicture: profilePicture.trim(),
          coverPicture: coverPicture.trim(),
          description: description.trim(),

        })
      });

      if (res && res.success) {
        const payment = await apiFetch('/api/payments/paystack/initialize', { method: 'POST', body: JSON.stringify({ purpose: 'activation', plan: selectedPlan }) });
        if (openPaymentCheckout(payment)) return;
        if (!payment?.paid) throw new Error('Store activation requires verified payment.');
        setSessionUser?.({ ...user, merchantSetupCompleted: true, merchantRegistrationFeePaid: true });
        navigate('/digital-market', { replace: true });
      } else {
        setErrorMessage(res?.error || "Failed to complete store onboarding.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to complete store onboarding.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/50 text-slate-900 flex flex-col justify-center gap-8 p-4 sm:p-8"
    >
      {/* Top Bar */}
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between pb-6 border-b border-blue-100">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-900 text-white flex items-center justify-center shadow-md">
            <PineLogo className="w-6 h-6" hideText={true} />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900">PineVela Digital Market</h1>
            <p className="text-xs text-slate-500 font-semibold">Mandatory First-Time Store Activation & Onboarding</p>
          </div>
        </div>

        <button
          onClick={async () => {
            if (!await logout()) return;
            navigate('/login');
          }}
          className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Container */}
      <div className="onboarding-fields max-w-3xl mx-auto w-full my-0 bg-white/95 border border-blue-200/90 rounded-3xl p-6 sm:p-10 shadow-2xl backdrop-blur-md space-y-8 animate-fadeIn">
        <OnboardingProgress steps={STORE_SETUP_STEPS} step={phase} label="Store activation" />

        {errorMessage && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs font-semibold text-rose-800">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleCompleteSetup} className="space-y-6">
          {phase === 1 && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <h2 className="text-xl font-black text-slate-900">Step 1: Configure Store Identity</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Set up your official store name and unique merchant handle for campus buyers.
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">Store / Market Name *</label>
                <input
                  type="text"
                  required
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="e.g. Ellie Gody's Campus Store"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">Merchant Username / Handle *</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. elliegodystore"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">Store Description / About *</label>
                <textarea
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Official student digital market store..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (!storeName.trim() || !username.trim()) {
                      setErrorMessage("Please fill in store name and username.");
                      return;
                    }
                    setErrorMessage(null);
                    setPhase(2);
                  }}
                  className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-2 cursor-pointer transition-all"
                >
                  <span>Continue to Campus Location</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {phase === 2 && (
            <div className="space-y-5 animate-fadeIn">
              <div>
                <h2 className="text-xl font-black text-slate-900">Step 2: Campus Location & Delivery</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Specify where buyers can pick up items and your primary product category.
                </p>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">Campus Location / Residence *</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. KNUST Campus, Hall 6"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">Primary Category *</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {DIGITAL_MARKET_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">Delivery / Handover Mode *</label>
                <input
                  type="text"
                  required
                  value={deliveryMode}
                  onChange={(e) => setDeliveryMode(e.target.value)}
                  placeholder="e.g. Campus Meetup & Secure Escrow"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPhase(1)}
                  className="px-6 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!location.trim()) {
                      setErrorMessage("Please specify your campus location.");
                      return;
                    }
                    setErrorMessage(null);
                    setPhase(3);
                  }}
                  className="px-8 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center gap-2 cursor-pointer transition-all"
                >
                  <span>Continue to Secure Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {phase === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h2 className="text-xl font-black text-slate-900">Step 3: Review your market fees</h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Pay securely through Paystack. Registration is one-time, the selected plan renews monthly, and the semester fee renews every two months.
                </p>
              </div>

              <div className="bg-gradient-to-br from-blue-50 via-indigo-50/50 to-blue-100/50 border border-blue-200 rounded-2xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h4 className="text-sm font-black text-blue-950">Store Activation Fee</h4>
                    <p className="text-xs text-blue-900 font-medium mt-0.5">
                      Verified merchant status for {storeName || 'your store'}
                    </p>
                  </div>
                  <div className="px-5 py-2.5 bg-blue-600 text-white font-black text-base rounded-xl shadow-md text-center shrink-0">
                    {checkoutTotal ?? "…"} GHS total
                  </div>
                </div>

                <label className="block text-sm font-semibold">Monthly plan<select value={selectedPlan} onChange={event => setSelectedPlan(event.target.value as typeof selectedPlan)} className="mt-2 w-full rounded-xl border border-blue-200 p-3">{(['default', 'star', 'pro'] as const).map(plan => <option key={plan} value={plan}>Pine {plan} — GHS {settings?.subscriptionPrices[plan] ?? '…'} / month</option>)}</select></label>
                <dl className="space-y-2 text-sm"><div className="flex justify-between"><dt>Registration (one-time)</dt><dd>GHS {registrationFee ?? '…'}</dd></div><div className="flex justify-between"><dt>Semester fee (every two months)</dt><dd>GHS {settings?.semesterFee ?? '…'}</dd></div><div className="flex justify-between"><dt>Selected plan (monthly)</dt><dd>GHS {settings?.subscriptionPrices[selectedPlan] ?? '…'}</dd></div></dl>
                <p className="text-xs text-slate-600">Paystack collects your payment details on its secure checkout. Closing checkout does not activate your store.</p>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPhase(2)}
                  className="px-6 py-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="submit"
                  disabled={submitting || !settings}
                  className="px-8 py-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 hover:from-blue-800 hover:to-indigo-800 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>Opening secure checkout…</span>
                    </>
                  ) : (
                    <>
                      <span>Continue to Paystack</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </motion.div>
  );
}
