import StoreLocationInput from './StoreLocationInput';
import { validateStoreStep, type StoreFieldErrors } from '../../storeSetupValidation';
import React,{ useEffect,useRef,useState } from 'react';
import { internationalPhone,phoneDraft,type CountryCode } from '../../internationalPhone';
import { MARKET_DEFAULT_COVERS,MARKET_DEFAULT_LOGO } from '../../marketBranding';
import { STORE_DELIVERY_METHODS,storeDeliveryMode } from '../../storeDelivery';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import { openPaymentCheckout } from '../lib/payments';
import { sessionFetch as fetch } from '../lib/session';
import InternationalPhoneInput from './InternationalPhoneInput';
import OnboardingProgress,{ STORE_SETUP_STEPS } from './OnboardingProgress';
import StoreBrandingEditor from './StoreBrandingEditor';

import {
ArrowLeft,
ArrowRight,
Clock,
X
} from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { safeJson } from '../lib/api';
import PineLogo, { PineWordmark } from './PineLogo';

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
  const currentAccount = useRef(user?.id),accountGeneration=useRef(0),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  if(currentAccount.current!==user?.id){currentAccount.current=user?.id;accountGeneration.current++;}
  const [loadedAccount, setLoadedAccount] = useState<string | undefined>();

  const { settings } = usePlatformSettings();
  const activationRequest=useRef<{account:string;id:string}|null>(null);
  const [selectedPlan, setSelectedPlan] = useState<'default' | 'star' | 'pro'>('default');
  // Role Protection Guard: Only merchant and student roles can access store onboarding
  useEffect(() => {
    if (user) {
      if ((!['merchant','staff','manager','admin'].includes(user.role))) {
        navigate(user.role === 'student' ? '/resident/dashboard' : '/user/dashboard', { replace: true });
        return;
      }
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
  const [fieldErrors,setFieldErrors]=useState<StoreFieldErrors>({});
  const formRef=useRef<HTMLFormElement>(null);
  const fieldMessage=(field:keyof StoreFieldErrors)=>fieldErrors[field]?<p id={`store-${field}-error`} role="alert" className="mt-1 text-xs text-rose-700 dark:text-rose-200">{fieldErrors[field]}</p>:null;
  const clearField=(field:keyof StoreFieldErrors)=>setFieldErrors(previous=>({...previous,[field]:undefined}));

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
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>('GH');
  const [mediaUploads, setMediaUploads] = useState(0);
  const onMediaBusy = (busy: boolean) => setMediaUploads(count => Math.max(0, count + (busy ? 1 : -1)));
  const [profilePicture, setProfilePicture] = useState<string>(MARKET_DEFAULT_LOGO);
  const [customBranding, setCustomBranding] = useState(false);
  const [coverPicture, setCoverPicture] = useState<string>(MARKET_DEFAULT_COVERS[0].url);
  const registrationFee = settings?.registrationFee;
  const checkoutTotal = settings ? (settings.registrationFee) : undefined;

  useEffect(() => {
    const controller = new AbortController(); let live = true;
    setLoading(true);setAppData(null);setStoreData(null);setErrorMessage(null);setFieldErrors({});setPhase(1);setSubmitting(false);
    const fetchStatus = async () => {
      try {
        if ((user?.role !== 'merchant')) return;
        const targetEmail = user?.email || '';
        const targetId = user?.id || '';
        const res = await fetch(('/api/digital-market/status'), { signal:controller.signal, headers: { Authorization: `Bearer ${user?.token || ''}` } });
        if (!res.ok) throw new Error('Could not load your verified store registration. Please reload to retry.');
        if (res.ok) {
          const data = await safeJson(res);
          if (!live || currentAccount.current !== targetId) return;
          if ((!data?.store)) throw new Error('Your approved store is unavailable. Return to your primary account to check registration status.');
          if (data) {
            setAppData(data.application);
            setStoreData(data.store);
            
            // If already completed setup and activated, go directly to registered store
            if (data.store && data.store.setupCompleted && data.store.registrationFeePaid) {
              navigate('/digital-market', { replace: true });
              return;
            }

            const ref = { ...data.application, ...data.store };
            setDeliveryMode(storeDeliveryMode(ref) || 'Campus Meetup');
            const contact = phoneDraft(ref.phone, ref.phoneCountry); setPhone(contact.contactPhone); setPhoneCountry(contact.contactPhoneCountry);
            setProfilePicture(ref.profilePicture || ref.logoUrl || MARKET_DEFAULT_LOGO); setCoverPicture(ref.coverPicture || ref.bannerUrl || MARKET_DEFAULT_COVERS[0].url); setCustomBranding(ref.customBranding === true);
            if (ref) {
              setStoreName((ref.storeName || ''));
              setUsername((ref.username || ''));
              setLocation((ref.location || ''));
              setCategory(ref.category || ref.categoryToSell || (('')));
              setDescription((ref.description || ''));
              setSelectedPlan(['star','pro'].includes(ref.subscriptionPlan) ? ref.subscriptionPlan : 'default');
            }
          }
        }
      } catch (err) {
        if (live) setErrorMessage(err instanceof Error ? err.message : 'Could not load store registration.');
      } finally {
        if (live) {setLoading(false);setLoadedAccount(user?.id);}
      }
    };
    fetchStatus();
    return () => {live=false;controller.abort();};
  }, [user?.id, user?.email, user?.role, navigate]);

  const validatePhase=(step:1|2)=>{
    const errors=validateStoreStep({storeName,username,description,location,deliveryMode,phone,phoneCountry},step);
    setFieldErrors(errors);
    if(Object.keys(errors).length){setPhase(step);requestAnimationFrame(()=>formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());return false;}
    return true;
  };

  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || loadedAccount !== user?.id || ((!storeData || user?.role !== 'merchant')) || submitting) return;
    if(!validatePhase(1)||!validatePhase(2))return;
    const accountId = user?.id,generation=accountGeneration.current;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await apiFetch('/api/digital-market/store-setup', {
        method: 'POST',
        body: JSON.stringify({
          ...(({})),
          storeName: storeName.trim(),
          username: username.trim(),
          location: location.trim(),
          category,
          deliveryMode: deliveryMode.trim(),
          phone: internationalPhone(phone, phoneCountry).number, phoneCountry,
          profilePicture: profilePicture.trim(),
          coverPicture: coverPicture.trim(),
          description: description.trim(),

        })
      });
      if (!mounted.current || currentAccount.current !== accountId || accountGeneration.current!==generation) return;

      if (res && res.success) {
        const payment = await apiFetch('/api/payments/paystack/initialize', { method: 'POST', body: JSON.stringify(({purpose:'activation',plan:'default',requestId:(activationRequest.current?.account===accountId?activationRequest.current:(activationRequest.current={account:accountId!,id:crypto.randomUUID()})).id})) });
        if (!mounted.current || currentAccount.current !== accountId || accountGeneration.current!==generation) return;
        if (openPaymentCheckout(payment,user?.id)) return;
        if (!payment?.paid || payment.accessGranted===false) throw new Error(payment.message || 'Store activation requires verified payment.');
        activationRequest.current=null;
        setSessionUser?.({ ...user, merchantSetupCompleted: true, merchantRegistrationFeePaid: true });
        navigate('/digital-market', { replace: true });
      } else {
        setErrorMessage(res?.error || "Failed to complete store onboarding.");
      }
    } catch (err: any) {
      if (mounted.current && currentAccount.current === accountId && accountGeneration.current===generation) {
        const field=String(err.code||'').replace(/^store_field_/,'') as keyof StoreFieldErrors;
        if(['storeName','username','description','location','phone','deliveryMode'].includes(field)){
          setFieldErrors({[field]:err.message});setPhase(['storeName','username','description'].includes(field)?1:2);
        }else setErrorMessage(err.message || "Failed to complete store onboarding.");
      }
    } finally {
      if (mounted.current && currentAccount.current === accountId && accountGeneration.current===generation) setSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      data-pv-onboarding className="page-canvas min-h-screen text-slate-900 flex flex-col justify-center gap-8 p-4 sm:p-8"
    >
      {/* Top Bar */}
      <div className="max-w-4xl mx-auto w-full flex items-center justify-between pb-6 border-b border-blue-100">
        <div className="flex items-center gap-3">
          <PineLogo size={36} hideText />
          <div>
            <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900"><PineWordmark /></h1>
            <p className="text-xs text-slate-500 font-semibold">Digital Market · Store Activation & Onboarding</p>
          </div>
        </div>

        <button aria-label="Sign out"
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
        {(loading || loadedAccount !== user?.id) && <p className="text-sm text-slate-600" role="status">Loading your store registration…</p>}

        <form ref={formRef} noValidate onSubmit={handleCompleteSetup} className="space-y-6">
          <fieldset disabled={loading || loadedAccount !== user?.id || submitting || (!storeData)} className="space-y-6">
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
                <input aria-invalid={!!fieldErrors.storeName} aria-describedby={fieldErrors.storeName?"store-storeName-error":undefined} aria-label="Store / Market Name"
                  type="text"
                  required
                  value={storeName}
                  onChange={(e) => {setStoreName(e.target.value);clearField('storeName');}}
                  placeholder="e.g. Ellie Gody's Campus Store"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {fieldMessage('storeName')}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">Merchant Username / Handle *</label>
                <input aria-invalid={!!fieldErrors.username} aria-describedby={fieldErrors.username?"store-username-error":undefined} aria-label="Merchant Username / Handle"
                  type="text"
                  required
                  value={username}
                  onChange={(e) => {setUsername(e.target.value);clearField('username');}}
                  placeholder="e.g. elliegodystore"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {fieldMessage('username')}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">Store Description / About *</label>
                <textarea aria-invalid={!!fieldErrors.description} aria-describedby={fieldErrors.description?"store-description-error":undefined} aria-label="Store Description / About"
                  rows={3}
                  required
                  value={description}
                  onChange={(e) => {setDescription(e.target.value);clearField('description');}}
                  placeholder="Official student digital market store..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                {fieldMessage('description')}
              </div>

              <StoreBrandingEditor customBranding={customBranding} logo={profilePicture} cover={coverPicture} onLogo={setProfilePicture} onCover={setCoverPicture} onBusy={onMediaBusy} />
              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  disabled={mediaUploads > 0}
                  onClick={() => {
                    if(!validatePhase(1))return;
                    setErrorMessage(null);setPhase(2);
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

              <StoreLocationInput value={location} onChange={value=>{setLocation(value);clearField('location');}} error={fieldErrors.location} />

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">Primary Category *</label>
                <select aria-label="Primary Category"
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
                <select aria-label="Delivery / Handover Mode" required value={deliveryMode} onChange={e => setDeliveryMode(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600">
                  {deliveryMode && !(STORE_DELIVERY_METHODS as readonly string[]).includes(deliveryMode) && <option value={deliveryMode}>{deliveryMode} (saved method)</option>}
                  {STORE_DELIVERY_METHODS.map(method => <option key={method} value={method}>{method}</option>)}
                </select>
              </div>

              <InternationalPhoneInput label="Store Primary Contact Number" value={phone} country={phoneCountry} error={fieldErrors.phone} onChange={(value, country) => { setPhone(value); setPhoneCountry(country); clearField('phone'); }} />
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
                    if(!validatePhase(2))return;
                    setErrorMessage(null);setPhase(3);
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
                  {('Activation charges only the one-time registration fee and includes two months of Pine Default access. Star and Pro upgrades are separate.')}
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

                {false}
                <dl className="space-y-2 text-sm"><div className="flex justify-between"><dt>Registration (one-time)</dt><dd>GHS {registrationFee ?? '…'}</dd></div>{false}</dl>
                {(<p className="text-sm text-blue-900">The two-month fee becomes due after your initial two months. Choose a paid monthly plan from your seller dashboard whenever you need an upgrade.</p>)}
                <p className="text-xs text-slate-600">{checkoutTotal === 0 ? 'No payment details are needed. PineVela verifies the current fee exemption when you continue.' : 'Zero-valued fees are waived. Paystack collects any remaining payment on its secure checkout. Closing checkout does not activate your store.'}</p>
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
                  disabled={submitting || mediaUploads > 0 || !settings}
                  className="px-8 py-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 hover:from-blue-800 hover:to-indigo-800 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Clock className="w-4 h-4 animate-spin" />
                      <span>{checkoutTotal === 0 ? 'Verifying free activation…' : 'Opening secure checkout…'}</span>
                    </>
                  ) : (
                    <>
                      <span>{checkoutTotal === 0 ? 'Continue and activate store' : 'Continue to Paystack'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          </fieldset>
          {errorMessage&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">{errorMessage}</p>}
        </form>
      </div>
    </motion.div>
  );
}
