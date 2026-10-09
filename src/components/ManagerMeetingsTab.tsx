import DashboardOverlay from './DashboardOverlay';
import { sessionFetch as fetch } from '../lib/session';
import React, { useState, useEffect, useRef } from 'react';
import { safeJson } from '../lib/api';
import { 
  Calendar, 
  Clock, 
  User, 
  MapPin, 
  Video, 
  Phone, 
  Plus, 
  CheckCircle, 
  XCircle, 
  Clock3, 
  Search, 
  Filter, 
  ExternalLink, 
  MessageSquare, 
  FileText, 
  AlertCircle,
  RefreshCw,
  Trash2,
  Send,
  Building2,
  CalendarCheck,
  Tag
} from 'lucide-react';
import { MeetingLog } from '../types';
import { usesSupabasePersistence } from '../lib/persistence';

interface ManagerMeetingsTabProps {
  currentUser: any;
  primaryHostel?: any;
}

export const ManagerMeetingsTab: React.FC<ManagerMeetingsTabProps> = ({
  currentUser,
  primaryHostel
}) => {
  const [meetings, setMeetings] = useState<MeetingLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const readGeneration = useRef(0);
  const accountGeneration = useRef(0);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Pending' | 'Approved' | 'Completed' | 'Rejected' | 'Cancelled'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'student' | 'staff' | 'external'>('ALL');

  // New Meeting Booking Modal
  const [showBookModal, setShowBookModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Booking Form State
  const [bookRequesterName, setBookRequesterName] = useState('');
  const [bookRequesterType, setBookRequesterType] = useState<'student' | 'staff' | 'external'>('student');
  const [bookRequesterEmail, setBookRequesterEmail] = useState('');
  const [bookRequesterPhone, setBookRequesterPhone] = useState('');
  const [participants, setParticipants] = useState<{contextId:string;kind:string;name:string;email:string;phone:string;roomLabel:string}[]>([]);
  const [bookParticipantId, setBookParticipantId] = useState('');
  const selectedParticipant = participants.find(p => p.contextId === bookParticipantId && p.kind === (bookRequesterType === 'student' ? 'resident' : bookRequesterType));
  const savedParticipant = usesSupabasePersistence && bookRequesterType !== 'external';
  const [bookRoomOrUnit, setBookRoomOrUnit] = useState('');
  const [bookTopic, setBookTopic] = useState('');
  const [bookCategory, setBookCategory] = useState<MeetingLog['category']>('Room / Accommodation');
  const [bookDate, setBookDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [bookTimeSlot, setBookTimeSlot] = useState('10:00 AM - 10:30 AM');
  const [bookMode, setBookMode] = useState<MeetingLog['mode']>('In-Person (Admin Office)');
  const [bookNotes, setBookNotes] = useState('');

  // Manage Selected Meeting (Action modal / notes)
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingLog | null>(null);
  const [responseNotes, setResponseNotes] = useState('');
  const [meetingVenueLink, setMeetingVenueLink] = useState('');

  const fetchMeetings = async () => {
    const generation = ++readGeneration.current;
    setIsLoading(true);
    setError(null);
    try {
      const token = currentUser?.token || '';
      const res = await fetch('/api/meetings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error('Failed to load meeting records');
      }
      const data = await safeJson(res);
      if (generation !== readGeneration.current) return;
      setMeetings(Array.isArray(data) ? data : []);
      if (usesSupabasePersistence && primaryHostel?.id) {
        const people = await fetch(`/api/meetings/participants?hostelId=${encodeURIComponent(primaryHostel.id)}`);
        if (!people.ok) throw new Error('Could not load the residence participants.');
        const list = await safeJson(people);
        if (generation !== readGeneration.current) return;
        setParticipants(Array.isArray(list) ? list : []);
      }
    } catch (err: any) {
      console.error('Error fetching meetings:', err);
      if (generation === readGeneration.current) setError(err.message || 'Could not fetch meeting logs');
    } finally {
      if (generation === readGeneration.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    accountGeneration.current++;
    setMeetings([]);setParticipants([]);setBookParticipantId('');setSelectedMeeting(null);setShowBookModal(false);
    setSuccessMessage(null);setIsSubmitting(false);setResponseNotes('');setMeetingVenueLink('');
    fetchMeetings();
    return () => {readGeneration.current++;accountGeneration.current++;};
  }, [currentUser?.id, primaryHostel?.id]);

  const handleCreateMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookTopic.trim() || (savedParticipant ? !selectedParticipant : !bookRequesterName.trim()) || !bookDate || !primaryHostel?.id) {
      setError('Please fill in all required meeting details.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const generation = accountGeneration.current;

    try {
      const token = currentUser?.token || '';
      const contactFields = savedParticipant ? {requesterContextId:bookParticipantId} : {
        requesterName:bookRequesterName.trim(),requesterEmail:bookRequesterEmail.trim(),requesterPhone:bookRequesterPhone.trim(),roomOrUnit:bookRoomOrUnit.trim()
      };
      const payload = {
        ...contactFields,
        requesterType: bookRequesterType,
        topic: bookTopic.trim(),
        category: bookCategory,
        date: bookDate,
        timeSlot: bookTimeSlot,
        mode: bookMode,
        notes: bookNotes.trim(),
        hostelId: primaryHostel.id,
        ...(!usesSupabasePersistence ? {hostelName:primaryHostel.name,managerId:currentUser.id,managerName:currentUser.name} : {})
      };

      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const failure = await safeJson(res);
        throw new Error(failure?.error || 'Failed to schedule meeting request');
      }

      const created = await safeJson(res);
      if (generation !== accountGeneration.current) return;
      setMeetings(prev => [created, ...prev]);
      setShowBookModal(false);
      setSuccessMessage(`Meeting request for "${created.requesterName}" successfully logged.`);
      setTimeout(() => setSuccessMessage(null), 4000);

      // Reset Form
      setBookRequesterName('');
      setBookTopic('');
      setBookNotes('');
      setBookRoomOrUnit('');
      setBookParticipantId('');
      setBookRequesterEmail('');
      setBookRequesterPhone('');
    } catch (err: any) {
      console.error('Error creating meeting:', err);
      if (generation === accountGeneration.current) setError(err.message || 'Failed to submit meeting booking');
    } finally {
      if (generation === accountGeneration.current) setIsSubmitting(false);
    }
  };

  const handleUpdateStatus = async (meetingId: string, newStatus: MeetingLog['status']) => {
    const generation = accountGeneration.current;
    try {
      const token = currentUser?.token || '';
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          status: newStatus,
          managerResponseNotes: responseNotes || undefined,
          meetingLinkOrVenue: meetingVenueLink || undefined
        })
      });

      if (!res.ok) {
        const failure = await safeJson(res);
        throw new Error(failure?.error || `Failed to update meeting status to ${newStatus}`);
      }

      const updated = await safeJson(res);
      if (generation !== accountGeneration.current) return;
      setMeetings(prev => prev.map(m => m.id === meetingId ? updated : m));
      setSelectedMeeting(null);
      setResponseNotes('');
      setMeetingVenueLink('');
      setSuccessMessage(`Meeting status updated to ${newStatus}. Notification dispatched.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Update status error:', err);
      if (generation === accountGeneration.current) setError(err.message || 'Could not update meeting status');
    }
  };

  const handleDeleteMeeting = async (meetingId: string) => {
    if (!confirm('Are you sure you want to remove this meeting log?')) return;
    const generation = accountGeneration.current;
    try {
      const token = currentUser?.token || '';
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error('Failed to delete meeting');
      if (generation !== accountGeneration.current) return;
      setMeetings(prev => prev.filter(m => m.id !== meetingId));
      if (selectedMeeting?.id === meetingId) setSelectedMeeting(null);
      setSuccessMessage(usesSupabasePersistence ? 'Meeting removed from the log. Its history is retained.' : 'Meeting record deleted successfully.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      console.error('Delete meeting error:', err);
      if (generation === accountGeneration.current) setError(err.message || 'Could not delete meeting');
    }
  };

  // Filtered Meetings
  const filteredMeetings = meetings.filter(m => {
    const matchesSearch = 
      (m.topic || (m as any).reason || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.requesterName || (m as any).studentName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.roomOrUnit || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.category || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || m.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || (m.requesterType || 'student') === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  const pendingCount = meetings.filter(m => m.status === 'Pending').length;
  const approvedCount = meetings.filter(m => m.status === 'Approved').length;
  const completedCount = meetings.filter(m => m.status === 'Completed').length;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-sky-400/20 via-blue-500/15 to-indigo-400/20 backdrop-blur-xl border border-sky-300/50 text-slate-900 p-6 md:p-8 rounded-3xl shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-sky-200/20 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="p-2 bg-blue-100 rounded-xl text-blue-900 border border-blue-200 shadow-xs">
                <CalendarCheck className="w-5 h-5" />
              </span>
              <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
                Meeting Requests & Consultation Logs
              </h2>
            </div>
            <p className="text-xs md:text-sm text-slate-600 max-w-2xl font-medium leading-relaxed">
              Official meeting appointment portal for resident students and duty staff to book consultations, grievance reviews, and operational check-ins with facility management.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={fetchMeetings}
              className="px-3.5 py-2.5 bg-white/90 hover:bg-white text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-slate-200 shadow-xs cursor-pointer"
              title="Refresh meeting logs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Logs</span>
            </button>
            <button
              onClick={() => setShowBookModal(true)}
              className="px-4 py-2.5 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <CalendarCheck className="w-4 h-4 text-sky-300" />
              <span>Book Appointment</span>
            </button>
          </div>
        </div>

        {/* Quick Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-sky-300/40 text-xs">
          <div className="bg-white/70 backdrop-blur-md rounded-2xl p-3 border border-sky-200/60 shadow-xs">
            <div className="text-slate-600 text-[11px] font-bold">Total Meeting Records</div>
            <div className="text-xl font-black text-slate-900 mt-0.5">{meetings.length}</div>
          </div>
          <div className="bg-amber-500/15 backdrop-blur-md rounded-2xl p-3 border border-amber-300/50 shadow-xs">
            <div className="text-amber-900 text-[11px] font-bold">Pending Review</div>
            <div className="text-xl font-black text-amber-900 mt-0.5">{pendingCount}</div>
          </div>
          <div className="bg-emerald-500/15 backdrop-blur-md rounded-2xl p-3 border border-emerald-300/50 shadow-xs">
            <div className="text-emerald-900 text-[11px] font-bold">Approved / Scheduled</div>
            <div className="text-xl font-black text-emerald-900 mt-0.5">{approvedCount}</div>
          </div>
          <div className="bg-purple-500/15 backdrop-blur-md rounded-2xl p-3 border border-purple-300/50 shadow-xs">
            <div className="text-purple-900 text-[11px] font-bold">Completed</div>
            <div className="text-xl font-black text-purple-900 mt-0.5">{completedCount}</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Search & Filtering Bar */}
      <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input aria-label="Search by topic, student/staff name, room..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by topic, student/staff name, room..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1 text-xs text-slate-500 font-semibold mr-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Status:</span>
          </div>
          {(['ALL', 'Pending', 'Approved', 'Completed', 'Rejected'] as const).map(status => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                statusFilter === status
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status}
            </button>
          ))}

          <select aria-label="Filter meetings by requester"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none cursor-pointer"
          >
            <option value="ALL">All Roles</option>
            <option value="student">Students</option>
            <option value="staff">Staff Members</option>
            <option value="external">External</option>
          </select>
        </div>
      </div>

      {/* Meetings List / Table */}
      {isLoading ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-xs font-bold text-slate-600">Loading meeting records from database...</p>
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200/80 shadow-sm space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
            <Calendar className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-800">No Meeting Logs Recorded Yet</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              No meetings match the active filter. Students and staff can submit meeting appointments, or you can log a direct consultation now.
            </p>
          </div>
          <button
            onClick={() => setShowBookModal(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Schedule First Meeting</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredMeetings.map((meeting) => {
            const reqType = meeting.requesterType || 'student';
            const status = meeting.status || 'Pending';
            const mode = meeting.mode || (meeting as any).type || 'In-Person';

            return (
              <div
                key={meeting.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                      reqType === 'student' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                      reqType === 'staff' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                      'bg-purple-100 text-purple-800 border border-purple-200'
                    }`}>
                      {reqType === 'student' ? 'STU' : reqType === 'staff' ? 'STF' : 'EXT'}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{meeting.topic || (meeting as any).reason}</h4>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          status === 'Pending' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          status === 'Approved' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                          status === 'Completed' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          'bg-rose-100 text-rose-800 border border-rose-200'
                        }`}>
                          {status}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-medium">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <strong className="text-slate-800">{meeting.requesterName || (meeting as any).studentName}</strong>
                          <span className="text-[11px] text-slate-400 capitalize">({reqType})</span>
                        </span>

                        {meeting.roomOrUnit && meeting.roomOrUnit !== 'N/A' && (
                          <span className="flex items-center gap-1 text-slate-500">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>{meeting.roomOrUnit}</span>
                          </span>
                        )}

                        {meeting.category && (
                          <span className="flex items-center gap-1 text-indigo-600">
                            <Tag className="w-3 h-3 text-indigo-400" />
                            <span>{meeting.category}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
                    <button
                      onClick={() => {
                        setSelectedMeeting(meeting);
                        setResponseNotes(meeting.managerResponseNotes || '');
                        setMeetingVenueLink(meeting.meetingLinkOrVenue || '');
                      }}
                      className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Manage & Respond
                    </button>
                    <button
                      onClick={() => handleDeleteMeeting(meeting.id)}
                      title="Delete log"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Date, Time & Venue Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-3 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-2 text-slate-700 bg-slate-50 px-3 py-2 rounded-xl">
                    <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span><strong>Date:</strong> {meeting.date}</span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-700 bg-slate-50 px-3 py-2 rounded-xl">
                    <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span><strong>Time:</strong> {meeting.timeSlot || (meeting as any).time}</span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-700 bg-slate-50 px-3 py-2 rounded-xl">
                    {mode.includes('Google Meet') || mode.includes('Video') ? (
                      <Video className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : mode.includes('Phone') ? (
                      <Phone className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    ) : (
                      <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    )}
                    <span className="truncate"><strong>Format:</strong> {mode}</span>
                  </div>
                </div>

                {/* Notes & Manager Response */}
                {(meeting.notes || meeting.managerResponseNotes) && (
                  <div className="space-y-2 pt-2 text-xs">
                    {meeting.notes && (
                      <div className="p-3 bg-slate-50 rounded-xl text-slate-700 border border-slate-100">
                        <span className="font-bold text-slate-900 block mb-0.5">Requester Notes / Agenda:</span>
                        <p className="text-slate-600">{meeting.notes}</p>
                      </div>
                    )}
                    {meeting.managerResponseNotes && (
                      <div className="p-3 bg-blue-50/70 rounded-xl text-blue-950 border border-blue-100">
                        <span className="font-bold text-blue-900 block mb-0.5">Manager Response / Instructions:</span>
                        <p className="text-blue-800">{meeting.managerResponseNotes}</p>
                        {meeting.meetingLinkOrVenue && (
                          <div className="mt-1.5 pt-1.5 border-t border-blue-200/60 font-semibold text-blue-700 flex items-center gap-1.5">
                            <ExternalLink className="w-3 h-3" />
                            <span>Venue / Call Link: {meeting.meetingLinkOrVenue}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Book / Log New Meeting */}
      {showBookModal && (
        <DashboardOverlay aria-label="Schedule & Log Meeting Request" onClose={() => setShowBookModal(false)} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 md:p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Schedule & Log Meeting Request</h3>
                  <p className="text-xs text-slate-500">Record an appointment for a resident, staff member or external contact. Times use Ghana time.</p>
                </div>
              </div>
              <button aria-label="Close dialog"
                onClick={() => setShowBookModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMeeting} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">{savedParticipant ? 'Residence Participant *' : 'Requester Full Name *'}</label>
                  {savedParticipant ? (
                    <select aria-label="Residence Participant" required value={bookParticipantId} onChange={e => setBookParticipantId(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800">
                      <option value="">Choose an active participant</option>
                      {participants.filter(p => p.kind === (bookRequesterType === 'student' ? 'resident' : 'staff')).map(p => <option key={p.contextId} value={p.contextId}>{p.name} ({p.email})</option>)}
                    </select>
                  ) : <input aria-label="Requester Full Name"
                    type="text"
                    required
                    value={bookRequesterName}
                    onChange={(e) => setBookRequesterName(e.target.value)}
                    placeholder="e.g. Kwame Mensah / Resident Name"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Requester Role *</label>
                  <select aria-label="Requester Role"
                    value={bookRequesterType}
                    onChange={(e) => {setBookRequesterType(e.target.value as any);setBookParticipantId('');}}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  >
                    <option value="student">Resident Student</option>
                    <option value="staff">Duty Staff / Security / Cleaner</option>
                    <option value="external">External Contractor / Inspector</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Contact Email</label>
                  <input aria-label="Contact Email"
                    type="email"
                    value={savedParticipant ? selectedParticipant?.email || '' : bookRequesterEmail}
                    readOnly={savedParticipant}
                    onChange={(e) => setBookRequesterEmail(e.target.value)}
                    placeholder="Contact email"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Room / Unit / Department</label>
                  <input aria-label="Room / Unit / Department"
                    type="text"
                    value={savedParticipant ? selectedParticipant?.roomLabel || '' : bookRoomOrUnit}
                    readOnly={savedParticipant}
                    onChange={(e) => setBookRoomOrUnit(e.target.value)}
                    placeholder="e.g. Room A204 / Front Desk"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contact Phone</label>
                <input aria-label="Contact Phone" type="tel" value={savedParticipant ? selectedParticipant?.phone || '' : bookRequesterPhone} readOnly={savedParticipant} onChange={e => setBookRequesterPhone(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Meeting Topic / Subject *</label>
                <input aria-label="Meeting Topic / Subject"
                  type="text"
                  required
                  value={bookTopic}
                  onChange={(e) => setBookTopic(e.target.value)}
                  placeholder="e.g. Room Occupancy Dispute / Maintenance Follow-up"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                  <select aria-label="Category"
                    value={bookCategory}
                    onChange={(e) => setBookCategory(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  >
                    <option value="Room / Accommodation">Room / Accommodation</option>
                    <option value="Maintenance Follow-up">Maintenance Follow-up</option>
                    <option value="Payment / Billing">Payment / Billing</option>
                    <option value="Staff Operational Shift">Staff Operational Shift</option>
                    <option value="Disciplinary / Grievance">Disciplinary / Grievance</option>
                    <option value="General Consultation">General Consultation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Meeting Date *</label>
                  <input aria-label="Meeting Date"
                    type="date"
                    required
                    value={bookDate}
                    onChange={(e) => setBookDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Time Slot</label>
                  <select aria-label="Time Slot"
                    value={bookTimeSlot}
                    onChange={(e) => setBookTimeSlot(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  >
                    <option value="09:00 AM - 09:30 AM">09:00 AM - 09:30 AM</option>
                    <option value="10:00 AM - 10:30 AM">10:00 AM - 10:30 AM</option>
                    <option value="11:30 AM - 12:00 PM">11:30 AM - 12:00 PM</option>
                    <option value="02:00 PM - 02:30 PM">02:00 PM - 02:30 PM</option>
                    <option value="03:30 PM - 04:00 PM">03:30 PM - 04:00 PM</option>
                    <option value="04:30 PM - 05:00 PM">04:30 PM - 05:00 PM</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Format / Meeting Mode</label>
                <select aria-label="Format / Meeting Mode"
                  value={bookMode}
                  onChange={(e) => setBookMode(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                >
                  <option value="In-Person (Admin Office)">In-Person (Hostel Admin Office)</option>
                  <option value="Google Meet / Video">Google Meet / Video Conference</option>
                  <option value="Phone Call">Direct Phone Call</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Additional Notes / Agenda</label>
                <textarea aria-label="Additional Notes / Agenda"
                  rows={2}
                  value={bookNotes}
                  onChange={(e) => setBookNotes(e.target.value)}
                  placeholder="Outline key discussion items or questions..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBookModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Confirm & Log Meeting</span>
                </button>
              </div>
            </form>
          </div>
        </DashboardOverlay>
      )}

      {/* MODAL: Manage / Respond to Meeting */}
      {selectedMeeting && (
        <DashboardOverlay aria-label="Manage Meeting Request" onClose={() => setSelectedMeeting(null)} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-slate-100 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Manage Meeting Request</h3>
                <p className="text-xs text-slate-500">Update status, provide meeting link, or leave official instructions</p>
              </div>
              <button aria-label="Close dialog"
                onClick={() => setSelectedMeeting(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70 space-y-2 text-xs">
              <div className="font-bold text-slate-900 text-sm">{selectedMeeting.topic}</div>
              <div className="text-slate-600">
                Requester: <strong>{selectedMeeting.requesterName}</strong> ({selectedMeeting.requesterType})
              </div>
              <div className="text-slate-600">
                Scheduled: <strong>{selectedMeeting.date}</strong> at <strong>{selectedMeeting.timeSlot || (selectedMeeting as any).time}</strong>
              </div>
              <div className="text-slate-600">
                Current Status: <span className="font-bold text-blue-600">{selectedMeeting.status}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Venue or Meeting Video Link</label>
                <input aria-label="Venue or Meeting Video Link"
                  type="text"
                  value={meetingVenueLink}
                  onChange={(e) => setMeetingVenueLink(e.target.value)}
                  placeholder="e.g. Admin Room 101 or https://meet.google.com/xyz"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Manager Response Notes / Instructions</label>
                <textarea aria-label="Manager Response Notes / Instructions"
                  rows={3}
                  value={responseNotes}
                  onChange={(e) => setResponseNotes(e.target.value)}
                  placeholder="Leave official response or notes for the requester..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white resize-none"
                />
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="text-xs font-bold text-slate-700 mb-2">Change Status:</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={() => handleUpdateStatus(selectedMeeting.id, 'Approved')}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Approve</span>
                </button>

                <button
                  onClick={() => handleUpdateStatus(selectedMeeting.id, 'Completed')}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Clock3 className="w-3.5 h-3.5" />
                  <span>Complete</span>
                </button>

                <button
                  onClick={() => handleUpdateStatus(selectedMeeting.id, 'Rejected')}
                  className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1 cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>

                <button
                  onClick={() => handleUpdateStatus(selectedMeeting.id, 'Cancelled')}
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          </div>
        </DashboardOverlay>
      )}
    </div>
  );
};
