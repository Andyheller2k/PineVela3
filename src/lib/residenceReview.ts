/** Residence setup approval is separate from physical manager approval and from
 * current catalog visibility. A private/unpublished shell is not a pending case. */
export type ResidenceReview = {status?:string;approvalStatus?:string;verificationId?:string|null;registrationWithdrawn?:boolean;isApproved?:boolean};
export function residenceReviewStatus(residence:ResidenceReview):string {
  if (residence.registrationWithdrawn) return 'withdrawn';
  const status=residence.status?.toLowerCase();
  if (status==='closed') return 'closed';
  const review=residence.approvalStatus?.toLowerCase() || 'not_submitted';
  if (review==='not_submitted' && status==='rejected') return 'rejected';
  return review;
}
export const pendingResidenceReview = (residence:ResidenceReview) => ['under_review','more_info_required'].includes(residenceReviewStatus(residence));
export const canDecideResidenceReview = (residence:ResidenceReview) => Boolean(residence.verificationId && residence.status==='pending' && pendingResidenceReview(residence));
export function residenceReviewLabel(residence:ResidenceReview):string {
  const status=residenceReviewStatus(residence);
  if (status==='approved') return residence.isApproved ? 'Approved & Live' : 'Approved · Not published';
  return ({not_submitted:'Setup not submitted',under_review:'Awaiting review',more_info_required:'Corrections requested',
    rejected:'Registration rejected',closed:'Residence closed',withdrawn:'Review withdrawn'} as Record<string,string>)[status] || 'Review unavailable';
}
