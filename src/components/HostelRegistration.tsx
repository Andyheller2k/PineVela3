import InternationalPhoneInput from './InternationalPhoneInput';
import { internationalPhone, phoneDraft } from '../../internationalPhone';
import { activeHostelFields } from '../../hostelRegistrationFields';
import OnboardingProgress from './OnboardingProgress';
import { usesSupabasePersistence } from '../lib/persistence';
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
  const [residenceId,setResidenceId] = useState<string | null>(null);
  
  // Four-step residence registration draft
  const initialDraftState: HostelRegistrationDraft = {
    // Step 1: Basic Info
    name: '',
    description: '',
    hostelType: 'Student accommodation',
    customHostelType: '',
    genderCategory: 'Mixed',
    status: 'Open',
    yearEstablished: usesSupabasePersistence ? 0 : new Date().getFullYear(),
    contactEmail: '',
    contactPhone: '',
    contactPhoneCountry: 'GH',
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
    campusProximity: usesSupabasePersistence ? '' : '5-10 Mins Walk',
    campusProximityDetails: usesSupabasePersistence ? '' : 'Shuttle & walking routes',

    // Step 2: Map Location
    latitude: usesSupabasePersistence ? undefined : 6.6745,
    longitude: usesSupabasePersistence ? undefined : -1.5716,
    formattedAddress: usesSupabasePersistence ? '' : 'KNUST Campus, Ayeduase, Kumasi',
    isLocationConfirmed: !usesSupabasePersistence,

    // Step 3: Image
    imageFile: null,
    imageUrl: '',
    imagePreviewUrl: '',
    imagePath: '',
    imageStorageType: 'local',
    gallery: [],

    // Step 4: Capacity
    totalBlocks: usesSupabasePersistence ? 0 : 2,
    totalFloors: usesSupabasePersistence ? 0 : 4,
    totalRooms: usesSupabasePersistence ? 0 : 40,
    totalBeds: usesSupabasePersistence ? 0 : 120,
    maximumCapacity: usesSupabasePersistence ? 0 : 120,
    blocksList: usesSupabasePersistence ? [] : [
      { id: 'block-1', name: 'Block A (Alpha)', floors: 4, totalRooms: 20, roomPrefix: 'A', startNum: 101, bedsPerRoom: 3 },
      { id: 'block-2', name: 'Block B (Beta)', floors: 4, totalRooms: 20, roomPrefix: 'B', startNum: 201, bedsPerRoom: 3 }
    ],

    // Stay cycle
    paymentFrequency: 'Per Academic Year',

    // Manager assignment
    assignedManagerId: '',
    managerName: '',
    managerEmail: '',
    managerPhone: '',
    isNewManager: true,

    // Submission confirmation
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
  const [isTermsExpanded, setIsTermsExpanded] = useState(true);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Step names & icons definition
  const STEPS = [
    { num: 1, title: 'Basic Info', icon: Building2, desc: 'Identity & category' },
    { num: 2, title: 'Map Pin', icon: Compass, desc: 'Location, address & entrance' },
    { num: 3, title: 'Image Upload', icon: ImageIcon, desc: 'Property photograph' },
    { num: 4, title: 'Capacity', icon: Users, desc: 'Blocks, rooms & beds' }
  ];

  // 1. Load draft from localStorage on mount
  useEffect(() => {
    if (usesSupabasePersistence) {
      let current = true;
      setHasLoadedDraft(false);
      setCurrentStep(1);
      setRegisteredResult(null);
      setValidationErrors({});
      setSubmitError(null);
      setResidenceId(null);
      setFormData(initialDraftState);
      fetch('/api/manager/residence-registration').then(async response => {
        const result = await safeJson(response);
        if (!response.ok) throw new Error(result.error || 'Unable to load your verified residence.');
        if (!current) return;
        const draft = result.draft;
        const blocksList = (draft.blocksList || []).map((b:any,index:number) => ({...b,id:b.id || `registration-block-${index}`,
          roomTypes:(b.roomTypes || []).map((r:any,layout:number) => ({...r,id:r.id || `registration-layout-${index}-${layout}`}))}));
        const totalRooms = blocksList.reduce((n:number,b:any) => n + b.roomTypes.reduce((t:number,r:any) => t + r.totalRooms,0),0);
        const totalBeds = blocksList.reduce((n:number,b:any) => n + b.roomTypes.reduce((t:number,r:any) => t + r.totalRooms*r.bedsPerRoom,0),0);
        setResidenceId(result.residenceId);
        setFormData({...initialDraftState,...draft,...phoneDraft(draft.contactPhone,draft.contactPhoneCountry),
          hostelType:draft.propertyType || initialDraftState.hostelType,
          wing:draft.wing || initialDraftState.wing,
          imagePreviewUrl:draft.imageUrl || '',isLocationConfirmed:true,
          totalRooms,totalBeds,maximumCapacity:totalBeds,totalBlocks:blocksList.length,
          totalFloors:blocksList.reduce((n:number,b:any) => n + b.floors,0),blocksList});
        setHasLoadedDraft(true);
      }).catch(error => {if (current) setSubmitError(error.message);});
      return () => {current = false;};
    }
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const { defaultFee, securityDeposit, applicationFee, currency, ...currentDraft } = parsed;
          setFormData((prev) => ({
            ...initialDraftState,
            ...activeHostelFields(currentDraft),
            ...phoneDraft(parsed.contactPhone, parsed.contactPhoneCountry),
            blocksList: Array.isArray(parsed.blocksList) && parsed.blocksList.length > 0 ? parsed.blocksList : initialDraftState.blocksList,
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
  }, [user?.id]);

  // 2. Auto-save draft into localStorage as user types
  const saveDraftToStorage = (data: HostelRegistrationDraft) => {
    if (usesSupabasePersistence) return;
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
    if (!usesSupabasePersistence) localStorage.removeItem(DRAFT_STORAGE_KEY);
    setFormData(prev => usesSupabasePersistence ? {...initialDraftState,name:prev.name,addressLine1:prev.addressLine1,
      digitalAddress:prev.digitalAddress,latitude:prev.latitude,longitude:prev.longitude,isLocationConfirmed:prev.isLocationConfirmed,
      contactEmail:prev.contactEmail,contactPhone:prev.contactPhone,contactPhoneCountry:prev.contactPhoneCountry} : initialDraftState);
    setDraftBannerVisible(false);
    setCurrentStep(1);
    setValidationErrors({});
  };

  // Step Validation logic
  const validateStep = (step: number): boolean => {
    const errors: Record<string, string> = {};

    if (step === 1) {
      if (!formData.name.trim()) errors.name = 'Hostel name is required';
      if (usesSupabasePersistence && (!Number.isInteger(formData.yearEstablished) || formData.yearEstablished < 1000 || formData.yearEstablished > new Date().getFullYear())) {
        errors.yearEstablished = 'Enter the actual establishment year.';
      }
      if (!formData.contactEmail.trim() || !formData.contactEmail.includes('@')) {
        errors.contactEmail = 'Valid contact email is required';
      }
      if (!formData.contactPhone.trim()) errors.contactPhone = 'Contact phone number is required';
      else try { internationalPhone(formData.contactPhone, formData.contactPhoneCountry); } catch (error) { errors.contactPhone = (error as Error).message; }
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
      if (usesSupabasePersistence && (!formData.agreeTerms || !formData.accuracyCertified)) errors.confirmation = 'Confirm the terms and accuracy of your registration.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      if (currentStep < STEPS.length) {
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
      const roomTypes = b.roomTypes && b.roomTypes.length > 0 ? b.roomTypes : usesSupabasePersistence ? [] : [
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
      totalFloors: updatedBlocks.reduce((n,b) => n + b.floors,0),
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
      name: usesSupabasePersistence ? '' : `Block ${blockLetter}`,
      gender: 'Mixed',
      floors: usesSupabasePersistence ? 0 : 3,
      totalRooms: usesSupabasePersistence ? 0 : 15,
      roomPrefix: usesSupabasePersistence ? '' : blockLetter,
      startNum: usesSupabasePersistence ? 0 : nextIdx * 100 + 1,
      bedsPerRoom: 2,
      roomTypes: usesSupabasePersistence ? [] : [
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
          totalRooms: usesSupabasePersistence ? 0 : 5,
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

  // Final Atomic Submission
  const handleFinalSubmit = async () => {
    if (usesSupabasePersistence && (!hasLoadedDraft || !residenceId)) {setSubmitError('Load your verified residence before submitting.');return;}
    for (let step = 1; step <= STEPS.length; step++) {
      if (!validateStep(step)) { setCurrentStep(step); return; }
    }

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
        if (usesSupabasePersistence) setFormData(prev => ({...prev,imageUrl:finalImageUrl,imagePreviewUrl:finalImageUrl,imagePath:finalImagePath}));
      }

      let gallery = formData.gallery || [];
      if (usesSupabasePersistence) {
        const uploaded:string[] = [];
        for (const photo of gallery) {
          if (!photo.startsWith('data:')) {uploaded.push(photo);continue;}
          setSubmissionProgress('Uploading residence gallery photographs...');
          const response = await fetch('/api/storage/upload-hostel-image',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({fileName:'residence-gallery',fileType:photo.match(/^data:([^;]+);base64,/)?.[1],fileData:photo})});
          const result = await safeJson(response);
          if (!response.ok || !result.imageUrl) throw new Error(result.error || 'The gallery photograph could not be uploaded.');
          uploaded.push(result.imageUrl);
        }
        gallery = uploaded;
        setFormData(prev => ({...prev,imageUrl:finalImageUrl,imagePreviewUrl:finalImageUrl,imagePath:finalImagePath,gallery}));
      }

      // 2. Atomic Database Insertion into persistent store
      setSubmissionProgress('Creating hostel record in persistent database...');

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || (usesSupabasePersistence ? '' : 'Modern student accommodation community.'),
        wing: formData.wing,
        status: formData.status,
        hostelType: formData.hostelType === 'Other' ? formData.customHostelType : formData.hostelType,
        genderCategory: formData.genderCategory,
        yearEstablished: formData.yearEstablished,
        contactEmail: formData.contactEmail,
        contactPhone: internationalPhone(formData.contactPhone, formData.contactPhoneCountry).number,
        contactPhoneCountry: formData.contactPhoneCountry,
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
        campusProximity: formData.campusProximity || (usesSupabasePersistence ? '' : '5-10 Mins Walk'),
        campusProximityDetails: formData.campusProximityDetails || (usesSupabasePersistence ? '' : 'Shuttle & walking routes'),
        latitude: formData.latitude,
        longitude: formData.longitude,
        imageUrl: finalImageUrl,
        image: finalImageUrl,
        exteriorPhotoUrl: finalImageUrl,
        imagePath: finalImagePath,
        gallery: usesSupabasePersistence ? gallery : formData.gallery || [finalImageUrl],
        ...(usesSupabasePersistence ? {residenceId,paymentFrequency:formData.paymentFrequency,agreeTerms:formData.agreeTerms,accuracyCertified:formData.accuracyCertified} : {}),
        hostelName: formData.name.trim(),
        totalCapacity: formData.maximumCapacity,
        capacity: formData.maximumCapacity,
        totalBeds: formData.maximumCapacity,
        totalBlocks: formData.totalBlocks,
        totalFloors: formData.totalFloors,
        totalRooms: formData.totalRooms,
        blocksList: formData.blocksList,
        ...(!usesSupabasePersistence ? {
        managerId: currentUserId || user?.id || `MGR-${Date.now()}`,
        managerName: user?.name || formData.managerName || 'Anthony Davis',
        managerEmail: user?.email || formData.managerEmail || 'manager@pinevela.com',
        managerPhone: user?.phone || formData.managerPhone || formData.contactPhone || '+233 24 123 4567',
        managerPhoto: user?.photo || user?.avatar || (user as any)?.photoUrl || (user as any)?.avatarUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
        assignedManagerId: currentUserId || user?.id || ''
        } : {})
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
      if (!usesSupabasePersistence) localStorage.removeItem(DRAFT_STORAGE_KEY);

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
            {registeredResult.name}{usesSupabasePersistence ? ' submitted for review' : ' is Live!'}
          </h2>
          <p className="text-sm text-slate-600 max-w-lg mx-auto">
            The hostel record has been created in the database with all {formData.blocksList.length} blocks,
            manager assignments and uploaded photography.
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
              if (usesSupabasePersistence) {onCancel();return;}
              setRegisteredResult(null);
              clearDraft();
            }}
            className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            {usesSupabasePersistence ? 'Return to Dashboard' : 'Register Another Property'}
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

      {submitError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{submitError}</p>}
      {usesSupabasePersistence && !hasLoadedDraft && !submitError && <p role="status" className="text-sm text-slate-600">Loading your verified residence…</p>}
      {/* Header Bar with Step Progress */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-left space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <span className="text-[11px] font-black uppercase tracking-wider text-blue-900 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200">
              Admin Workflow
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1.5">
              Residence Registration
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Complete all {STEPS.length} registration steps. Submit your property details and room configuration for review.
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

        <OnboardingProgress steps={STEPS} step={currentStep} label="Residence registration" onStepChange={setCurrentStep} />
      </div>

      {/* Main Step Form Body */}
      <div inert={usesSupabasePersistence && !hasLoadedDraft} className="onboarding-fields bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-sm text-left">
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
                  {usesSupabasePersistence && <>
                    <label className="space-y-1.5 text-xs font-bold text-slate-700">
                      Establishment year
                      <input type="number" min="1000" max={new Date().getFullYear()} value={renderNumberInputValue(formData.yearEstablished)}
                        onChange={e => updateFormData({yearEstablished:parseCleanNumberInput(e.target.value)})}
                        className="block w-full rounded-xl border border-slate-200 p-3" />
                      {validationErrors.yearEstablished && <span className="block text-rose-600">{validationErrors.yearEstablished}</span>}
                    </label>
                    <label className="space-y-1.5 text-xs font-bold text-slate-700">
                      Residence gender category
                      <select value={formData.genderCategory} onChange={e => updateFormData({genderCategory:e.target.value as 'Male'|'Female'|'Mixed'})}
                        className="block w-full rounded-xl border border-slate-200 p-3">
                        <option value="Mixed">Mixed</option><option value="Male">Male</option><option value="Female">Female</option>
                      </select>
                    </label>
                  </>}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Resident Property Type <span className="text-rose-500">*</span></label>
                    <select aria-label="Resident Property Type"
                      value={formData.wing}
                      onChange={(e: any) => {
                        const val = e.target.value;
                        let defaultHType = 'Student accommodation';
                        let defaultFreq = 'Per Academic Year';

                        if (val === 'Inn') {
                          defaultHType = 'Guesthouse / Inn';
                          defaultFreq = 'Per Night';

                        } else if (val === 'Hotel') {
                          defaultHType = 'Hotel / Commercial';
                          defaultFreq = 'Per Night';

                        } else if (val === 'Estate') {
                          defaultHType = 'Residential Estate / Apartment';
                          defaultFreq = 'Monthly';

                        }

                        updateFormData({ 
                          wing: val,
                          hostelType: defaultHType,
                          paymentFrequency: defaultFreq,

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
                    <input aria-label="Residence name"
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
                    <input aria-label="Public Contact Email"
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

                  <InternationalPhoneInput value={formData.contactPhone} country={formData.contactPhoneCountry}
                    error={validationErrors.contactPhone} onChange={(contactPhone, contactPhoneCountry) => updateFormData({ contactPhone, contactPhoneCountry })} />

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Alternative Phone (Optional)</label>
                    <input aria-label="Alternative Phone (Optional)"
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
                              <input aria-label="Block / Section Name"
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
                              <select aria-label="Block Gender Designation"
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
                              <input aria-label="Floors"
                                type="text"
                                inputMode="numeric"
                                value={renderNumberInputValue(block.floors)}
                                onChange={(e) => handleBlockChange(block.id, 'floors', parseCleanNumberInput(e.target.value))}
                                placeholder="Floors"
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-900"
                              />
                            </div>

                            {/* Room Prefix */}
                            {usesSupabasePersistence && <div className="sm:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">Starting room number
                                <input type="number" min="1" max="999999" value={renderNumberInputValue(block.startNum)}
                                  onChange={e => handleBlockChange(block.id,'startNum',parseCleanNumberInput(e.target.value))}
                                  className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800" />
                              </label>
                            </div>}
                            <div className="sm:col-span-2 space-y-1">
                              <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                                Room Prefix
                              </label>
                              <input aria-label="Room Prefix"
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
                                    <select aria-label="Room Type / Bedspace #"
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
                                    <input aria-label="No. of Rooms"
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

        {usesSupabasePersistence && currentStep === STEPS.length && <div className="space-y-3 border-t border-slate-100 pt-4 text-sm">
          <label className="flex items-start gap-3"><input type="checkbox" checked={formData.accuracyCertified}
            onChange={e => updateFormData({accuracyCertified:e.target.checked})} className="mt-1 h-5 w-5" />
            <span>I confirm these property details, photographs and room counts are accurate.</span></label>
          <label className="flex items-start gap-3"><input type="checkbox" checked={formData.agreeTerms}
            onChange={e => updateFormData({agreeTerms:e.target.checked})} className="mt-1 h-5 w-5" />
            <span>I agree to submit this registration for PineVela verification and administrator review.</span></label>
          {validationErrors.confirmation && <p role="alert" className="text-rose-600">{validationErrors.confirmation}</p>}
        </div>}
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
              <span>{usesSupabasePersistence ? 'Close' : 'Save & Exit'}</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
            {currentStep < STEPS.length ? (
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
                disabled={isSubmitting || (usesSupabasePersistence && !hasLoadedDraft)}
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
