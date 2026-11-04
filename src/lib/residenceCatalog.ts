import type { Hostel } from '../types';

export type Residence = Partial<Hostel> & { id: string; name: string; hostelType?: string; exteriorPhotoUrl?: string; imagePreviewUrl?: string; images?: string[]; addressLine1?: string };

export function publicResidenceContact(hostel: Residence): { label: string; value: string } {
  const manager = hostel.managerName?.trim();
  if (manager) return { label: 'Manager', value: manager };
  const contact = hostel.contact_email?.trim() || hostel.contact_phone?.trim();
  return { label: 'Property contact', value: contact || 'Contact details unavailable' };
}

export function residenceImages(hostel: Residence): string[] {
  return [...new Set([hostel.image, hostel.imageUrl, hostel.exteriorPhotoUrl, hostel.imagePreviewUrl, hostel.image_url, ...(hostel.gallery || []), ...(hostel.images || [])].filter((image): image is string => typeof image === 'string' && !!image.trim()))];
}

export function filterResidences(hostels: Residence[], search: string): Residence[] {
  const query = search.trim().toLowerCase();
  return hostels.filter(hostel => hostel && !hostel.isDeleted && (hostel.isApproved === true || hostel.approvalStatus === 'Approved' || String(hostel.status) === 'Approved') && !(hostel.isApproved !== true && (hostel.approvalStatus === 'Pending Approval' || String(hostel.status) === 'Pending Approval')) &&
    (!query || [hostel.name, hostel.location, hostel.managerName, hostel.managerEmail, hostel.hostelType, hostel.hostel_type].some(value => value?.toLowerCase().includes(query))));
}
