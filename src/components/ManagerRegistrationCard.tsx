import { ArrowRight, Bell, Building2, CheckCircle2, Clock, LogIn, ShieldAlert } from 'lucide-react';
import { managerRegistrationStatus, registrationStatusLabels, type ManagerRegistration } from '../lib/registrationStatus';

export default function ManagerRegistrationCard({ managerAccount, onRegister, onLogin }: {
  managerAccount: ManagerRegistration | null;
  onRegister: () => void;
  onLogin: () => void;
}) {
  const status = managerRegistrationStatus(managerAccount);
  return (
          <div className="space-y-6 animate-fadeIn relative z-10 max-w-4xl [overflow-wrap:anywhere]">
            {managerAccount ? (
              <div className="bg-white/95 border border-emerald-300 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 backdrop-blur-md">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-emerald-100">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold shadow-xs">
                      <Building2 className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-slate-900">
                        {managerAccount.name}
                      </h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">
                        {managerAccount.hostelName || managerAccount.organizationName || 'Property manager'}
                      </p>
                    </div>
                  </div>
                  
                  <div>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${status === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : status === 'pending' || status === 'more_info_required' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                      {status === 'approved' ? <CheckCircle2 className="h-4 w-4" /> : status === 'pending' ? <Clock className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <ShieldAlert className="h-4 w-4" />}
                      {registrationStatusLabels[status]}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-5 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-500">Official Manager Credentials & Details</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 block font-medium">Full Name</span>
                      <span className="font-bold text-slate-800">{managerAccount.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Organization / Property</span>
                      <span className="font-bold text-slate-800">{managerAccount.hostelName || managerAccount.organizationName || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Manager login email</span>
                      <span className="font-bold text-emerald-900 font-mono break-all">{managerAccount.email}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Phone Number</span>
                      <span className="font-bold text-slate-800">{managerAccount.phone || 'Not provided'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">National / Org ID</span>
                      <span className="font-bold text-slate-800 font-mono">
                        {managerAccount.idNumber && managerAccount.idNumber !== 'N/A' ? `••••${managerAccount.idNumber.slice(-4)}` : 'Not provided'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Registration Date</span>
                      <span className="font-bold text-slate-800">
                        {(managerAccount.submittedAt || managerAccount.createdAt) ? new Date(managerAccount.submittedAt || managerAccount.createdAt!).toLocaleDateString() : 'Not recorded'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Detailed Admin Notice for Blocked or Rejected Managers */}
                {(status === 'disabled' || status === 'suspended') ? (
                  <div className="p-5 bg-rose-50 border-2 border-rose-300 rounded-2xl text-xs text-rose-950 font-medium space-y-3 shadow-xs">
                    <div className="flex items-center gap-2 text-rose-900 font-black text-sm">
                      <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                      <span>{status === 'suspended' ? 'Manager Account Suspended' : 'Manager Account Restricted'}</span>
                    </div>
                    <div className="p-3.5 bg-white/90 border border-rose-200 rounded-xl space-y-1">
                      <span className="block text-[10px] font-black text-rose-600 uppercase tracking-wider">Reason Provided by Administrator:</span>
                      <p className="text-xs font-bold text-rose-950 leading-relaxed">
                        "{managerAccount.blockReason || managerAccount.adminNotes || 'Account access has been restricted by administration.'}"
                      </p>
                    </div>
                    <p className="text-[11px] text-rose-800 leading-relaxed font-semibold">
                      Your Manager Console access is restricted. Review the administrator feedback above or contact PineVela Administration for clarification.
                    </p>
                  </div>
                ) : managerAccount.adminNotes && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 font-medium space-y-1">
                    <span className="font-black text-amber-900 block">Administrator Review Feedback:</span>
                    <p>{managerAccount.adminNotes}</p>
                  </div>
                )}

                {(status === 'pending' || status === 'more_info_required') && (
                  <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
                    <Clock className="h-5 w-5 shrink-0 text-amber-700" /><div>
                      <strong className="block mb-1">{status === 'more_info_required' ? 'Additional Information Required' : 'Verification in Progress — Manager Login Locked'}</strong>
                      {managerAccount.requiresPropertyRegistration ? 'Your work identity is verified. Continue to submit your new residence for physical inspection.' : status === 'more_info_required' ? 'Review the administrator feedback above and provide the requested information through the existing verification flow.' : 'Your residence submission is awaiting administrator review and property verification. Manager access becomes available after approval.'}
                    </div>
                  </div>
                )}
                {status === 'rejected' && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">Your registration was rejected. Review the administrator feedback or contact PineVela Administration for clarification.</p>}
                {status === 'restricted' && <p className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">{managerAccount.restrictionReason || 'Some manager features have been restricted by administration.'}</p>}
                {status === 'approved' && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950"><strong>Approved & Verified Property:</strong> Your manager credentials and residence have been verified. Sign in with your manager credentials to manage operations.</div>}

                <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Real-time status updates are sent directly to your Alerts feed. You cannot create a duplicate manager account while this registration is active.</span>
                </div>

                {managerAccount.requiresPropertyRegistration && <button type="button" onClick={onRegister} className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Continue property registration</button>}
                {status==='more_info_required'&&managerAccount.canCorrectRegistration&&<button type="button" onClick={onRegister} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white">Review and correct application</button>}
                {(status === 'approved' || (status === 'restricted' && (managerAccount.isApproved || managerAccount.isVerified))) && <button type="button" onClick={onLogin} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white hover:bg-blue-700"><LogIn className="h-4 w-4" />Log In to Manager Console</button>}
              </div>
            ) : (
              <div className="bg-white/90 border border-emerald-200/80 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold">
                    <Building2 className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">
                      Register Your Resident
                    </h3>
                    <p className="text-sm text-slate-600 font-medium leading-relaxed mt-1">
                      Initiate the hostel manager creation flow for KNUST-accredited student residences in Kumasi. Register your property securely and gain access to the powerful Manager Console.
                    </p>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end">
                  <button
                    onClick={onRegister}
                    className="px-8 py-3 bg-emerald-700 hover:bg-emerald-800 text-white font-black text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <span>Start Registration Process</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
  );
}
