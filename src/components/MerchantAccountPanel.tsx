import { ArrowRight, BadgeCheck, Calendar, CheckCircle2, Clock, LogIn, Mail, Phone, RefreshCw, School, ShieldAlert, ShieldCheck, ShoppingBag, User } from 'lucide-react';
import type { DigitalMarketApplication, DigitalMarketStore } from '../types';
import { merchantRegistrationStatus } from '../lib/registrationStatus';

// Reused outside the buyer purchases page; registration and seller onboarding remain separate flows.
export default function MerchantAccountPanel({ digitalMarketApp, digitalMarketStore, marketPrices, onRegister, handleQuickMerchantLogin, quickLoggingInMerchant = false }: {
  digitalMarketApp: DigitalMarketApplication | null;
  digitalMarketStore: DigitalMarketStore | null;
  marketPrices?: { registrationFee: number; semesterFee: number };
  onRegister: () => void;
  handleQuickMerchantLogin: () => void;
  quickLoggingInMerchant?: boolean;
}) {
  const status = merchantRegistrationStatus(digitalMarketApp, digitalMarketStore);
  // A feature restriction keeps the original application/store details visible.
  const displayStatus = status === 'restricted' ? merchantRegistrationStatus(
    digitalMarketApp ? { ...digitalMarketApp, accountStatus: undefined } : null,
    digitalMarketStore ? { ...digitalMarketStore, accountStatus: undefined } : null,
  ) : status;
  const effectiveMarketStore = digitalMarketStore?.setupCompleted && digitalMarketStore.registrationFeePaid ? digitalMarketStore : null;
  return (
              <div data-pv-onboarding className="space-y-6 [overflow-wrap:anywhere]">
                {/* 1. APPROVED MERCHANT MANDATORY STORE CREATION & PAYSTACK ONBOARDING SCREEN */}
                {displayStatus === 'approved' && (
                  <div className="bg-white/95 border-2 border-blue-300/90 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-6 backdrop-blur-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-blue-100">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-700 to-blue-900 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 shrink-0">
                          <CheckCircle2 className="w-7 h-7" />
                        </div>
                        <div>
                          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-900 text-xs font-black rounded-full mb-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                            <span>Approved by Campus Admin</span>
                          </div>
                          <h2 className="text-xl sm:text-2xl font-black text-slate-900">Your Student Merchant Store is Approved! 🎉</h2>
                          <p className="text-xs text-slate-600 font-medium mt-0.5">
                            Log into your digital market account to complete your mandatory multi-phase store onboarding and secure Paystack activation.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleQuickMerchantLogin()}
                        className="px-8 py-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 hover:from-blue-800 hover:to-indigo-800 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2 cursor-pointer shrink-0"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Login to your Digital Market Account</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-4 bg-blue-50/80 rounded-2xl border border-blue-200/90 text-xs text-blue-950 flex items-center gap-3">
                      <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0" />
                      <div>
                        <span className="font-bold">Mandatory First-Time Onboarding:</span> As per PineVela security policies, logging into your digital market account for the first time will guide you through our clean multi-phase store creation wizard (Store Details, Campus Location, and Paystack Checkout).
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. UNREGISTERED LANDING STATE */}
                {displayStatus === 'unregistered' && (
                  <div className="bg-white/90 border border-slate-200/80 rounded-3xl p-6 sm:p-10 shadow-xl space-y-8 backdrop-blur-md">
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-6 border-b border-slate-100">
                      <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100/70 text-blue-900 border border-blue-200/70 text-xs font-bold rounded-full mb-3">
                          <span>Student Digital Store Gateway</span>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900">Own Your Digital Market Platform</h2>
                        <p className="text-xs text-slate-600 font-medium mt-1 max-w-xl">
                          Launch your official online store, sell products to fellow university residents, and manage real-time inventory on PineVela.
                        </p>
                      </div>

                      <div className="bg-gradient-to-br from-blue-50 via-indigo-50/50 to-blue-100/50 border border-blue-200/80 rounded-2xl p-4 text-center shrink-0 w-full md:w-auto">
                        <div className="text-xs font-extrabold text-blue-950 uppercase">Registration Fee</div>
                        <div className="text-2xl font-black text-blue-900 mt-0.5">{marketPrices?.registrationFee ?? "…"} GHS <span className="text-xs font-medium text-slate-500">one-time</span></div>
                        <div className="text-[10px] text-slate-500 mt-0.5">+ {marketPrices?.semesterFee ?? "…"} GHS every two months, plus selected monthly plan</div>
                      </div>
                    </div>

                    {/* Qualifications & Policy List */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Qualification Requirements</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                          <School className="w-6 h-6 text-blue-700" />
                          <h4 className="text-xs font-bold text-slate-900">1. Accredited University Student</h4>
                          <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                            Must be an enrolled student at KNUST, UG, UCC, UPSA, UMaT, UDS, UHAS, or other accredited Ghanaian universities.
                          </p>
                        </div>

                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                          <Mail className="w-6 h-6 text-blue-700" />
                          <h4 className="text-xs font-bold text-slate-900">2. Valid Student Email</h4>
                          <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                            Must provide an accredited university student email address for identity validation.
                          </p>
                        </div>

                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                          <BadgeCheck className="w-6 h-6 text-indigo-700" />
                          <h4 className="text-xs font-bold text-slate-900">3. Verifiable Student ID / Ghana Card</h4>
                          <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                            Submit a valid Ghana Card or Student ID Number for Admin verification.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                      <p className="text-xs text-slate-500 font-medium">
                        Once submitted, your application is reviewed by PineVela Admin for quick approval.
                      </p>
                      <button
                        type="button"
                        onClick={onRegister}
                        className="px-8 py-3.5 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 hover:from-blue-800 hover:to-indigo-800 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <span>Register Your Digital Market</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. SUBMITTED CARD PENDING (AWAITING ADMIN APPROVAL) */}
                {digitalMarketApp && displayStatus === 'pending' && (
                  <div className="bg-white/95 border-2 border-blue-200/90 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6 backdrop-blur-md">
                    {/* Status Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-blue-100">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-blue-100 border border-blue-300 text-blue-800 flex items-center justify-center shrink-0">
                          <Clock className="w-6 h-6 animate-pulse" />
                        </div>
                        <div>
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 border border-blue-300 text-blue-900 text-[10px] font-black tracking-wide uppercase mb-1">
                            <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                            <span>Application Pending Admin Review</span>
                          </div>
                          <h3 className="text-lg font-black text-slate-900">Submitted Market Application Card</h3>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Application Ref</div>
                        <div className="text-xs font-mono font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                          {digitalMarketApp.id}
                        </div>
                      </div>
                    </div>

                    {/* Pending Application Details Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1">
                        <div className="text-[10px] uppercase font-extrabold text-slate-400 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-blue-600" />
                          <span>Applicant Full Legal Name</span>
                        </div>
                        <div className="text-sm font-black text-slate-900">{digitalMarketApp.fullName}</div>
                      </div>

                      <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1">
                        <div className="text-[10px] uppercase font-extrabold text-slate-400 flex items-center gap-1.5">
                          <School className="w-3.5 h-3.5 text-blue-600" />
                          <span>Accredited Ghanaian University</span>
                        </div>
                        <div className="text-sm font-black text-slate-900">{digitalMarketApp.university}</div>
                      </div>

                      <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1">
                        <div className="text-[10px] uppercase font-extrabold text-slate-400 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-blue-600" />
                          <span>Ghanaian Student Email Address</span>
                        </div>
                        <div className="text-sm font-black text-slate-900 font-mono">{digitalMarketApp.studentEmail}</div>
                      </div>

                      <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1">
                        <div className="text-[10px] uppercase font-extrabold text-slate-400 flex items-center gap-1.5">
                          <BadgeCheck className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Verifiable Ghana Card / Student ID</span>
                        </div>
                        <div className="text-sm font-black text-slate-900 font-mono">{digitalMarketApp.idNumber}</div>
                      </div>

                      <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1">
                        <div className="text-[10px] uppercase font-extrabold text-slate-400 flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-blue-700" />
                          <span>Proposed Selling Category</span>
                        </div>
                        <div className="text-sm font-black text-slate-900">{digitalMarketApp.categoryToSell}</div>
                      </div>

                      <div className="p-4 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-1">
                        <div className="text-[10px] uppercase font-extrabold text-slate-400 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-600" />
                          <span>Submission Timestamp</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-800">
                          {new Date(digitalMarketApp.submittedAt).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} at {new Date(digitalMarketApp.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    {/* Progress Pipeline */}
                    <div className="bg-blue-50/70 border border-blue-200/90 rounded-2xl p-5 space-y-4">
                      <div className="text-xs font-black text-blue-950 uppercase tracking-wider flex items-center gap-2">
                        <span>Platform Verification & Activation Pipeline</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                        <div className="p-3 bg-white rounded-xl border border-emerald-300 shadow-xs flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">✓</div>
                          <div>
                            <div className="font-bold text-slate-900 text-[11px]">1. Form Submitted</div>
                            <div className="text-[10px] text-emerald-700 font-semibold">Completed</div>
                          </div>
                        </div>

                        <div className="p-3 bg-white rounded-xl border-2 border-blue-500 shadow-xs flex items-center gap-2.5">
                          <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-900 flex items-center justify-center font-bold text-xs shrink-0 animate-pulse">2</div>
                          <div>
                            <div className="font-bold text-slate-900 text-[11px]">2. Admin Review</div>
                            <div className="text-[10px] text-blue-900 font-bold">In Progress</div>
                          </div>
                        </div>

                        <div className="p-3 bg-white/70 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2.5 opacity-60">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-xs shrink-0">3</div>
                          <div>
                            <div className="font-bold text-slate-900 text-[11px]">3. Verification Approval</div>
                            <div className="text-[10px] text-slate-500">Upcoming</div>
                          </div>
                        </div>

                        <div className="p-3 bg-white/70 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2.5 opacity-60">
                          <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-xs shrink-0">4</div>
                          <div>
                            <div className="font-bold text-slate-900 text-[11px]">4. Live Campus Store</div>
                            <div className="text-[10px] text-slate-500">Upcoming</div>
                          </div>
                        </div>
                      </div>

                      <div className="p-3.5 bg-white/90 border border-blue-200 rounded-xl text-xs text-slate-700 font-medium leading-relaxed flex items-start gap-2.5">
                        <ShieldAlert className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                        <div>
                          <strong>Verification in Progress:</strong> PineVela administrators verify student email accreditation. Please check back later. Once an admin approves your submission, your official Digital Market platform card will activate immediately.
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. VERIFIED & ACTIVE DIGITAL MARKET CARD & STORE DASHBOARD */}
                {effectiveMarketStore && displayStatus === 'active' && (
                  <div className="space-y-6">
                    {/* DIGITAL MARKET DETAILED STORE CARD */}
                    <div className="relative overflow-hidden bg-white/80 backdrop-blur-md border-2 border-blue-400/35 rounded-3xl p-6 sm:p-8 shadow-[0_12px_45px_rgba(59,130,246,0.12)] text-slate-800">
                      {/* Decorative Background Accents */}
                      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
                      <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl -ml-20 -mb-20 pointer-events-none" />

                      <div className="relative z-10 space-y-6">
                        {/* Top Card Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-blue-550/10 text-blue-600 flex items-center justify-center font-black border border-blue-200 shadow-sm">
                              <ShoppingBag className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                              <div className="text-[10px] tracking-widest uppercase font-extrabold text-blue-600">PineVela Digital Student Market</div>
                              <div className="text-sm font-black text-slate-900">Official Merchant Accreditation Card</div>
                            </div>
                          </div>

                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 text-xs font-black tracking-wider uppercase backdrop-blur-md">
                            <BadgeCheck className="w-4 h-4 text-emerald-600" />
                            <span>{status === 'restricted' ? 'VERIFIED — RESTRICTED' : 'VERIFIED & ACTIVE'}</span>
                          </div>
                        </div>

                        {/* Store Brand & Merchant Details */}
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                          <div className="space-y-2.5">
                            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                              <span>{effectiveMarketStore.storeName}</span>
                            </div>
                            <div className="text-xs text-slate-700 font-bold flex items-center gap-2 flex-wrap">
                              <School className="w-4 h-4 text-blue-600" />
                              <span>{effectiveMarketStore.university}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-indigo-600 font-extrabold">{effectiveMarketStore.category}</span>
                            </div>
                            <div className="text-xs text-slate-600 font-mono flex items-center gap-2 flex-wrap">
                              <Mail className="w-3.5 h-3.5 text-slate-500" />
                              <span className="font-bold text-slate-800">{effectiveMarketStore.studentEmail || effectiveMarketStore.parentUserEmail}</span>
                              <span className="text-slate-300">•</span>
                              <Phone className="w-3.5 h-3.5 text-slate-500" />
                              <span className="text-slate-800">{effectiveMarketStore.phone || 'Not provided'}</span>
                            </div>
                          </div>

                          {/* Unified Single Login to Digital Store Action */}
                          <div className="flex items-center gap-3 w-full md:w-auto">
                            <button
                              type="button"
                              disabled={quickLoggingInMerchant}
                              onClick={handleQuickMerchantLogin}
                              className="w-full md:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-600/30 hover:shadow-blue-500/40 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                              title="Secure isolated login into your merchant store management platform"
                            >
                              {quickLoggingInMerchant ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                                  <span>Authenticating...</span>
                                </>
                              ) : (
                                <>
                                  <LogIn className="w-4 h-4 text-white" />
                                  <span>Log In to Digital Store</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Security Notice on Card */}
                        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-2xl text-[11px] text-blue-900 font-semibold flex items-start gap-2.5">
                          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                          <p className="leading-relaxed">
                            <strong>Security Isolation Active:</strong> To prevent account tampering, managing your inventory, adjusting stock, publishing listings, and verifying buyer pickup PINs are exclusively handled on your dedicated <strong>Digital Market Platform</strong>. Your primary account credentials cannot be used to modify your digital store.
                          </p>
                        </div>

                        {/* Card Footer: Platform Fee & ID */}
                        <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600 font-medium">
                          <div className="flex items-center gap-4">
                            <span className="text-emerald-600 font-bold">● Activation Fee: {(effectiveMarketStore.registrationFeeAmount ?? digitalMarketApp?.registrationFeeAmount) != null ? `${Number(effectiveMarketStore.registrationFeeAmount ?? digitalMarketApp?.registrationFeeAmount).toFixed(2)} GHS — ` : ''}Paid & Verified</span>
                            <span className="text-blue-700">● Two-month access: {effectiveMarketStore.semesterExpiresAt ? (new Date(effectiveMarketStore.semesterExpiresAt).getTime() > Date.now() ? 'Active' : 'Renewal required') : 'Expiry not recorded'}</span>
                          </div>
                          <div className="font-mono text-slate-500 text-[10px]">
                            Ref: {effectiveMarketStore.paymentTransactionRef || digitalMarketApp?.paymentTransactionRef || 'Not recorded'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {(status === 'disabled' || status === 'rejected' || status === 'restricted') && (
                  <div className="space-y-5 rounded-3xl border border-rose-200 bg-rose-50 p-6 sm:p-8">
                    <div className="flex items-center gap-3"><ShieldAlert className="h-8 w-8 text-rose-600" /><div>
                      <h3 className="text-lg font-black text-rose-900">{status === 'disabled' ? 'Merchant Store Disabled' : status === 'restricted' ? 'Merchant Store Restricted' : 'Merchant Registration Rejected'}</h3>
                      <p className="text-sm font-semibold text-rose-800">{digitalMarketStore?.storeName || digitalMarketApp?.storeName || digitalMarketApp?.fullName}</p>
                    </div></div>
                    <p className="text-sm text-rose-900">{digitalMarketStore?.banReason || digitalMarketApp?.banReason || digitalMarketApp?.adminNotes || 'Contact PineVela Administration for details about this account status.'}</p>
                    {digitalMarketApp?.studentEmail && <p className="break-all text-xs font-mono text-rose-800">{digitalMarketApp.studentEmail}</p>}
                    {digitalMarketApp?.id && <p className="break-all text-xs text-rose-800">Application Ref: {digitalMarketApp.id}</p>}
                  </div>
                )}
                {displayStatus === 'pending' && !digitalMarketApp && <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6"><h3 className="font-bold">Merchant Registration Pending</h3><p className="mt-2 text-sm">Your store registration is awaiting review. Check your notifications for updates.</p></div>}
              </div>
  );
}
