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

const DEFAULT_AMENITY_OPTIONS = [
  'Fiber-Optic Wi-Fi',
  'Standby Generator / Plant',
  '24/7 Uniformed Security',
  'Borehole & Mechanized Water',
  'Quiet Study Hall',
  'Smart Biometric Access',
  'Air Conditioning',
  'CCTV Surveillance',
  'Cafeteria / Canteen',
  'Gym & Fitness Studio',
  'Laundry Facility',
  'Shuttle Bus Service'
];

export default function EditResidenceModal({
  isOpen,
  onClose,
  residence,
  onSave
}: EditResidenceModalProps) {
  if (!isOpen || !residence) return null;

  const [activeSection, setActiveSection] = useState<'basics' | 'pricing' | 'blocks' | 'amenities' | 'rules' | 'manager'>('basics');
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [name, setName] = useState(residence.name || '');
  const [hostelType, setHostelType] = useState(residence.hostel_type || residence.type || 'Hostel');
  const [paymentFrequency, setPaymentFrequency] = useState(
    residence.paymentFrequency || residence.billingFrequency || residence.frequency || getDefaultBillingFrequencyForPropertyType(residence.hostel_type || residence.type)
  );
  const [location, setLocation] = useState(residence.location || '');
  const [digitalAddress, setDigitalAddress] = useState(residence.digitalAddress || residence.digital_address || 'GA-183-9022');
  const [imageUrl, setImageUrl] = useState(residence.image || residence.imageUrl || '');
  const [price, setPrice] = useState(residence.price || 35000);
  const [securityDeposit, setSecurityDeposit] = useState(residence.securityDeposit || 2000);
  const [totalCapacity, setTotalCapacity] = useState(residence.totalCapacity || residence.capacity || 1200);
  const [totalBlocks, setTotalBlocks] = useState(residence.totalBlocks || 2);
  
  // Amenities
  const [amenities, setAmenities] = useState<string[]>(() => {
    const list = residence.facilities || residence.amenities || [];
    return Array.isArray(list) ? list : [];
  });
  const [customAmenity, setCustomAmenity] = useState('');

  // Rules
  const [curfew, setCurfew] = useState(residence.curfew || '10:00 PM (Main Gate Security Lock)');
  const [minStay, setMinStay] = useState(residence.minStay || '1 Academic Semester');
  const [visitorPolicy, setVisitorPolicy] = useState(residence.visitorPolicy || 'Permitted in lobby until 8:00 PM');
  const [smokingPolicy, setSmokingPolicy] = useState(residence.smokingPolicy || 'Strictly Non-Smoking Campus');

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

  const toggleAmenity = (item: string) => {
    if (amenities.includes(item)) {
      setAmenities(amenities.filter(a => a !== item));
    } else {
      setAmenities([...amenities, item]);
    }
  };

  const handleAddCustomAmenity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAmenity.trim()) return;
    if (!amenities.includes(customAmenity.trim())) {
      setAmenities([...amenities, customAmenity.trim()]);
    }
    setCustomAmenity('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const streetCheck = validateHostelStreetAddress(location);
    if (!streetCheck.isValid) {
      alert(streetCheck.error);
      return;
    }
    const gpsCheck = validateDigitalAddress(digitalAddress, true);
    if (!gpsCheck.isValid) {
      alert(gpsCheck.error);
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
        price: Number(price),
        securityDeposit: Number(securityDeposit),
        totalCapacity: Number(totalCapacity),
        totalBlocks: Number(totalBlocks),
        facilities: amenities,
        amenities: amenities,
        curfew: curfew.trim(),
        minStay: minStay.trim(),
        visitorPolicy: visitorPolicy.trim(),
        smokingPolicy: smokingPolicy.trim(),
        managerName: managerName.trim(),
        managerPhone: managerPhone.trim(),
        managerEmail: managerEmail.trim(),
        managerPhoto: managerPhoto.trim(),
        blocksList: blocksList
      };

      await onSave(updatedData);
      onClose();
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn overflow-y-auto">
      <div className="bg-white border border-blue-200 rounded-3xl max-w-4xl w-full shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
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

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 overflow-x-auto shrink-0 gap-2 py-2">
          {[
            { id: 'basics', label: 'Basic Info' },
            { id: 'pricing', label: 'Pricing & Deposit' },
            { id: 'blocks', label: 'Blocks & Capacity' },
            { id: 'amenities', label: 'Amenities & Facilities' },
            { id: 'rules', label: 'Rules & Policies' },
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

          {/* SECTION 2: PRICING */}
          {activeSection === 'pricing' && (
            <div className="space-y-4 animate-fadeIn">
              <h4 className="text-sm font-bold text-slate-900 border-b pb-2">Pricing Structure & Payment Terms</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Billing Frequency</label>
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
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {hostelType === 'Hotel' ? `Standard Room Rate (GHS / ${paymentFrequency})` :
                     hostelType === 'Inn' ? `Standard Room Rate (GHS / ${paymentFrequency})` :
                     hostelType === 'Estate' ? `Standard Unit Rent (GHS / ${paymentFrequency})` :
                     `Standard Room Fee (GHS / ${paymentFrequency})`}
                  </label>
                  <input
                    type="number"
                    required
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Refundable Security Deposit (GHS)</label>
                  <input
                    type="number"
                    value={securityDeposit}
                    onChange={(e) => setSecurityDeposit(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
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

          {/* SECTION 4: AMENITIES */}
          {activeSection === 'amenities' && (
            <div className="space-y-4 animate-fadeIn">
              <h4 className="text-sm font-bold text-slate-900 border-b pb-2">Verified Amenities & Facilities</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {DEFAULT_AMENITY_OPTIONS.map((item, idx) => {
                  const isChecked = amenities.includes(item);
                  return (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => toggleAmenity(item)}
                      className={`p-3 rounded-xl border text-left text-xs font-semibold flex items-center justify-between transition-all cursor-pointer ${
                        isChecked 
                          ? 'bg-blue-50 border-blue-300 text-blue-900 shadow-xs' 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>{item}</span>
                      <div className={`w-4 h-4 rounded flex items-center justify-center ${
                        isChecked ? 'bg-blue-600 text-white' : 'border border-slate-300'
                      }`}>
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Add custom amenity */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-1">Add Custom Amenity or Feature</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Rooftop Terrace / Solar Inverter"
                    value={customAmenity}
                    onChange={(e) => setCustomAmenity(e.target.value)}
                    className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomAmenity}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 5: RULES */}
          {activeSection === 'rules' && (
            <div className="space-y-4 animate-fadeIn">
              <h4 className="text-sm font-bold text-slate-900 border-b pb-2">Standard Residence Rules & Policies</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Curfew Policy</label>
                  <input
                    type="text"
                    value={curfew}
                    onChange={(e) => setCurfew(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Minimum Stay Requirement</label>
                  <input
                    type="text"
                    value={minStay}
                    onChange={(e) => setMinStay(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Visitor Policy</label>
                  <input
                    type="text"
                    value={visitorPolicy}
                    onChange={(e) => setVisitorPolicy(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Smoking / Campus Policy</label>
                  <input
                    type="text"
                    value={smokingPolicy}
                    onChange={(e) => setSmokingPolicy(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* SECTION 6: MANAGER */}
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
