import { sessionFetch as fetch } from '../lib/session';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  Building2,
  MapPin,
  Compass,
  Image as ImageIcon,
  Users,
  ShieldCheck,
  FileText,
  DollarSign,
  UserCheck,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Save,
  RotateCcw,
  AlertCircle,
  Plus,
  Trash2,
  Clock,
  Check,
  X,
  Eye,
  ExternalLink,
  Lock,
  Scale,
  Shield,
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileCheck
} from 'lucide-react';
import { HostelRegistrationDraft, HostelBlockConfig, BlockRoomTypeConfig, Hostel } from '../types';
import { safeJson } from '../lib/api';
import { validateHostelStreetAddress, validateDigitalAddress } from '../utils/formValidation';
import HostelMapPicker from './HostelMapPicker';
import HostelImageUploader from './HostelImageUploader';

const DRAFT_STORAGE_KEY = 'pinevela_hostel_registration_draft_v1';

// All standard university residence amenities in Ghana & Africa
const STANDARD_FACILITIES = [
  'Fiber-Optic Wi-Fi',
  'Standby Generator / Plant',
  '24/7 Uniformed Security',
  'CCTV Surveillance',
  'Borehole & Mechanized Water',
  'Air Conditioning',
  'Quiet Study Hall',
  'Student Kitchenettes',
  'Modern Laundry Deck',
  'Dining Hall / Cafeteria',
  'Indoor Games Arena',
  'Fitness Center / Gym',
  'Smart Biometric Access',
  'Fire Safety & Smoke Alarms',
  'Daily Sanitation & Cleaning',
  'Campus Shuttle Bus Service',
  'First Aid & Health Bay',
  'Car & Bicycle Parking'
];

export const getBillingFrequenciesForPropertyType = (wingOrType?: string) => {
  const t = (wingOrType || '').toLowerCase();
  if (t.includes('hotel')) {
    return [
      { label: 'Per Night (Standard Nightly Rate)', value: 'Per Night' },
      { label: 'Per Day (Daily Rate)', value: 'Per Day' },
      { label: 'Per Week (Weekly Extended Rate)', value: 'Per Week' },
      { label: 'Monthly (Extended Business Stay)', value: 'Monthly' }
    ];
  }
  if (t.includes('inn') || t.includes('guesthouse') || t.includes('bed & breakfast') || t.includes('motel') || t.includes('lounge')) {
    return [
      { label: 'Per Night (Nightly Rate)', value: 'Per Night' },
      { label: 'Per Day (Daily Rate)', value: 'Per Day' },
      { label: 'Per Week (Weekly Rate)', value: 'Per Week' },
      { label: 'Weekend Package (Fri-Sun Rate)', value: 'Weekend Package' },
      { label: 'Monthly (Long-stay Rate)', value: 'Monthly' }
    ];
  }
  if (t.includes('estate') || t.includes('apartment') || t.includes('condo') || t.includes('townhouse')) {
    return [
      { label: 'Monthly (Monthly Rent)', value: 'Monthly' },
      { label: 'Quarterly (Quarterly Term - 3 Months)', value: 'Quarterly' },
      { label: 'Bi-Annually (Half-Year - 6 Months)', value: 'Bi-Annually' },
      { label: 'Per Year / Annually (1 Year Lease)', value: 'Per Year' },
      { label: 'Per Week (Short-term Corporate Rent)', value: 'Per Week' }
    ];
  }
  // Default: Hostel / Student accommodation
  return [
    { label: 'Per Academic Year (Full Academic Session)', value: 'Per Academic Year' },
    { label: 'Per Semester (Academic Semester Term)', value: 'Per Semester' },
    { label: 'Monthly (Monthly Installment)', value: 'Monthly' },
    { label: 'Quarterly (Quarterly Term)', value: 'Quarterly' }
  ];
};

export const getDefaultBillingFrequencyForPropertyType = (wingOrType?: string) => {
  const t = (wingOrType || '').toLowerCase();
  if (t.includes('hotel') || t.includes('inn') || t.includes('guesthouse') || t.includes('motel') || t.includes('lounge')) {
    return 'Per Night';
  }
  if (t.includes('estate') || t.includes('apartment') || t.includes('condo') || t.includes('townhouse')) {
    return 'Monthly';
  }
  return 'Per Academic Year';
};

interface HostelRegistrationProps {
  onSuccess: (newHostel: Hostel) => void;
  onCancel: () => void;
  currentUserId?: string;
}

import { useAuth } from '../context/AuthContext';

export default function HostelRegistration({
  onSuccess,
  onCancel,
  currentUserId
}: HostelRegistrationProps) {
  const { user } = useAuth();
  
  // Master 10-Step Draft Initial State
  const initialDraftState: HostelRegistrationDraft = {
    // Step 1: Basic Info
    name: '',
    description: '',
    hostelType: 'Student accommodation',
    customHostelType: '',
    genderCategory: 'Mixed',
    status: 'Open',
    yearEstablished: new Date().getFullYear(),
    contactEmail: '',
    contactPhone: '',
    alternativePhone: '',
    website: '',
    wing: 'Hostel',

    // Step 2: Address
    addressLine1: '',
    addressLine2: '',
    city: 'Kumasi',
    region: 'Ashanti',
    customRegion: '',
    district: '',
    country: 'Ghana',
    postalCode: '',
    digitalAddress: '',
    landmark: '',
    campusProximity: '5-10 Mins Walk',
    campusProximityDetails: 'Shuttle & walking routes',

    // Step 2: Map Location
    latitude: 6.6745,
    longitude: -1.5716,
    formattedAddress: 'KNUST Campus, Ayeduase, Kumasi',
    isLocationConfirmed: true,

    // Step 3: Image
    imageFile: null,
    imageUrl: '',
    imagePreviewUrl: '',
    imagePath: '',
    imageStorageType: 'local',
    gallery: [],

    // Step 4: Capacity
    totalBlocks: 2,
    totalFloors: 4,
    totalRooms: 40,
    totalBeds: 120,
    maximumCapacity: 120,
    blocksList: [
      { id: 'block-1', name: 'Block A (Alpha)', floors: 4, totalRooms: 20, roomPrefix: 'A', startNum: 101, bedsPerRoom: 3 },
      { id: 'block-2', name: 'Block B (Beta)', floors: 4, totalRooms: 20, roomPrefix: 'B', startNum: 201, bedsPerRoom: 3 }
    ],

    // Step 5: Facilities
    facilities: [],
    customFacilities: [],

    // Step 6: Rules
    checkInTime: '10:00 AM',
    checkOutTime: '02:00 PM',
    minStay: '1 Semester',
    maxStay: '1 Academic Year',
    guestPolicy: 'Visitors permitted in common lobby only until 8:00 PM',
    curfew: '10:00 PM (Hostel main gate lock)',
    smokingPolicy: 'Strictly Non-Smoking',
    petPolicy: 'No Pets',
    noisePolicy: 'Strict silence hours observed between 10:00 PM and 6:00 AM',
    cancellationPolicy: 'Full refund 14 days before semester commencement, 50% thereafter',
    customRules: [],

    // Stay cycle
    paymentFrequency: 'Per Academic Year',

    // Step 8: Manager
    assignedManagerId: '',
    managerName: '',
    managerEmail: '',
    managerPhone: '',
    isNewManager: true,

    // Step 8: Confirmation
    agreeTerms: false,
    accuracyCertified: false
  };

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [formData, setFormData] = useState<HostelRegistrationDraft>(initialDraftState);
  const [hasLoadedDraft, setHasLoadedDraft] = useState(false);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionProgress, setSubmissionProgress] = useState<string>('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [registeredResult, setRegisteredResult] = useState<Hostel | null>(null);

  // Custom additions temporary states
  const [newFacilityInput, setNewFacilityInput] = useState('');
  const [newRuleInput, setNewRuleInput] = useState('');
  const [isTermsExpanded, setIsTermsExpanded] = useState(true);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Step names & icons definition
  const STEPS = [
    { num: 1, title: 'Basic Info', icon: Building2, desc: 'Identity & category' },
    { num: 2, title: 'Map Pin', icon: Compass, desc: 'Location, address & entrance' },
    { num: 3, title: 'Image Upload', icon: ImageIcon, desc: 'Property photograph' },
    { num: 4, title: 'Capacity', icon: Users, desc: 'Blocks, rooms & beds' },
    { num: 5, title: 'Facilities', icon: ShieldCheck, desc: 'Amenities & utilities' },
    { num: 6, title: 'Policies', icon: FileText, desc: 'Curfew, rules & refund' }
  ];

  // 1. Load draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const { defaultFee, securityDeposit, applicationFee, currency, ...currentDraft } = parsed;
          setFormData((prev) => ({
            ...initialDraftState,
            ...currentDraft,
            blocksList: Array.isArray(parsed.blocksList) && parsed.blocksList.length > 0 ? parsed.blocksList : initialDraftState.blocksList,
            facilities: Array.isArray(parsed.facilities) ? parsed.facilities : initialDraftState.facilities,
            customRules: Array.isArray(parsed.customRules) ? parsed.customRules : initialDraftState.customRules
          }));
          if (parsed.name) {
            setDraftBannerVisible(true);
          }
        }
      }
    } catch (e) {
      // ignore
    }
    setHasLoadedDraft(true);
  }, []);

  // 2. Auto-save draft into localStorage as user types
  const saveDraftToStorage = (data: HostelRegistrationDraft) => {
    try {
      const draftWithTime = { ...data, lastDraftSavedAt: new Date().toLocaleTimeString() };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftWithTime));
    } catch (e) {
      // ignore
    }
  };

  const updateFormData = (updates: Partial<HostelRegistrationDraft>) => {
    setFormData((prev) => {
      const next = { ...prev, ...updates };
      saveDraftToStorage(next);
      return next;
    });
    // Clear validation error if field was fixed
    setValidationErrors((prev) => {
      const next = { ...prev };
      for (const k in updates) {
        delete next[k];
      }
      return next;
    });
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
    setFormData(initialDraftState);
    setDraftBannerVisible(false);
    setCurrentStep(1);
    setValidationErrors({});
  };

  // Step Validation logic
  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.name.trim()) errors.name = 'Hostel name is required';
      if (!formData.contactEmail.trim() || !formData.contactEmail.includes('@')) {
        errors.contactEmail = 'Valid contact email is required';
      }
      if (!formData.contactPhone.trim()) errors.contactPhone = 'Contact phone number is required';
    } else if (step === 3) {
      if (!formData.imageUrl && !formData.imagePreviewUrl) {
        errors.image = 'You must upload an actual photograph of your residence exterior.';
      }
      const galleryCount = (formData.gallery || []).length;
      if (galleryCount < 1) {
        errors.image = (errors.image ? errors.image + ' ' : '') + `You must upload a minimum of 1 interior or relevant residence photo (currently ${galleryCount}/1 uploaded, max 3).`;
      } else if (galleryCount > 3) {
        errors.image = `A maximum of 3 interior or relevant residence photos is allowed (currently ${galleryCount}/3 uploaded).`;
      }
    } else if (step === 4) {
      if (!formData.maximumCapacity || formData.maximumCapacity <= 0) {
        errors.maximumCapacity = 'Total capacity must be greater than 0. Please configure room types with bedspaces.';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < 6) {
        setCurrentStep((prev) => prev + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Number Input Formatting Helpers (Problem 12)
  const renderNumberInputValue = (num: number | string | undefined | null): string => {
    if (num === 0 || num === '0' || num === '' || num === null || num === undefined) {
      return '';
    }
    return String(num);
  };

  const parseCleanNumberInput = (raw: string): number => {
    if (!raw || raw.trim() === '') return 0;
    const clean = raw.replace(/^0+(?=\d)/, '');
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Block & Room Type recalculation
  const recalculateBlockTotals = (blocks: HostelBlockConfig[]) => {
    let grandTotalRooms = 0;
    let grandTotalBeds = 0;

    const updatedBlocks = blocks.map((b) => {
      const roomTypes = b.roomTypes && b.roomTypes.length > 0 ? b.roomTypes : [
        {
          id: `rt-default-${b.id}`,
          typeName: `${b.bedsPerRoom || 2} in 1 Room`,
          bedsPerRoom: b.bedsPerRoom || 2,
          totalRooms: b.totalRooms || 10,
        }
      ];

      const blockTotalRooms = roomTypes.reduce((sum, rt) => sum + (rt.totalRooms || 0), 0);
      const blockTotalBeds = roomTypes.reduce((sum, rt) => sum + (rt.totalRooms || 0) * (rt.bedsPerRoom || 1), 0);

      grandTotalRooms += blockTotalRooms;
      grandTotalBeds += blockTotalBeds;

      return {
        ...b,
        gender: b.gender || 'Mixed',
        totalRooms: blockTotalRooms,
        bedsPerRoom: roomTypes[0]?.bedsPerRoom || b.bedsPerRoom || 2,
        roomTypes
      };
    });

    updateFormData({
      blocksList: updatedBlocks,
      totalBlocks: updatedBlocks.length,
      totalRooms: grandTotalRooms,
      totalBeds: grandTotalBeds,
      maximumCapacity: grandTotalBeds
    });
  };

  // Block handlers
  const handleAddBlock = () => {
    const nextIdx = formData.blocksList.length + 1;
    const blockLetter = String.fromCharCode(64 + nextIdx);
    const newBlock: HostelBlockConfig = {
      id: `block-${Date.now()}`,
      name: `Block ${blockLetter}`,
      gender: 'Mixed',
      floors: 3,
      totalRooms: 15,
      roomPrefix: blockLetter,
      startNum: nextIdx * 100 + 1,
      bedsPerRoom: 2,
      roomTypes: [
        { id: `rt-${Date.now()}-1`, typeName: '2 in 1 Room', bedsPerRoom: 2, totalRooms: 10 },
        { id: `rt-${Date.now()}-2`, typeName: '1 in 1 Room', bedsPerRoom: 1, totalRooms: 5 }
      ]
    };
    const nextBlocks = [...formData.blocksList, newBlock];
    recalculateBlockTotals(nextBlocks);
  };

  const handleRemoveBlock = (id: string) => {
    if (formData.blocksList.length <= 1) return;
    const nextBlocks = formData.blocksList.filter((b) => b.id !== id);
    recalculateBlockTotals(nextBlocks);
  };

  const handleBlockChange = (id: string, field: keyof HostelBlockConfig, value: any) => {
    const nextBlocks = formData.blocksList.map((b) => {
      if (b.id === id) {
        return { ...b, [field]: value };
      }
      return b;
    });
    recalculateBlockTotals(nextBlocks);
  };

  // Room Type Handlers (Problem 9 & 10)
  const handleAddRoomType = (blockId: string) => {
    const nextBlocks = formData.blocksList.map((b) => {
      if (b.id === blockId) {
        const currentTypes = b.roomTypes || [];
        const nextBeds = Math.min(4, currentTypes.length + 1);
        const newRt = {
          id: `rt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          typeName: `${nextBeds} in 1 Room`,
          bedsPerRoom: nextBeds,
          totalRooms: 5,
        };
        return { ...b, roomTypes: [...currentTypes, newRt] };
      }
      return b;
    });
    recalculateBlockTotals(nextBlocks);
  };

  const handleRemoveRoomType = (blockId: string, roomTypeId: string) => {
    const nextBlocks = formData.blocksList.map((b) => {
      if (b.id === blockId) {
        const currentTypes = b.roomTypes || [];
        if (currentTypes.length <= 1) return b;
        return { ...b, roomTypes: currentTypes.filter((rt) => rt.id !== roomTypeId) };
      }
      return b;
    });
    recalculateBlockTotals(nextBlocks);
  };

  const handleRoomTypeChange = (blockId: string, roomTypeId: string, field: keyof BlockRoomTypeConfig, value: any) => {
    const nextBlocks = formData.blocksList.map((b) => {
      if (b.id === blockId) {
        const currentTypes = (b.roomTypes || []).map((rt) => {
          if (rt.id === roomTypeId) {
            const updated = { ...rt, [field]: value };
            if (field === 'typeName' && typeof value === 'string') {
              if (value.startsWith('1 in 1')) updated.bedsPerRoom = 1;
              else if (value.startsWith('2 in 1')) updated.bedsPerRoom = 2;
              else if (value.startsWith('3 in 1')) updated.bedsPerRoom = 3;
              else if (value.startsWith('4 in 1')) updated.bedsPerRoom = 4;
            }
            return updated;
          }
          return rt;
        });
        return { ...b, roomTypes: currentTypes };
      }
      return b;
    });
    recalculateBlockTotals(nextBlocks);
  };

  // Facility toggle
  const toggleFacility = (facility: string) => {
    const exists = formData.facilities.includes(facility);
    const next = exists
      ? formData.facilities.filter((f) => f !== facility)
      : [...formData.facilities, facility];
    updateFormData({ facilities: next });
  };

  const addCustomFacility = () => {
    if (!newFacilityInput.trim()) return;
    const val = newFacilityInput.trim();
    if (!formData.facilities.includes(val) && !formData.customFacilities.includes(val)) {
      updateFormData({
        facilities: [...formData.facilities, val],
        customFacilities: [...formData.customFacilities, val]
      });
    }
    setNewFacilityInput('');
  };

  // Custom rule adder
  const addCustomRule = () => {
    if (!newRuleInput.trim()) return;
    updateFormData({
      customRules: [...formData.customRules, newRuleInput.trim()]
    });
    setNewRuleInput('');
  };

  const removeCustomRule = (idx: number) => {
    const next = [...formData.customRules];
    next.splice(idx, 1);
    updateFormData({ customRules: next });
  };

  // Final Atomic Submission
  const handleFinalSubmit = async () => {
    if (!validateStep(9)) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmissionProgress('Initiating atomic hostel registration...');

    try {
      const token = '';

      // 1. Upload Image to Storage (Local storage)
      let finalImageUrl = formData.imageUrl;
      let finalImagePath = formData.imagePath;

      if (formData.imagePreviewUrl && formData.imagePreviewUrl.startsWith('data:')) {
        setSubmissionProgress('Uploading high-resolution hostel exterior photograph...');
        const uploadResp = await fetch('/api/storage/upload-hostel-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            fileName: `${(formData.name || 'hostel').toLowerCase().replace(/[^a-z0-9]/g, '-')}-facade.jpg`,
            fileType: 'image/jpeg',
            fileData: formData.imagePreviewUrl
          })
        });

        const uploadResult = await safeJson(uploadResp);
        if (!uploadResp.ok || !uploadResult.success || !uploadResult.imageUrl) {
          throw new Error(uploadResult.error || 'The photograph could not be uploaded. Please select a valid image and try again.');
        }
        finalImageUrl = uploadResult.imageUrl;
        finalImagePath = uploadResult.imagePath;
      }

      // 2. Atomic Database Insertion into persistent store
      setSubmissionProgress('Creating hostel record in persistent database...');

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || 'Modern student accommodation community.',
        wing: formData.wing,
        status: formData.status,
        hostelType: formData.hostelType,
        genderCategory: formData.genderCategory,
        yearEstablished: formData.yearEstablished,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
        alternativePhone: formData.alternativePhone,
        website: formData.website,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2,
        city: formData.city,
        region: formData.region === 'Other' ? (formData.customRegion || 'Other') : formData.region,
        district: formData.district,
        country: formData.country,
        postalCode: formData.postalCode,
        digitalAddress: formData.digitalAddress,
        landmark: formData.landmark,
        campusProximity: formData.campusProximity || '5-10 Mins Walk',
        campusProximityDetails: formData.campusProximityDetails || 'Shuttle & walking routes',
        latitude: formData.latitude,
        longitude: formData.longitude,
        imageUrl: finalImageUrl,
        image: finalImageUrl,
        exteriorPhotoUrl: finalImageUrl,
        imagePath: finalImagePath,
        gallery: formData.gallery || [finalImageUrl],
        hostelName: formData.name.trim(),
        totalCapacity: formData.maximumCapacity,
        capacity: formData.maximumCapacity,
        totalBeds: formData.maximumCapacity,
        totalBlocks: formData.totalBlocks,
        totalFloors: formData.totalFloors,
        totalRooms: formData.totalRooms,
        blocksList: formData.blocksList,
        facilities: formData.facilities,
        rules: {
          checkInTime: formData.checkInTime,
          checkOutTime: formData.checkOutTime,
          minStay: formData.minStay,
          maxStay: formData.maxStay,
          guestPolicy: formData.guestPolicy,
          curfew: formData.curfew,
          smokingPolicy: formData.smokingPolicy,
          petPolicy: formData.petPolicy,
          noisePolicy: formData.noisePolicy,
          cancellationPolicy: formData.cancellationPolicy,
          customRules: formData.customRules
        },
        managerId: currentUserId || user?.id || `MGR-${Date.now()}`,
        managerName: user?.name || formData.managerName || 'Anthony Davis',
        managerEmail: user?.email || formData.managerEmail || 'manager@pinevela.com',
        managerPhone: user?.phone || formData.managerPhone || formData.contactPhone || '+233 24 123 4567',
        managerPhoto: user?.photo || user?.avatar || (user as any)?.photoUrl || (user as any)?.avatarUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
        assignedManagerId: currentUserId || user?.id || ''
      };

      const res = await fetch('/api/hostels/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await safeJson(res);
        throw new Error(errData.error || 'Failed to complete hostel registration');
      }

      const responseData = await safeJson(res);
      const createdHostel: Hostel = responseData.hostel;

      setSubmissionProgress('Finalizing setup and cleaning up temporary drafts...');

      // 3. Clear draft in localStorage
      localStorage.removeItem(DRAFT_STORAGE_KEY);

      // 4. Trigger celebration confetti
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (e) {
        // ignore
      }

      setRegisteredResult(createdHostel);
      setIsSubmitting(false);
      onSuccess(createdHostel);
    } catch (err: any) {
      console.error('Registration failed:', err);
      setSubmitError(err.message || 'An unexpected error occurred during registration.');
      setIsSubmitting(false);
    }
  };

  // If successfully registered, show interactive success card
  if (registeredResult) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6 text-center space-y-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500 text-white flex items-center justify-center shadow-xl shadow-emerald-500/30"
        >
          <CheckCircle2 size={42} />
        </motion.div>

        <div className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
            Registration Complete
          </span>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">
            {registeredResult.name} is Live!
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            The hostel record has been created in the database with all {formData.blocksList.length} blocks,
            amenities, manager assignments, and uploaded photography.
          </p>
        </div>

        {/* Hostel Quick Details Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm text-left max-w-xl mx-auto space-y-4">
          <div className="flex items-center gap-4">
            <img
              src={registeredResult?.image || registeredResult?.imageUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80'}
              alt={registeredResult?.name || 'Hostel'}
              className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0"
            />
            <div>
              <h4 className="font-extrabold text-slate-900 text-base">{registeredResult.name}</h4>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <MapPin size={13} className="text-blue-600" />
                {registeredResult.location}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] font-bold bg-blue-50 text-blue-900 px-2 py-0.5 rounded border border-blue-200">
                  {registeredResult.totalCapacity} Total Beds
                </span>
                <span className="text-[11px] font-bold bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                  Status: {registeredResult.status}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Assigned Manager</span>
              <span className="font-bold text-slate-800">{registeredResult.managerName}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Database ID</span>
              <span className="font-mono text-[11px] text-slate-600">{registeredResult.id}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
          <button
            onClick={onCancel}
            className="w-full sm:w-auto px-6 py-3 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>Return to Hostels Portfolio</span>
            <ArrowRight size={16} />
          </button>
          <button
            onClick={() => {
              setRegisteredResult(null);
              clearDraft();
            }}
            className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            Register Another Property
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto py-4 px-4 sm:px-6 space-y-6">
      {/* Draft Saved Banner / Warning */}
      {draftBannerVisible && (
        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-900 shrink-0">
            </div>
            <div>
              <p className="text-xs font-bold text-amber-900">
                Temporary Frontend Draft Active • Uncommitted State
              </p>
              <p className="text-[11px] text-amber-700">
                You are currently editing a local draft. No data has been inserted into the database.
                {formData.lastDraftSavedAt && ` Last saved locally at ${formData.lastDraftSavedAt}.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              onClick={() => setDraftBannerVisible(false)}
              className="px-3 py-1.5 bg-amber-200/60 hover:bg-amber-200 text-amber-900 text-xs font-bold rounded-lg transition-colors"
            >
              Keep Editing
            </button>
            <button
              onClick={clearDraft}
              className="px-3 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition-colors"
            >
              Discard Draft
            </button>
          </div>
        </div>
      )}

      {/* Header Bar with Step Progress */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-left space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-blue-900 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
              Admin Workflow
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1.5">
              Multi-Step Resident Onboarding
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete all 6 registration steps. Submission commits atomically to the persistent database on the final step.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearDraft}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-bold transition-colors shadow-2xs"
              title="Reset form"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
              title="Close registration"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 6 Step Progress Nav */}
        <div className="overflow-x-auto pb-2 -mx-2 px-2 no-scrollbar">
          <div className="flex items-center gap-2 min-w-max">
            {STEPS.map((s) => {
              const Icon = s.icon;
              const isActive = currentStep === s.num;
              const isPassed = currentStep > s.num;

              return (
                <button
                  key={s.num}
                  type="button"
                  onClick={() => {
                    // Allow jumping back to earlier steps or current step
                    if (s.num <= currentStep) {
                      setCurrentStep(s.num);
                    }
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-blue-900 text-white shadow-sm ring-2 ring-blue-900/20'
                      : isPassed
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-50 text-slate-400 border border-slate-200/60 cursor-not-allowed'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                      isActive
                        ? 'bg-white text-blue-900'
                        : isPassed
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isPassed ? <Check size={11} strokeWidth={3} /> : s.num}
                  </span>
                  <div className="text-left">
                    <p className="leading-tight text-[11px] whitespace-nowrap">{s.title}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Step Form Body */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm text-left">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="space-y-6"
          >
            {/* STEP 1: BASIC INFORMATION */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Step 1: Basic Information</h3>
                  <p className="text-xs text-slate-500">Provide the property name, legal category, and public contact information.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Resident Property Type <span className="text-rose-500">*</span></label>
                    <select
                      value={formData.wing}
                      onChange={(e: any) => {
                        const val = e.target.value;
                        let defaultHType = 'Student accommodation';
                        let defaultFreq = 'Per Academic Year';
                        let defaultMinStay = '1 Semester';
                        let defaultMaxStay = '1 Academic Year';
                        let defaultCancellation = 'Full refund 14 days before semester commencement, 50% thereafter';
                        let defaultCurfew = '10:00 PM (Hostel main gate lock)';

                        if (val === 'Inn') {
                          defaultHType = 'Guesthouse / Inn';
                          defaultFreq = 'Per Night';
                          defaultMinStay = '1 Night';
                          defaultMaxStay = '14 Nights';
                          defaultCancellation = 'Free cancellation up to 48 hours prior to check-in date.';
                          defaultCurfew = '11:00 PM (Host / Manager on duty)';
                        } else if (val === 'Hotel') {
                          defaultHType = 'Hotel / Commercial';
                          defaultFreq = 'Per Night';
                          defaultMinStay = '1 Night';
                          defaultMaxStay = '30 Nights';
                          defaultCancellation = 'Free cancellation up to 24 hours prior to check-in date.';
                          defaultCurfew = '24/7 Front Desk & Electronic Keycard Access';
                        } else if (val === 'Estate') {
                          defaultHType = 'Residential Estate / Apartment';
                          defaultFreq = 'Monthly';
                          defaultMinStay = '1 Month';
                          defaultMaxStay = '1 Year';
                          defaultCancellation = '1-month advance written notice required prior to lease termination.';
                          defaultCurfew = '24/7 Gated Security & Perimeter Patrol';
                        }

                        updateFormData({ 
                          wing: val,
                          hostelType: defaultHType,
                          paymentFrequency: defaultFreq,
                          minStay: defaultMinStay,
                          maxStay: defaultMaxStay,
                          cancellationPolicy: defaultCancellation,
                          curfew: defaultCurfew
                        });
                      }}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                    >
                      <option value="Hostel">Hostel (Student & Academic)</option>
                      <option value="Inn">Inn (Guesthouse & Short-stay)</option>
                      <option value="Hotel">Hotel (Commercial Lodging)</option>
                      <option value="Estate">Estate (Residential Apartments)</option>
                    </select>
                  </div>


                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      {formData.wing === 'Hostel' ? 'Hostel Official Name' : 
                       formData.wing === 'Inn' ? 'Inn / Guesthouse Official Name' :
                       formData.wing === 'Hotel' ? 'Hotel Official Name' : 'Estate / Apartment Name'} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder={formData.wing === 'Hostel' ? 'e.g. Pine Crest Residency, Emerald Heights' :
                                   formData.wing === 'Inn' ? 'e.g. The Travelers Inn, Cozy Guesthouse' :
                                   formData.wing === 'Hotel' ? 'e.g. PineVela Luxury Suites' : 'e.g. Royal Palms Residential Estate'}
                      value={formData.name}
                      onChange={(e) => updateFormData({ name: e.target.value })}
                      className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800 ${
                        validationErrors.name ? 'border-rose-400 bg-rose-50/30' : 'border-slate-200'
                      }`}
                    />
                    {validationErrors.name && (
                      <p className="text-[11px] text-rose-600 font-semibold">{validationErrors.name}</p>
                    )}
                  </div>


                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Public Contact Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      placeholder="info@hostelname.com"
                      value={formData.contactEmail}
                      onChange={(e) => updateFormData({ contactEmail: e.target.value })}
                      className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800 ${
                        validationErrors.contactEmail ? 'border-rose-400 bg-rose-50/30' : 'border-slate-200'
                      }`}
                    />
                    {validationErrors.contactEmail && (
                      <p className="text-[11px] text-rose-600 font-semibold">{validationErrors.contactEmail}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Primary Contact Phone <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="+233 24 000 0000"
                      value={formData.contactPhone}
                      onChange={(e) => updateFormData({ contactPhone: e.target.value })}
                      className={`w-full px-3.5 py-2.5 bg-slate-50 border rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800 ${
                        validationErrors.contactPhone ? 'border-rose-400 bg-rose-50/30' : 'border-slate-200'
                      }`}
                    />
                    {validationErrors.contactPhone && (
                      <p className="text-[11px] text-rose-600 font-semibold">{validationErrors.contactPhone}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Alternative Phone (Optional)</label>
                    <input
                      type="tel"
                      placeholder="+233 50 000 0000"
                      value={formData.alternativePhone}
                      onChange={(e) => updateFormData({ alternativePhone: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                    />
                  </div>

                </div>
              </div>
            )}

            {/* STEP 2: INTERACTIVE MAP LOCATION */}
            {currentStep === 2 && (
                <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Step 2: Interactive Map Location</h3>
                  <p className="text-xs text-slate-500">
                    Pinpoint the exact physical entrance using the Leaflet OpenStreetMap view. {formData.wing === 'Hostel' ? 'Students' : formData.wing === 'Inn' || formData.wing === 'Hotel' ? 'Guests' : 'Residents'} will use this for real navigation.
                  </p>
                </div>

                <HostelMapPicker
                  latitude={formData.latitude}
                  longitude={formData.longitude}
                  initialAddressHint={`${formData.addressLine1}, ${formData.city}`}
                  onLocationSelect={({ lat, lng, addressSnippet, city, region }) => {
                    updateFormData({
                      latitude: lat,
                      longitude: lng,
                      formattedAddress: addressSnippet || formData.formattedAddress,
                      addressLine1: addressSnippet || formData.addressLine1,
                      city: city || formData.city,
                      region: region || formData.region,
                      isLocationConfirmed: true
                    });
                  }}
                />
              </div>
            )}

            {/* STEP 4: HOSTEL IMAGE UPLOADER */}
            {currentStep === 3 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Step 3: Residence Photos</h3>

                </div>

                {validationErrors.image && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                    {validationErrors.image}
                  </div>
                )}

                <HostelImageUploader
                  currentImageUrl={formData.imageUrl}
                  imagePreviewUrl={formData.imagePreviewUrl}
                  galleryUrls={formData.gallery || []}
                  propertyName={formData.name || 'Residence'}
                  onImageSelected={({ file, previewUrl, fileName, fileType }) => {
                    updateFormData({
                      imageFile: file,
                      imagePreviewUrl: previewUrl,
                      imageUrl: previewUrl
                    });
                  }}
                  onImageRemoved={() => {
                    updateFormData({
                      imageFile: null,
                      imagePreviewUrl: '',
                      imageUrl: ''
                    });
                  }}
                  onGalleryUpdated={(urls) => {
                    updateFormData({
                      gallery: urls
                    });
                  }}
                />
              </div>
            )}

            {/* STEP 5: CAPACITY & BLOCK STRUCTURE */}
            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Step 4: Capacity & Block Structure</h3>
                    <p className="text-xs text-slate-500">
                      Configure residential blocks, gender designation per block, and specific room types / bedspaces (1 in 1, 2 in 1, 3 in 1, etc.).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-blue-950 bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl">
                      Total Calculated Capacity: {formData.maximumCapacity} {formData.wing === 'Hostel' ? 'Beds' : formData.wing === 'Inn' || formData.wing === 'Hotel' ? 'Sleeps/Guests' : 'Residents'}
                    </span>
                  </div>
                </div>

                {validationErrors.maximumCapacity && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                    {validationErrors.maximumCapacity}
                  </div>
                )}

                {/* Blocks Builder List */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">
                        Configured Residential Blocks ({formData.blocksList.length})
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Set gender designation and room type bedspaces (1 in 1, 2 in 1, 3 in 1, 4 in 1) for each block.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddBlock}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Add Another Block</span>
                    </button>
                  </div>

                  <div className="space-y-5">
                    {formData.blocksList.map((block, idx) => {
                      const roomTypes = block.roomTypes && block.roomTypes.length > 0 ? block.roomTypes : [];
                      const blockTotalRooms = roomTypes.reduce((acc, rt) => acc + (rt.totalRooms || 0), 0);
                      const blockBeds = roomTypes.reduce((acc, rt) => acc + (rt.totalRooms || 0) * (rt.bedsPerRoom || 1), 0);

                      return (
                        <div
                          key={block.id}
                          className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 text-left transition-all hover:border-blue-200 hover:shadow-xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-blue-900 text-white font-black text-xs flex items-center justify-center shadow-xs">
                                {block.roomPrefix || String.fromCharCode(65 + idx)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-900">{block.name || `Block ${String.fromCharCode(65 + idx)}`}</span>
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${
                                    block.gender === 'Female' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                                    block.gender === 'Male' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    'bg-purple-50 text-purple-700 border-purple-200'
                                  }`}>
                                    {block.gender || 'Mixed'} Block
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-500 block">Prefix: {block.roomPrefix}{block.startNum || (idx + 1) * 100 + 1}+ • {block.floors || 1} Floors</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs font-extrabold text-blue-900 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                                {blockBeds} Total Bedspaces ({blockTotalRooms} Rooms)
                              </span>
                              {formData.blocksList.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBlock(block.id)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                  title="Delete block"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-start">
                            {/* Block Name */}
                            <div className="sm:col-span-4 space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                Block / Section Name
                              </label>
                              <input
                                type="text"
                                value={block.name}
                                onChange={(e) => handleBlockChange(block.id, 'name', e.target.value)}
                                placeholder="e.g. Block A (Alpha Wing)"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900"
                              />
                            </div>

                            {/* Block Gender Designation */}
                            <div className="sm:col-span-4 space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                                Block Gender Designation <span className="text-rose-500">*</span>
                              </label>
                              <select
                                value={block.gender || 'Mixed'}
                                onChange={(e) => handleBlockChange(block.id, 'gender', e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900"
                              >
                                <option value="Mixed">Mixed / Co-Ed Wing</option>
                                <option value="Male">Male Students Only</option>
                                <option value="Female">Female Students Only</option>
                              </select>
                            </div>

                            {/* Floors */}
                            <div className="sm:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                Floors
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={renderNumberInputValue(block.floors)}
                                onChange={(e) => handleBlockChange(block.id, 'floors', parseCleanNumberInput(e.target.value))}
                                placeholder="Floors"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900"
                              />
                            </div>

                            {/* Room Prefix */}
                            <div className="sm:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                Room Prefix
                              </label>
                              <input
                                type="text"
                                value={block.roomPrefix}
                                onChange={(e) => handleBlockChange(block.id, 'roomPrefix', e.target.value)}
                                placeholder="e.g. A"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900"
                              />
                            </div>
                          </div>

                          {/* ROOM TYPES & BEDSPACES SECTION INSIDE BLOCK */}
                          <div className="pt-3 border-t border-slate-200/80 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-xs font-black text-slate-800 uppercase tracking-wider block">
                                  Room Types & Bedspace Configurations in {block.name || 'this Block'}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  Define distinct room types (e.g. 1 in 1, 2 in 1, 3 in 1, 4 in 1) and bedspaces for this block.
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddRoomType(block.id)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs font-bold transition-all cursor-pointer"
                              >
                                <Plus size={13} />
                                <span>Add Room Type / Bedspace</span>
                              </button>
                            </div>

                            <div className="space-y-2.5">
                              {(block.roomTypes || []).map((rt, rtIdx) => (
                                <div key={rt.id} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                                  {/* Room Type Selector / Name */}
                                  <div className="sm:col-span-7 space-y-1">
                                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                      Room Type / Bedspace #{rtIdx + 1}
                                    </label>
                                    <select
                                      value={rt.typeName.startsWith('1 in 1') ? '1 in 1 Room' :
                                             rt.typeName.startsWith('2 in 1') ? '2 in 1 Room' :
                                             rt.typeName.startsWith('3 in 1') ? '3 in 1 Room' :
                                             rt.typeName.startsWith('4 in 1') ? '4 in 1 Room' : rt.typeName}
                                      onChange={(e) => {
                                        handleRoomTypeChange(block.id, rt.id, 'typeName', e.target.value);
                                      }}
                                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                                    >
                                      <option value="1 in 1 Room">1 in 1 Room (1 Bed / Single Bedspace)</option>
                                      <option value="2 in 1 Room">2 in 1 Room (2 Beds / Double Bedspace)</option>
                                      <option value="3 in 1 Room">3 in 1 Room (3 Beds / Triple Bedspace)</option>
                                      <option value="4 in 1 Room">4 in 1 Room (4 Beds / Quad Bedspace)</option>
                                    </select>
                                  </div>

                                  {/* Total Rooms of this type */}
                                  <div className="sm:col-span-4 space-y-1">
                                    <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                      No. of Rooms
                                    </label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={renderNumberInputValue(rt.totalRooms)}
                                      onChange={(e) => handleRoomTypeChange(block.id, rt.id, 'totalRooms', parseCleanNumberInput(e.target.value))}
                                      placeholder="Rooms"
                                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                                    />
                                  </div>


                                  {/* Action */}
                                  <div className="sm:col-span-1 flex items-center justify-end pt-3 sm:pt-0">
                                    {(block.roomTypes || []).length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveRoomType(block.id, rt.id)}
                                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                        title="Remove room type"
                                      >
                                        <Trash2 size={15} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Capacity Breakdown Card */}
                <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-950">
                  <div className="space-y-0.5">
                    <span className="font-extrabold text-sm block">
                      {formData.blocksList.length} Blocks • {formData.totalRooms} Total Rooms • {formData.maximumCapacity} Bedspaces
                    </span>
                    <span className="text-[11px] text-blue-800">
                      Block & Gender summary:{' '}
                      {formData.blocksList.map((b) => `:  ()`).join(' • ')}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] font-bold uppercase text-blue-700 block">Total Residential Capacity</span>
                    <span className="text-lg font-black text-blue-950">{formData.maximumCapacity} Bedspaces</span>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 6: FACILITIES & AMENITIES */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Step 5: Facilities & Amenities</h3>
                  <p className="text-xs text-slate-500">
                    Select verified facilities and utilities provided on the hostel property.
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {STANDARD_FACILITIES.map((facility) => {
                    const isSelected = formData.facilities.includes(facility);
                    return (
                      <button
                        key={facility}
                        type="button"
                        onClick={() => toggleFacility(facility)}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-left text-xs font-bold transition-all ${
                          isSelected
                            ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100/80'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 ${
                            isSelected ? 'bg-white text-blue-900' : 'border border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </div>
                        <span className="truncate">{facility}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Add Custom Facility Input */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    placeholder="Add custom amenity or specialized utility..."
                    value={newFacilityInput}
                    onChange={(e) => setNewFacilityInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addCustomFacility();
                      }
                    }}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={addCustomFacility}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-colors shrink-0"
                  >
                    Add Amenity
                  </button>
                </div>
              </div>
            )}

            {/* STEP 7: RULES & POLICIES */}
            {currentStep === 6 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-black text-slate-900 tracking-tight">Step 6: Rules & Policies</h3>
                  <p className="text-xs text-slate-500">Define curfew times, visitor guidelines, quiet hours, and cancellation terms.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Night Curfew / Gate Closure</label>
                    <input
                      type="text"
                      value={formData.curfew}
                      onChange={(e) => updateFormData({ curfew: e.target.value })}
                      placeholder="e.g. 10:00 PM (Main Gate Closes)"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Visitor & Guest Policy</label>
                    <input
                      type="text"
                      value={formData.guestPolicy}
                      onChange={(e) => updateFormData({ guestPolicy: e.target.value })}
                      placeholder="e.g. Guests permitted in lobby only until 8:00 PM"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Smoking Policy</label>
                    <select
                      value={formData.smokingPolicy}
                      onChange={(e: any) => updateFormData({ smokingPolicy: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                    >
                      <option value="Strictly Non-Smoking">Strictly Non-Smoking (Entire Property)</option>
                      <option value="Designated Areas Only">Designated Outdoor Areas Only</option>
                      <option value="Prohibited">Prohibited Under Penalty of Eviction</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Pet Policy</label>
                    <select
                      value={formData.petPolicy}
                      onChange={(e: any) => updateFormData({ petPolicy: e.target.value })}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                    >
                      <option value="No Pets">No Pets Allowed</option>
                      <option value="Service Animals Only">Service / Guide Animals Only</option>
                      <option value="Allowed with Approval">Small Pets with Prior Written Approval</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Quiet Hours & Noise Policy</label>
                    <input
                      type="text"
                      value={formData.noisePolicy}
                      onChange={(e) => updateFormData({ noisePolicy: e.target.value })}
                      placeholder="e.g. Quiet study hours observed strictly from 10:00 PM to 6:00 AM"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                    />
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Refund & Cancellation Terms</label>
                    <textarea
                      rows={2}
                      value={formData.cancellationPolicy}
                      onChange={(e) => updateFormData({ cancellationPolicy: e.target.value })}
                      placeholder="Cancellation terms before and after semester begins..."
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                    />
                  </div>
                </div>

                {/* Custom Rules List */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <span className="text-xs font-bold text-slate-700">Specialized House Rules</span>
                  {formData.customRules.length > 0 && (
                    <div className="space-y-1.5">
                      {formData.customRules.map((rule, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 text-xs text-slate-800">
                          <span>• {rule}</span>
                          <button
                            type="button"
                            onClick={() => removeCustomRule(idx)}
                            className="text-rose-500 hover:text-rose-700 p-1"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. No high-power heating elements (hot plates) in rooms..."
                      value={newRuleInput}
                      onChange={(e) => setNewRuleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomRule();
                        }
                      }}
                      className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 text-slate-800"
                    />
                    <button
                      type="button"
                      onClick={addCustomRule}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold"
                    >
                      Add Rule
                    </button>
                  </div>
                </div>
              </div>
            )}

        {/* Bottom Navigation Buttons */}
        <div className="border-t border-slate-100 pt-6 mt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleBack}
              disabled={currentStep === 1 || isSubmitting}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                currentStep === 1 || isSubmitting
                  ? 'opacity-40 cursor-not-allowed text-slate-400 border-slate-200'
                  : 'text-slate-700 border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <ArrowLeft size={15} />
              <span>Previous Step</span>
            </button>
            <button
              type="button"
              onClick={() => {
                saveDraftToStorage(formData);
                onCancel();
              }}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors"
            >
              <Save size={15} />
              <span>Save & Exit</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            {currentStep < 6 ? (
              <button
                type="button"
                onClick={handleNext}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition-all hover:scale-102"
              >
                <span>Continue to {STEPS[currentStep].title}</span>
                <ArrowRight size={15} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-xs font-extrabold transition-all ${
                  isSubmitting
                    ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 hover:scale-102 cursor-pointer'
                }`}
                title={
                  isSubmitting
                    ? 'Please wait while the registration is submitted'
                    : 'Submit and register hostel'
                }
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing Atomic Submission...</span>
                  </>
                ) : isSubmitting ? (
                  <>
                    <Lock size={15} className="text-slate-400" />
                    <span>Submit & Register Hostel (Locked)</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} />
                    <span>Submit & Register Hostel</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
        </AnimatePresence>
    </div>
    </div>
  );
}
