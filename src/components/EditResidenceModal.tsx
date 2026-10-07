import React, { useState, useEffect } from 'react';
import { 
  Building2, MapPin, DollarSign, X, Check, Plus, Trash2, 
  Shield, Layers, Wrench, Sparkles, CheckCircle2, User
} from 'lucide-react';
import { validateDigitalAddress, validateHostelStreetAddress } from '../utils/formValidation';
import { getBillingFrequenciesForPropertyType, getDefaultBillingFrequencyForPropertyType } from './HostelRegistration';

interface EditResidenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  residence: any;
  onSave: (updatedResidence: any) => Promise<void> | void;
}

export default function EditResidenceModal({
  isOpen,
  onClose,
  residence,
  onSave
}: EditResidenceModalProps) {
  if (!isOpen || !residence) return null;

  const [activeSection, setActiveSection] = useState<'basics' | 'stay' | 'blocks' | 'manager'>('basics');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [name, setName] = useState(residence.name || '');
  const [hostelType, setHostelType] = useState(residence.hostel_type || residence.type || 'Hostel');
  const [paymentFrequency, setPaymentFrequency] = useState(
    residence.paymentFrequency || residence.billingFrequency || residence.frequency || getDefaultBillingFrequencyForPropertyType(residence.hostel_type || residence.type)
  );
  const [location, setLocation] = useState(residence.location || '');
  const [digitalAddress, setDigitalAddress] = useState(residence.digitalAddress || residence.digital_address || 'GA-183-9022');
  const [imageUrl, setImageUrl] = useState(residence.image || residence.imageUrl || '');
  const [totalCapacity, setTotalCapacity] = useState(residence.totalCapacity || residence.capacity || 1200);
  const [totalBlocks, setTotalBlocks] = useState(residence.totalBlocks || 2);
  
  // Manager
  const [managerName, setManagerName] = useState(residence.managerName || '');
  const [managerPhone, setManagerPhone] = useState(residence.managerPhone || '');
  const [managerEmail, setManagerEmail] = useState(residence.managerEmail || '');
  const [managerPhoto, setManagerPhoto] = useState(residence.managerPhoto || residence.managerAvatar || '');

  // Blocks details
  const [blocksList, setBlocksList] = useState<any[]>(() => {
    if (Array.isArray(residence.blocksList) && residence.blocksList.length > 0) {
      return residence.blocksList;
    }
    if (Array.isArray(residence.blocks) && residence.blocks.length > 0) {
      return residence.blocks;
    }
    const count = residence.totalBlocks || 2;
    const res: any[] = [];
    for (let i = 0; i < count; i++) {
      res.push({
        id: `block-${i + 1}`,
        name: `Block ${String.fromCharCode(65 + i)} (${i === 0 ? 'Alpha' : 'Beta'})`,
        floors: 4,
        totalRooms: Math.ceil((residence.totalCapacity || 1200) / (count * 3)),
        bedsPerRoom: 3,
        genderCategory: i === 0 ? 'Male & Female (Co-Ed)' : 'Female Wing & Executive'
      });
    }
    return res;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const streetCheck = validateHostelStreetAddress(location);
    if (!streetCheck.isValid) {
      setError(streetCheck.error || 'Enter a valid street address.');
      return;
    }
    const gpsCheck = validateDigitalAddress(digitalAddress, true);
    if (!gpsCheck.isValid) {
      setError(gpsCheck.error || 'Enter a valid digital address.');
      return;
    }
    setIsSaving(true);
    try {
      const updatedData = {
        ...residence,
        name: name.trim(),
        hostel_type: hostelType,
        type: hostelType,
        wing: hostelType,
        paymentFrequency: paymentFrequency,
        billingFrequency: paymentFrequency,
        location: location.trim(),
        digitalAddress: digitalAddress.trim(),
        digital_address: digitalAddress.trim(),
        image: imageUrl.trim() || residence.image,
        imageUrl: imageUrl.trim() || residence.imageUrl,
        totalCapacity: Number(totalCapacity),
        totalBlocks: Number(totalBlocks),
        managerName: managerName.trim(),
        managerPhone: managerPhone.trim(),
        managerEmail: managerEmail.trim(),
        managerPhoto: managerPhoto.trim(),
        blocksList: blocksList
      };

      await onSave(updatedData);
      onClose();
    } catch (err: any) {
      setError(err.message || 'This residence could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div data-popup-card className="bg-white border border-blue-200 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-gradient-to-r from-sky-400/25 via-blue-500/20 to-indigo-400/25 backdrop-blur-xl border-b border-sky-200/80 text-slate-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center border border-blue-200 shadow-xs">
              <Building2 className="w-5 h-5 text-blue-900" />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Edit Registered Residence Record</h3>
              <p className="text-xs text-slate-600 font-medium">Official PineVela administrative override for "{residence.name}"</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && <p role="alert" className="mx-6 mt-4 shrink-0 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 overflow-x-auto shrink-0 gap-2 py-2">
          {[
            { id: 'basics', label: 'Basic Info' },
            { id: 'stay', label: 'Stay Cycle' },
            { id: 'blocks', label: 'Blocks & Capacity' },
            { id: 'manager', label: 'Assigned Manager' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                activeSection === tab.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body Content Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* SECTION 1: BASICS */}
          {activeSection === 'basics' && (
            <div className="space-y-4 animate-fadeIn">
              <h4 className="text-sm font-bold text-slate-900 border-b pb-2">Property Identity & Location</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Residence Official Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Property Category</label>
                  <select
                    value={hostelType}
                    onChange={(e) => {
                      const newType = e.target.value;
                      setHostelType(newType);
                      const validFrequencies = getBillingFrequenciesForPropertyType(newType);
                      const isValid = validFrequencies.some(f => f.value === paymentFrequency);
                      if (!isValid) {
                        setPaymentFrequency(getDefaultBillingFrequencyForPropertyType(newType));
                      }
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  >
                    <option value="Hostel">Hostel (Student & Academic Accommodation)</option>
                    <option value="Inn">Inn (Guesthouse & Short-stay)</option>
                    <option value="Hotel">Hotel (Commercial Lodging & Suites)</option>
                    <option value="Estate">Estate (Residential Apartments & Condos)</option>
                    <option value="Lounge">Lounge / Executive Suites</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Physical Location / Address</label>
                <input
                  type="text"
                  required
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Oxford street, Osu, Accra"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Cover Image URL</label>
                <input
                  type="text"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>
            </div>
          )}

          {/* SECTION 2: STAY CYCLE */}
          {activeSection === 'stay' && (
            <div className="space-y-4 animate-fadeIn">
              <h4 className="text-sm font-bold text-slate-900 border-b pb-2">Stay Cycle</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Stay Cycle</label>
                  <select
                    value={paymentFrequency}
                    onChange={(e) => setPaymentFrequency(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                  >
                    {getBillingFrequenciesForPropertyType(hostelType).map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500 font-medium mt-1">
                    {hostelType === 'Hotel' ? 'Hotel billing cycle (Daily, nightly, or extended stay)' :
                     hostelType === 'Inn' ? 'Inn / Guesthouse billing cycle (Nightly, daily, or weekend)' :
                     hostelType === 'Estate' ? 'Residential lease cycle (Monthly, quarterly, or annual rent)' :
                     'Academic residence cycle (Per academic year, per semester, or monthly)'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: BLOCKS & CAPACITY */}
          {activeSection === 'blocks' && (
            <div className="space-y-4 animate-fadeIn">
              <h4 className="text-sm font-bold text-slate-900 border-b pb-2">Physical Wings & Capacity</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Total Capacity (Beds)</label>
                  <input
                    type="number"
                    required
                    value={totalCapacity}
                    onChange={(e) => setTotalCapacity(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Total Physical Blocks / Wings</label>
                  <input
                    type="number"
                    required
                    value={totalBlocks}
                    onChange={(e) => setTotalBlocks(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <label className="block text-xs font-bold text-slate-700">Configured Blocks / Wings Details</label>
                {blocksList.map((block, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="font-bold text-slate-500 block mb-1">Block Name</span>
                      <input
                        type="text"
                        value={block.name || block.blockName || `Block ${idx + 1}`}
                        onChange={(e) => {
                          const updated = [...blocksList];
                          updated[idx] = { ...updated[idx], name: e.target.value, blockName: e.target.value };
                          setBlocksList(updated);
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block mb-1">Floors</span>
                      <input
                        type="number"
                        value={block.floors || 4}
                        onChange={(e) => {
                          const updated = [...blocksList];
                          updated[idx] = { ...updated[idx], floors: Number(e.target.value) };
                          setBlocksList(updated);
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block mb-1">Total Rooms</span>
                      <input
                        type="number"
                        value={block.totalRooms || 200}
                        onChange={(e) => {
                          const updated = [...blocksList];
                          updated[idx] = { ...updated[idx], totalRooms: Number(e.target.value) };
                          setBlocksList(updated);
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <span className="font-bold text-slate-500 block mb-1">Gender / Wing Type</span>
                      <input
                        type="text"
                        value={block.genderCategory || 'Mixed Community'}
                        onChange={(e) => {
                          const updated = [...blocksList];
                          updated[idx] = { ...updated[idx], genderCategory: e.target.value };
                          setBlocksList(updated);
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 4: MANAGER */}
          {activeSection === 'manager' && (
            <div className="space-y-4 animate-fadeIn">
              <h4 className="text-sm font-bold text-slate-900 border-b pb-2">Assigned Property Manager Profile</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Manager Full Name</label>
                  <input
                    type="text"
                    value={managerName}
                    onChange={(e) => setManagerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Manager Phone Number</label>
                  <input
                    type="text"
                    value={managerPhone}
                    onChange={(e) => setManagerPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Manager Email Address</label>
                  <input
                    type="email"
                    value={managerEmail}
                    onChange={(e) => setManagerEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Manager Photo URL</label>
                  <input
                    type="text"
                    value={managerPhoto}
                    onChange={(e) => setManagerPhoto(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Footer Save Button */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all cursor-pointer flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSaving ? 'Saving Updates...' : 'Save & Publish Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
