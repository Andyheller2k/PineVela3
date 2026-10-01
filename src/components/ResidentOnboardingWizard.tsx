import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Phone, 
  MapPin, 
  ShieldCheck, 
  Mail, 
  Lock, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Building, 
  FileText, 
  UploadCloud, 
  Key, 
  Eye, 
  EyeOff, 
  Check, 
  UserPlus,
  Briefcase,
  DollarSign,
  Bed,
  X,
  School,
  FileCheck
} from 'lucide-react';
import PineLogo from './PineLogo';
import {
  validateEmail,
  cleanPhoneNumber,
  validatePhone,
  validateAddress,
  formatDigitalAddress,
  validateDigitalAddress,
  resolveIdConfig
} from '../utils/formValidation';

interface ResidentOnboardingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onResidentRegistered: (resident: any) => void;
  availableHostels?: any[];
  availableManagers?: any[];
}

export default function ResidentOnboardingWizard({
  isOpen,
  onClose,
  onResidentRegistered,
  availableHostels = [],
  availableManagers = []
}: ResidentOnboardingWizardProps) {
  // Phase state: 1 to 5, and 6 for Success
  const [phase, setPhase] = useState<number>(1);
  const [loadingSubmit, setLoadingSubmit] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  // Phase 1: Personal Info
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('Mr.');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [gender, setGender] = useState('Male');
  const [programOfStudy, setProgramOfStudy] = useState('');

  // Phase 2: Address & Location
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [customRegion, setCustomRegion] = useState('');
  const [digitalAddress, setDigitalAddress] = useState('');
  const [landmark, setLandmark] = useState('');

  // Phase 3: Identification & Student Records
  const [idType, setIdType] = useState('University Student ID');
  const [idNumber, setIdNumber] = useState('');
  const [institution, setInstitution] = useState('');
  const [docFileName, setDocFileName] = useState<string | null>(null);

  // Phase 4: Assigned Manager & Residence Details (THE MANAGERS INFO SECTION)
  const defaultManager = availableManagers[0] || {
    name: 'Anthony Davis',
    email: 'manager@pinevela.com',
    phone: '+233 24 123 4567'
  };

  const defaultHostel = availableHostels[0] || {
    name: 'Emerald Heights Block A',
    type: 'Hostel'
  };

  const [managerName, setManagerName] = useState(defaultManager.name || 'Anthony Davis');
  const [managerEmail, setManagerEmail] = useState(defaultManager.email || 'manager@pinevela.com');
  const [managerPhone, setManagerPhone] = useState(defaultManager.phone || '+233 24 123 4567');
  const [managerRole, setManagerRole] = useState('Resident Property Manager');
  
  const [residenceName, setResidenceName] = useState(defaultHostel.name || 'Emerald Heights Block A');
  const [category, setCategory] = useState<'Hostel' | 'Inn' | 'Hotel' | 'Estate' | 'Lounge'>('Hostel');
  const [roomNumber, setRoomNumber] = useState('Room 204, Bed A');
  const [feeAmount, setFeeAmount] = useState('3500');
  const [paymentStatus, setPaymentStatus] = useState<'Paid in Full' | 'Deposit Paid' | 'Pending'>('Paid in Full');

  // Phase 5: Account Credentials & Emergency Contact
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Resident@2026');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  // Created resident record for receipt
  const [createdResident, setCreatedResident] = useState<any>(null);

  if (!isOpen) return null;

  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Phase Navigation Validation Handlers
  const handleNextPhase = () => {
    if (phase === 1) {
      if (!fullName.trim() || fullName.trim().length < 3) {
        triggerToast('Please enter the resident’s full legal name (minimum 3 characters).', 'error');
        return;
      }
      const phoneCheck = validatePhone(phone, 'Resident primary phone');
      if (!phoneCheck.isValid) {
        triggerToast(phoneCheck.error!, 'error');
        return;
      }
      if (altPhone.trim()) {
        const altCheck = validatePhone(altPhone, 'Alternative contact phone');
        if (!altCheck.isValid) {
          triggerToast(altCheck.error!, 'error');
          return;
        }
      }
    } else if (phase === 2) {
      const addrCheck = validateAddress(address, 'Home address');
      if (!addrCheck.isValid) {
        triggerToast(addrCheck.error!, 'error');
        return;
      }
      if (!city.trim() || city.trim().length < 2) {
        triggerToast('Please enter the home city/town.', 'error');
        return;
      }
      const gpsCheck = validateDigitalAddress(digitalAddress, true);
      if (!gpsCheck.isValid) {
        triggerToast(gpsCheck.error!, 'error');
        return;
      }
    } else if (phase === 3) {
      const idCfg = resolveIdConfig(idType);
      const idCheck = idCfg.validate(idNumber);
      if (!idCheck.isValid) {
        triggerToast(idCheck.error!, 'error');
        return;
      }
    } else if (phase === 4) {
      // Validation for Manager's Info & Residence Section
      if (!managerName.trim() || managerName.trim().length < 3) {
        triggerToast('Please specify the Assigned Manager’s full name.', 'error');
        return;
      }
      const mgrPhoneCheck = validatePhone(managerPhone, 'Assigned Manager phone');
      if (!mgrPhoneCheck.isValid) {
        triggerToast(mgrPhoneCheck.error!, 'error');
        return;
      }
      if (managerEmail.trim()) {
        const mgrEmailCheck = validateEmail(managerEmail, 'Assigned Manager email');
        if (!mgrEmailCheck.isValid) {
          triggerToast(mgrEmailCheck.error!, 'error');
          return;
        }
      }
      if (!residenceName.trim()) {
        triggerToast('Please enter or select the Residence Name.', 'error');
        return;
      }
      if (!roomNumber.trim()) {
        triggerToast('Please enter the assigned Room / Bed number.', 'error');
        return;
      }
    } else if (phase === 5) {
      const emailCheck = validateEmail(email, 'Resident email address');
      if (!emailCheck.isValid) {
        triggerToast(emailCheck.error!, 'error');
        return;
      }
      if (emergencyContactPhone.trim()) {
        const emPhoneCheck = validatePhone(emergencyContactPhone, 'Emergency contact phone');
        if (!emPhoneCheck.isValid) {
          triggerToast(emPhoneCheck.error!, 'error');
          return;
        }
      }
    }

    setPhase((prev) => Math.min(prev + 1, 5));
  };

  const handlePrevPhase = () => {
    setPhase((prev) => Math.max(prev - 1, 1));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
      if (file.size > MAX_SIZE) {
        triggerToast("Upload failed: File exceeds the strict 5MB limit.", "error");
        e.target.value = '';
        return;
      }
      setDocFileName(file.name);
      triggerToast(`Attached document: ${file.name}`, 'success');
    }
  };

  // Final Registration Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailCheck = validateEmail(email, 'Resident email address');
    if (!emailCheck.isValid) {
      triggerToast(emailCheck.error!, 'error');
      return;
    }
    const phoneCheck = validatePhone(phone, 'Resident primary phone');
    if (!phoneCheck.isValid) {
      triggerToast(phoneCheck.error!, 'error');
      return;
    }
    const addrCheck = validateAddress(address, 'Home address');
    if (!addrCheck.isValid) {
      triggerToast(addrCheck.error!, 'error');
      return;
    }
    const idCfg = resolveIdConfig(idType);
    const idCheck = idCfg.validate(idNumber);
    if (!idCheck.isValid) {
      triggerToast(idCheck.error!, 'error');
      return;
    }

    if (!declarationAccepted) {
      triggerToast('Please verify and check the Admin certification declaration.', 'error');
      return;
    }

    setLoadingSubmit(true);
    try {
      const formattedName = `${title} ${fullName.trim()}`;
      const cleanEmail = email.trim().toLowerCase();
      const residentId = `res-${Date.now()}`;

      const finalRegion = region === 'Other / International' ? customRegion.trim() : region;
      const newResident = {
        id: residentId,
        name: formattedName,
        email: cleanEmail,
        phone: phone.trim(),
        altPhone: altPhone.trim() || undefined,
        gender,
        programOfStudy,
        institution,
        idType,
        idNumber: idNumber.trim(),
        homeAddress: `${address.trim()}, ${city.trim()}, ${finalRegion}`,
        digitalAddress: digitalAddress.trim() || undefined,
        landmark: landmark.trim() || undefined,
        
        // MANAGER'S INFO SECTION
        managerName: managerName.trim(),
        managerEmail: managerEmail.trim(),
        managerPhone: managerPhone.trim(),
        managerRole,

        // RESIDENCE ALLOCATION
        residenceName: residenceName.trim(),
        category,
        roomNumber: roomNumber.trim(),
        feeAmount: feeAmount.trim() || '3,500',
        feePaid: paymentStatus === 'Paid in Full',
        paymentStatus,
        emergencyContactName: emergencyContactName.trim() || undefined,
        emergencyContactPhone: emergencyContactPhone.trim() || undefined,
        status: 'Live & Approved',
        onboardedAt: new Date().toISOString()
      };

      // Call parent callback to sync state and localStorage
      onResidentRegistered(newResident);
      setCreatedResident(newResident);

      // Create backend activity log
      try {
        await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: `act-res-${Date.now()}`,
            text: `Admin onboarded resident "${newResident.name}" to "${newResident.residenceName}" under Manager ${newResident.managerName}.`,
            time: 'Just now',
            type: 'success'
          })
        });
      } catch (actErr) {
        console.warn('Activity logging skipped:', actErr);
      }

      setPhase(6); // Step 6: Success Confirmation View
      triggerToast('Resident Onboarding Completed & Approved!', 'success');
    } catch (err: any) {
      console.error('Submission error:', err);
      triggerToast(err.message || 'Failed to complete resident registration.', 'error');
    } finally {
      setLoadingSubmit(false);
    }
  };

  const phaseTitles = [
    { num: 1, title: 'Personal Info', sub: 'Legal Identity, Gender & Contact', icon: User },
    { num: 2, title: 'Address & Campus', sub: 'Physical Home & University Zone', icon: MapPin },
    { num: 3, title: 'Identification', sub: 'Student ID & Document Records', icon: ShieldCheck },
    { num: 4, title: 'Manager & Residence', sub: 'Manager Info & Room Allocation', icon: Briefcase },
    { num: 5, title: 'Review & Security', sub: 'Credentials, Review & Finalize', icon: FileCheck }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-md overflow-y-auto animate-fadeIn">
      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 font-bold text-xs sm:text-sm px-5 py-3.5 rounded-2xl shadow-2xl z-50 flex items-center gap-2.5 border animate-bounce ${
          toastType === 'success' ? 'bg-emerald-600 text-white border-emerald-500' :
          toastType === 'error' ? 'bg-rose-600 text-white border-rose-500' :
          'bg-slate-900 text-white border-slate-700'
        }`}>
          <span className="text-base">{toastType === 'success' ? '✓' : toastType === 'error' ? '⚠️' : 'ℹ️'}</span>
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-blue-100 shadow-2xl overflow-hidden relative w-full max-w-4xl my-auto flex flex-col max-h-[92vh]">
        
        {/* Top Brand Line */}
        <div className="h-2 bg-gradient-to-r from-blue-900 via-blue-700 to-amber-500 w-full shrink-0" />

        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <PineLogo size={32} hideText={false} />
            <span className="hidden sm:inline-block h-4 w-px bg-slate-200" />
            <span className="text-xs font-extrabold text-blue-900 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
              Resident Onboarding Portal
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {phase <= 5 ? (
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
            {/* Stepper Header */}
            <div className="bg-blue-50/50 rounded-2xl p-4 sm:p-6 border border-blue-100/70">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-amber-600 tracking-wider">
                      Phase {phase} of 5
                    </span>
                    <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full">
                      Step {phase}
                    </span>
                    {phase === 4 && (
                      <span className="text-[10px] bg-blue-100 text-blue-900 font-extrabold px-2 py-0.5 rounded-full border border-blue-200">
                        Includes Manager’s Info Section
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
                    {phaseTitles[phase - 1].title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">
                    {phaseTitles[phase - 1].sub}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 self-start sm:self-center">
                  {phaseTitles.map((p) => {
                    const Icon = p.icon;
                    const isCompleted = phase > p.num;
                    const isCurrent = phase === p.num;
                    return (
                      <div
                        key={p.num}
                        title={p.title}
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black transition-all ${
                          isCompleted
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : isCurrent
                            ? 'bg-blue-900 text-white ring-2 ring-blue-400 ring-offset-2'
                            : 'bg-slate-200 text-slate-400'
                        }`}
                      >
                        {isCompleted ? <Check size={14} /> : <Icon size={14} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-blue-900 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${10 + ((phase - 1) / 4) * 90}%` }}
                />
              </div>
            </div>

            {/* FORM CONTAINER */}
            <form onSubmit={phase === 5 ? handleSubmit : (e) => { e.preventDefault(); handleNextPhase(); }}>
              
              {/* PHASE 1: PERSONAL INFORMATION */}
              {phase === 1 && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-bold text-slate-700 mb-1">Title</label>
                      <select
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                      >
                        <option value="Mr.">Mr.</option>
                        <option value="Ms.">Ms.</option>
                        <option value="Mrs.">Mrs.</option>
                        <option value="Dr.">Dr.</option>
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Full Legal Name <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          placeholder="e.g. Kwabena Asante Boateng"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Primary Phone Number <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        <input
                          type="tel"
                          required
                          placeholder="024 000 0000 or +233 24 000 0000"
                          value={phone}
                          onChange={(e) => setPhone(cleanPhoneNumber(e.target.value))}
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Numbers only (10 digits starting with 0, or international +233)</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Alternative Phone (Optional)
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        <input
                          type="tel"
                          placeholder="050 000 0000 or +233 50 000 0000"
                          value={altPhone}
                          onChange={(e) => setAltPhone(cleanPhoneNumber(e.target.value))}
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Numbers only (optional)</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Gender</label>
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Program of Study / Academic Level</label>
                      <div className="relative">
                        <School className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          placeholder="e.g. BSc. Administration (Level 300)"
                          value={programOfStudy}
                          onChange={(e) => setProgramOfStudy(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PHASE 2: ADDRESS & LOCATION */}
              {phase === 2 && (
                <div className="space-y-4 animate-fadeIn">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Permanent Residential Address <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        placeholder="e.g. House No. 14, Ringway Estates"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        City / Town <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Accra"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Region</label>
                      <select
                        value={region}
                        onChange={(e) => setRegion(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                      >
                        <option value="Greater Accra">Greater Accra</option>
                        <option value="Ashanti">Ashanti</option>
                        <option value="Central">Central</option>
                        <option value="Eastern">Eastern</option>
                        <option value="Western">Western</option>
                        <option value="Volta">Volta</option>
                        <option value="Northern">Northern</option>
                        <option value="Other / International">Other / International</option>
                      </select>
                      {region === 'Other / International' && (
                        <div className="mt-2 space-y-1 animate-fadeIn">
                          <label className="text-[10px] font-bold text-slate-500 block">Specify Region / State *</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. London / California"
                            value={customRegion}
                            onChange={(e) => setCustomRegion(e.target.value)}
                            className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Prominent Landmark / Campus Gate</label>
                    <input
                      type="text"
                      placeholder="e.g. Near Legon Main Library"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                </div>
              )}

              {/* PHASE 3: IDENTIFICATION & RECORDS */}
              {phase === 3 && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Identification Document Type</label>
                      <select
                        value={idType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          setIdType(newType);
                          const cfg = resolveIdConfig(newType);
                          setIdNumber(prev => cfg.formatInput(prev));
                        }}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                      >
                        <option value="University Student ID">University Student ID (Alphanumeric)</option>
                        <option value="Voter ID Card">Voter ID Card (10 Digits — Numbers Only)</option>
                        <option value="NHIS Card (Health Insurance)">NHIS Card (8 Digits — Numbers Only)</option>
                        <option value="Passport">International Passport</option>
                        <option value="Driver's License">Driver's License (DVLA)</option>
                      </select>
                    </div>

                    {(() => {
                      const cfg = resolveIdConfig(idType);
                      return (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block text-xs font-bold text-slate-700">
                              {cfg.name} Number <span className="text-rose-500">*</span>
                            </label>
                            {cfg.numericOnly && (
                              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-black tracking-wide uppercase">
                                Numbers Only (No Alphabets)
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <ShieldCheck className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                            <input
                              type={cfg.numericOnly ? "tel" : "text"}
                              required
                              inputMode={cfg.numericOnly ? "numeric" : "text"}
                              maxLength={cfg.maxLength}
                              placeholder={cfg.placeholder}
                              value={idNumber}
                              onChange={(e) => setIdNumber(cfg.formatInput(e.target.value))}
                              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 uppercase font-mono"
                            />
                          </div>
                          <p className="text-[11px] text-slate-500 font-medium mt-1">
                            {cfg.helperText}
                          </p>
                        </div>
                      );
                    })()}
                  </div>

                  {idType === 'University Student ID' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">University / Tertiary Institution</label>
                      <input
                        type="text"
                        value={institution}
                        onChange={(e) => setInstitution(e.target.value)}
                        placeholder="e.g. University of Ghana, Legon / KNUST"
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Attach Supporting Identification Document (Optional)
                    </label>
                    <div className="border-2 border-dashed border-slate-200 hover:border-blue-500 rounded-2xl p-4 text-center cursor-pointer transition-colors bg-slate-50/50">
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="residentDocUpload"
                        accept=".pdf,.png,.jpg,.jpeg"
                      />
                      <label htmlFor="residentDocUpload" className="cursor-pointer flex flex-col items-center">
                        <UploadCloud className="w-8 h-8 text-blue-600 mb-1.5" />
                        <span className="text-xs font-bold text-slate-800">
                          {docFileName ? docFileName : 'Click to upload Student ID or another accepted ID photo'}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">PDF, PNG, JPG up to 5MB</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* PHASE 4: ASSIGNED MANAGER & RESIDENCE DETAILS (THE MANAGERS INFO SECTION) */}
              {phase === 4 && (
                <div className="space-y-6 animate-fadeIn">
                  {/* Highlight banner for Manager's Info */}
                  <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 rounded-2xl shadow-md space-y-1">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-amber-400" />
                      <h3 className="font-extrabold text-sm tracking-tight text-white">
                        Assigned Manager & Property Allocation Section
                      </h3>
                    </div>
                    <p className="text-xs text-blue-100/90 leading-relaxed">
                      Connect this resident directly to their verified manager and allocated room unit on PineVela.
                    </p>
                  </div>

                  {/* 1. MANAGERS INFO SECTION */}
                  <div className="bg-blue-50/50 border border-blue-200/80 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-blue-700" />
                        <h4 className="text-xs font-black uppercase text-blue-900 tracking-wider">
                          Manager’s Information
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        Verified Contact
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Manager Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={managerName}
                          onChange={(e) => setManagerName(e.target.value)}
                          placeholder="e.g. Anthony Davis"
                          className="w-full px-4 py-3 bg-white border border-blue-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Manager Phone Contact <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="tel"
                          required
                          value={managerPhone}
                          onChange={(e) => setManagerPhone(cleanPhoneNumber(e.target.value))}
                          placeholder="024 123 4567 or +233 24 123 4567"
                          className="w-full px-4 py-3 bg-white border border-blue-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        />
                        <p className="text-[10px] text-slate-400 font-medium mt-1">Numbers only</p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Manager Email
                        </label>
                        <input
                          type="email"
                          value={managerEmail}
                          onChange={(e) => setManagerEmail(e.target.value)}
                          placeholder="manager@pinevela.com"
                          className="w-full px-4 py-3 bg-white border border-blue-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. RESIDENCE & ROOM ALLOCATION */}
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-slate-700" />
                        <h4 className="text-xs font-black uppercase text-slate-900 tracking-wider">
                          Residence & Room Allocation
                        </h4>
                      </div>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full">
                        Room Assignment
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Residence Property Name <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={residenceName}
                          onChange={(e) => setResidenceName(e.target.value)}
                          placeholder="e.g. Emerald Heights Block A"
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Category Type</label>
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value as any)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                        >
                          <option value="Hostel">Hostel (Student & Academic)</option>
                          <option value="Inn">Inn (Guesthouse & Short-stay)</option>
                          <option value="Hotel">Hotel (Commercial Lodging)</option>
                          <option value="Estate">Estate (Residential Apartment)</option>
                          <option value="Lounge">Lounge / Suite</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Room & Bed Number <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <Bed className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            required
                            placeholder="e.g. Room 204, Bed A"
                            value={roomNumber}
                            onChange={(e) => setRoomNumber(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          {category === 'Hotel' || category === 'Inn' ? 'Rate Paid (GHS)' : 
                           category === 'Estate' ? 'Monthly Rent (GHS)' : 'Residency Fee (GHS)'}
                        </label>
                        <div className="relative">
                          <DollarSign className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            placeholder="3,500"
                            value={feeAmount}
                            onChange={(e) => setFeeAmount(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Payment Status</label>
                        <select
                          value={paymentStatus}
                          onChange={(e) => setPaymentStatus(e.target.value as any)}
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                        >
                          <option value="Paid in Full">Paid in Full</option>
                          <option value="Deposit Paid">Deposit Paid</option>
                          <option value="Pending">Payment Pending</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PHASE 5: CREDENTIALS, REVIEW & SUBMIT */}
              {phase === 5 && (
                <div className="space-y-5 animate-fadeIn">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Resident Login Email <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          required
                          placeholder="resident@example.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Temporary Password</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-10 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Contact Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Samuel Boateng (Father)"
                        value={emergencyContactName}
                        onChange={(e) => setEmergencyContactName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Emergency Contact Phone</label>
                      <input
                        type="tel"
                        placeholder="024 999 8888 or +233 24 999 8888"
                        value={emergencyContactPhone}
                        onChange={(e) => setEmergencyContactPhone(cleanPhoneNumber(e.target.value))}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600"
                      />
                      <p className="text-[10px] text-slate-400 font-medium mt-1">Numbers only</p>
                    </div>
                  </div>

                  {/* SUMMARY REVIEW CARD */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                    <h4 className="text-xs font-extrabold uppercase text-slate-900 tracking-wider flex items-center gap-2">
                      <span>Onboarding Summary Dossier</span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-white rounded-xl border border-slate-100">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Resident</span>
                        <span className="font-bold text-slate-900">{title} {fullName || 'Not specified'}</span>
                        <span className="text-slate-500 block text-[11px]">{phone} • {programOfStudy}</span>
                      </div>

                      <div className="p-3 bg-white rounded-xl border border-blue-100">
                        <span className="text-[10px] uppercase font-bold text-blue-600 block">Assigned Manager & Property</span>
                        <span className="font-bold text-slate-900">{managerName} ({managerPhone})</span>
                        <span className="text-blue-700 block text-[11px] font-semibold">{residenceName} • {roomNumber}</span>
                      </div>
                    </div>
                  </div>

                  {/* DECLARATION CHECKBOX */}
                  <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={declarationAccepted}
                        onChange={(e) => setDeclarationAccepted(e.target.checked)}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="text-xs text-amber-950 font-medium leading-relaxed">
                        I hereby certify as an Administrator that this resident has fulfilled onboarding requirements, is linked to the verified manager <span className="font-bold">{managerName}</span>, and is approved for residency allocation.
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-100 mt-6">
                {phase > 1 ? (
                  <button
                    type="button"
                    onClick={handlePrevPhase}
                    className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer"
                  >
                    <ArrowLeft size={15} />
                    <span>Previous Phase</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                )}

                {phase < 5 ? (
                  <button
                    type="button"
                    onClick={handleNextPhase}
                    className="flex items-center gap-2 px-7 py-3 rounded-2xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs shadow-lg shadow-blue-900/20 transition-all cursor-pointer"
                  >
                    <span>Proceed to Phase {phase + 1}</span>
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loadingSubmit}
                    className="flex items-center gap-2 px-8 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {loadingSubmit ? (
                      <span>Finalizing Onboarding...</span>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        <span>Complete & Approve Resident</span>
                      </>
                    )}
                  </button>
                )}
              </div>

            </form>
          </div>
        ) : (
          /* PHASE 6: SUCCESS CONFIRMATION VIEW */
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-6 text-center animate-fadeIn">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={40} />
            </div>

            <div className="space-y-1">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                Resident Successfully Onboarded!
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
                The resident dossier is verified, recorded in the registry, and linked with the designated manager.
              </p>
            </div>

            {/* Resident Badge Card */}
            {createdResident && (
              <div className="max-w-md mx-auto bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-3xl p-6 text-left shadow-lg space-y-4">
                <div className="flex items-center justify-between border-b border-blue-200/60 pb-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-blue-600 tracking-wider">PineVela Resident Pass</span>
                    <h4 className="text-base font-extrabold text-slate-900">{createdResident.name}</h4>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow-xs">
                    Live & Approved
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Allocated Unit</span>
                    <span className="font-bold text-slate-900">{createdResident.residenceName}</span>
                    <span className="text-blue-600 block font-semibold">{createdResident.roomNumber}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Assigned Manager</span>
                    <span className="font-bold text-slate-900">{createdResident.managerName}</span>
                    <span className="text-slate-500 block">{createdResident.managerPhone}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-blue-200/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Resident ID: <span className="font-mono font-bold text-slate-800">{createdResident.id}</span></span>
                  <span className="text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-md">
                    {createdResident.paymentStatus}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
              <button
                onClick={onClose}
                className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
              >
                Done & View in Registry
              </button>
              <button
                onClick={() => {
                  setPhase(1);
                  setFullName('');
                  setPhone('');
                  setAltPhone('');
                  setAddress('');
                  setIdNumber('');
                  setEmail('');
                  setCreatedResident(null);
                  setDeclarationAccepted(false);
                }}
                className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all cursor-pointer"
              >
                Register Another Resident
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
