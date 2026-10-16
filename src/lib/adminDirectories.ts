const directoryArrays = ['residences', 'managerRestrictions', 'boardRequests', 'activities',
  'digitalMarketApps', 'digitalMarketStores', 'paymentRecords'] as const;
const accountCounts = ['total', 'residents', 'managers', 'staff', 'officers', 'merchants', 'admins', 'others'] as const;

export type AdministratorDirectories = Record<typeof directoryArrays[number], any[]> & {
  allUsersData: {
    totalUsers: number;
    breakdown: Record<typeof accountCounts[number], number>;
    users: any[];
  };
};

class DirectoryReadError extends Error {}
const retryMessage = 'Administrator directories could not load. Please retry.';

function statusMessage(status: number): string {
  if (status === 401) return 'Your administrator session ended. Sign in again to load the directories.';
  if (status === 403) return 'This account cannot access administrator directories.';
  if (status === 409) return 'Your account context changed. Refresh the page to reload administrator directories.';
  if (status === 429) return 'Administrator directories are receiving too many requests. Please retry shortly.';
  if (status >= 500) return 'Administrator directory service is temporarily unavailable. Please retry.';
  return retryMessage;
}

/** Keep headers, body parsing and account/query cancellation inside one deadline.
 * The callback performs one authenticated request; no partial/default directories
 * are substituted when the server is unavailable. */
export async function readAdministratorDirectories(
  signal: AbortSignal,
  request: (signal: AbortSignal) => Promise<Response>,
  timeoutMs = 30000,
): Promise<AdministratorDirectories> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const requestSignal = AbortSignal.any([signal, deadline]);
  try {
    requestSignal.throwIfAborted();
    const response = await request(requestSignal);
    requestSignal.throwIfAborted();
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new DirectoryReadError(statusMessage(response.status));
    }
    const data = await response.json();
    requestSignal.throwIfAborted();
    const accounts = data?.allUsersData;
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || !directoryArrays.every(key => Array.isArray(data[key]))
      || !accounts || !Array.isArray(accounts.users)
      || !Number.isInteger(accounts.totalUsers) || accounts.totalUsers < 0
      || !accountCounts.every(key => Number.isInteger(accounts.breakdown?.[key]) && accounts.breakdown[key] >= 0)) {
      throw new DirectoryReadError('Administrator directory information was incomplete. Please retry.');
    }
    return data;
  } catch (error) {
    // Account changes and unmounts must remain query cancellations, rather than
    // turning an old account's cancelled request into an error for the new one.
    signal.throwIfAborted();
    if (deadline.aborted || (error instanceof DOMException && error.name === 'TimeoutError')) {
      throw new DirectoryReadError('Administrator directories took too long to load. Please retry.');
    }
    if (error instanceof DirectoryReadError || (error instanceof DOMException && error.name === 'AbortError')) throw error;
    if (error instanceof SyntaxError) throw new DirectoryReadError('Administrator directory information could not be read. Please retry.');
    throw new DirectoryReadError(retryMessage);
  }
}
