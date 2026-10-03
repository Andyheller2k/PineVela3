import { sessionFetch as fetch } from '../lib/session';
import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Bell, 
  Shield, 
  Clock, 
  Phone, 
  KeyRound, 
  CheckCircle, 
  AlertCircle, 
  X, 
  Save, 
  RefreshCw,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import { ManagerAccountSettings } from '../types';
import { safeJson } from '../lib/api';

interface ManagerAccountSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
}

export const ManagerAccountSettingsModal: React.FC<ManagerAccountSettingsModalProps> = ({
  isOpen,
  onClose,
  currentUser
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'notifications' | 'availability' | 'security' | 'emergency'>('notifications');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Settings State
  const [settings, setSettings] = useState<ManagerAccountSettings>({
    managerId: currentUser?.id || 'manager_101',
    notifications: {
      emailAlerts: true,
      smsAlerts: true,
      maintenanceTicketAlerts: true,
      meetingRequestAlerts: true
    },
    security: {
      twoFactorAuth: false,
      sessionTimeoutMinutes: 60,
      requirePasswordForPayouts: true
    },
    meetingAvailability: {
      allowStudentBookings: true,
      allowStaffBookings: true,
      workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      officeHoursStart: "09:00",
      officeHoursEnd: "17:00",
      slotDurationMinutes: 30,
      meetingModes: ["In-Person (Admin Office)", "Google Meet / Video", "Phone Call"],
      autoConfirmMeetings: false,
      officeLocation: "Hostel Admin Office (Room 101)"
    },
    emergencyContact: {
      contactName: "Facility Duty Lead",
      contactPhone: "+233 24 000 0000",
      contactRelation: "Duty Supervisor"
    }
  });

  // Password Change Sub-Form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = currentUser?.token || '';
      const res = await fetch('/api/manager/account-settings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await safeJson(res);
        if (data && data.notifications) {
          setSettings(data);
        }
      }
    } catch (err: any) {
      console.error('Error fetching manager account settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      setError(null);
      setSuccessMessage(null);
      setPasswordSuccess(null);
      setPasswordError(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen, currentUser]);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const token = currentUser?.token || '';
      const res = await fetch('/api/manager/account-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });

      if (!res.ok) {
        throw new Error('Failed to save account settings');
      }

      const updated = await safeJson(res);
      setSettings(updated);
      setSuccessMessage('Account preferences and operational rules saved successfully.');
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error('Save settings error:', err);
      setError(err.message || 'Could not save account settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters long.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const token = currentUser?.token || '';
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      setPasswordSuccess('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Password change error:', err);
      setPasswordError(err.message || 'Could not change password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const toggleWorkingDay = (day: string) => {
    const current = settings.meetingAvailability.workingDays || [];
    const exists = current.includes(day);
    const updated = exists ? current.filter(d => d !== day) : [...current, day];
    setSettings({
      ...settings,
      meetingAvailability: {
        ...settings.meetingAvailability,
        workingDays: updated
      }
    });
  };

  if (!isOpen) return null;

  const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 bg-gradient-to-r from-sky-400/25 via-blue-500/20 to-indigo-400/25 backdrop-blur-xl border-b border-sky-200/80 text-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-900 border border-blue-200 shadow-xs">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">Manager Account Settings</h3>
              <p className="text-xs text-slate-600 font-medium">Manage alerts, meeting availability, security, and emergency routing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-tab Navigation */}
        <div className="flex border-b border-slate-200 bg-slate-50/80 px-6 pt-3 gap-2 overflow-x-auto text-xs font-bold">
          <button
            onClick={() => setActiveSubTab('notifications')}
            className={`pb-3 px-3.5 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'notifications'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Alert Preferences</span>
          </button>

          <button
            onClick={() => setActiveSubTab('availability')}
            className={`pb-3 px-3.5 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'availability'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Meeting Availability</span>
          </button>

          <button
            onClick={() => setActiveSubTab('security')}
            className={`pb-3 px-3.5 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'security'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Security & Password</span>
          </button>

          <button
            onClick={() => setActiveSubTab('emergency')}
            className={`pb-3 px-3.5 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'emergency'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Emergency Contacts</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl font-semibold flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {isLoading ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              <span>Loading account preferences...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: NOTIFICATIONS */}
              {activeSubTab === 'notifications' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm mb-1">Operational Alerts & Channels</h4>
                    <p className="text-slate-500">Select which notification types and channels trigger real-time dispatches.</p>
                  </div>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                    <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 cursor-pointer hover:border-blue-200 transition-all">
                      <div>
                        <div className="font-bold text-slate-800">Email Alerts</div>
                        <div className="text-[11px] text-slate-500">Receive summaries and high priority notices via registered email</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.notifications.emailAlerts}
                        onChange={(e) => setSettings({
                          ...settings,
                          notifications: { ...settings.notifications, emailAlerts: e.target.checked }
                        })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 cursor-pointer hover:border-blue-200 transition-all">
                      <div>
                        <div className="font-bold text-slate-800">SMS / WhatsApp Emergency Pings</div>
                        <div className="text-[11px] text-slate-500">Instant SMS alerts for urgent maintenance or safety incidents</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.notifications.smsAlerts}
                        onChange={(e) => setSettings({
                          ...settings,
                          notifications: { ...settings.notifications, smsAlerts: e.target.checked }
                        })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 cursor-pointer hover:border-blue-200 transition-all">
                      <div>
                        <div className="font-bold text-slate-800">New Meeting Requests</div>
                        <div className="text-[11px] text-slate-500">Get notified immediately when a student or staff books a meeting</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.notifications.meetingRequestAlerts}
                        onChange={(e) => setSettings({
                          ...settings,
                          notifications: { ...settings.notifications, meetingRequestAlerts: e.target.checked }
                        })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </label>



                    <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 cursor-pointer hover:border-blue-200 transition-all">
                      <div>
                        <div className="font-bold text-slate-800">Maintenance Tickets</div>
                        <div className="text-[11px] text-slate-500">Dispatches when room fault or repair requests are submitted</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.notifications.maintenanceTicketAlerts}
                        onChange={(e) => setSettings({
                          ...settings,
                          notifications: { ...settings.notifications, maintenanceTicketAlerts: e.target.checked }
                        })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 2: AVAILABILITY */}
              {activeSubTab === 'availability' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm mb-1">Office Hours & Meeting Booking Rules</h4>
                    <p className="text-slate-500">Configure consultation availability for residents and team members.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                    <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 cursor-pointer">
                      <span className="font-bold text-slate-800">Allow Resident Student Bookings</span>
                      <input
                        type="checkbox"
                        checked={settings.meetingAvailability.allowStudentBookings}
                        onChange={(e) => setSettings({
                          ...settings,
                          meetingAvailability: { ...settings.meetingAvailability, allowStudentBookings: e.target.checked }
                        })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 cursor-pointer">
                      <span className="font-bold text-slate-800">Allow Duty Staff Bookings</span>
                      <input
                        type="checkbox"
                        checked={settings.meetingAvailability.allowStaffBookings}
                        onChange={(e) => setSettings({
                          ...settings,
                          meetingAvailability: { ...settings.meetingAvailability, allowStaffBookings: e.target.checked }
                        })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-bold text-slate-700">Available Working Days</label>
                    <div className="flex flex-wrap gap-2">
                      {weekDays.map(day => {
                        const isSelected = settings.meetingAvailability.workingDays?.includes(day);
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => toggleWorkingDay(day)}
                            className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Office Hours Start</label>
                      <input
                        type="time"
                        value={settings.meetingAvailability.officeHoursStart}
                        onChange={(e) => setSettings({
                          ...settings,
                          meetingAvailability: { ...settings.meetingAvailability, officeHoursStart: e.target.value }
                        })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Office Hours End</label>
                      <input
                        type="time"
                        value={settings.meetingAvailability.officeHoursEnd}
                        onChange={(e) => setSettings({
                          ...settings,
                          meetingAvailability: { ...settings.meetingAvailability, officeHoursEnd: e.target.value }
                        })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Slot Duration</label>
                      <select
                        value={settings.meetingAvailability.slotDurationMinutes}
                        onChange={(e) => setSettings({
                          ...settings,
                          meetingAvailability: { ...settings.meetingAvailability, slotDurationMinutes: Number(e.target.value) }
                        })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800"
                      >
                        <option value={15}>15 Minutes</option>
                        <option value={30}>30 Minutes</option>
                        <option value={45}>45 Minutes</option>
                        <option value={60}>60 Minutes</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Default In-Person Office Location</label>
                    <input
                      type="text"
                      value={settings.meetingAvailability.officeLocation}
                      onChange={(e) => setSettings({
                        ...settings,
                        meetingAvailability: { ...settings.meetingAvailability, officeLocation: e.target.value }
                      })}
                      placeholder="e.g. Administration Block - Room 101"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>
                </div>
              )}

              {/* TAB 3: SECURITY & PASSWORD */}
              {activeSubTab === 'security' && (
                <div className="space-y-6">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm mb-1">Account Security & Access Credentials</h4>
                    <p className="text-slate-500">Update manager login password and access security policies.</p>
                  </div>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                    <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 cursor-pointer">
                      <div>
                        <div className="font-bold text-slate-800">Two-Factor Authentication (2FA)</div>
                        <div className="text-[11px] text-slate-500">Require an SMS OTP when logging into the manager portal</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.security.twoFactorAuth}
                        onChange={(e) => setSettings({
                          ...settings,
                          security: { ...settings.security, twoFactorAuth: e.target.checked }
                        })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/60 cursor-pointer">
                      <div>
                        <div className="font-bold text-slate-800">Strict Payout Confirmation</div>
                        <div className="text-[11px] text-slate-500">Prompt for manager password before approving rent disbursements</div>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.security.requirePasswordForPayouts}
                        onChange={(e) => setSettings({
                          ...settings,
                          security: { ...settings.security, requirePasswordForPayouts: e.target.checked }
                        })}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                    </label>
                  </div>

                  {/* Password Change Sub-Form */}
                  <form onSubmit={handleChangePassword} className="border border-blue-100 bg-blue-50/50 p-4 rounded-2xl space-y-3">
                    <div className="flex items-center gap-2 font-bold text-slate-900">
                      <KeyRound className="w-4 h-4 text-blue-600" />
                      <span>Change Manager Password</span>
                    </div>

                    {passwordError && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold">
                        {passwordError}
                      </div>
                    )}

                    {passwordSuccess && (
                      <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
                        {passwordSuccess}
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">Current Password</label>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Enter current password..."
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">New Password (Min 6 characters)</label>
                          <input
                            type={showPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="New secure password"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">Confirm New Password</label>
                          <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repeat new password"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={isChangingPassword || !newPassword}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-1.5 text-xs"
                      >
                        {isChangingPassword ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                        <span>Update Password</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 4: EMERGENCY CONTACTS */}
              {activeSubTab === 'emergency' && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm mb-1">Emergency Escalation Contacts</h4>
                    <p className="text-slate-500">Designated personnel for after-hours building emergencies and security alerts.</p>
                  </div>

                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Emergency Officer Name</label>
                      <input
                        type="text"
                        value={settings.emergencyContact.contactName}
                        onChange={(e) => setSettings({
                          ...settings,
                          emergencyContact: { ...settings.emergencyContact, contactName: e.target.value }
                        })}
                        placeholder="e.g. Captain Kwabena Asante"
                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Direct Emergency Phone</label>
                        <input
                          type="text"
                          value={settings.emergencyContact.contactPhone}
                          onChange={(e) => setSettings({
                            ...settings,
                            emergencyContact: { ...settings.emergencyContact, contactPhone: e.target.value }
                          })}
                          placeholder="+233 24 123 4567"
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Designation / Role</label>
                        <input
                          type="text"
                          value={settings.emergencyContact.contactRelation}
                          onChange={(e) => setSettings({
                            ...settings,
                            emergencyContact: { ...settings.emergencyContact, contactRelation: e.target.value }
                          })}
                          placeholder="e.g. Head of Security / Night Supervisor"
                          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={isSaving || isLoading}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save Preferences</span>
          </button>
        </div>
      </div>
    </div>
  );
};
