export type ApprovalRequest = { execute: (key: string) => Promise<any>; resolve: (value: any) => void; reject: (error: Error) => void };
export function requestKeyedApproval(execute: ApprovalRequest['execute']) {
  return new Promise<any>((resolve, reject) => window.dispatchEvent(new CustomEvent<ApprovalRequest>('pinevela-approval-key', { detail: { execute, resolve, reject } })));
}
