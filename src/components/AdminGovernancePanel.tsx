import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import SupabaseAdminGovernancePanel from './SupabaseAdminGovernancePanel';

import { governanceRefreshInterval } from '../lib/governanceRefresh';

export function useAdminGovernance(enabled = true, background = false) {
  const { apiFetch, user } = useAuth();
  return useQuery<any>({
    queryKey: ['adminGovernance', user?.id], enabled: enabled && user?.role === 'admin',
    // Header badges and removal notices do not need the full approval lifecycle
    // every eight seconds. Active review panels retain the existing cadence.
    refetchInterval: governanceRefreshInterval(background),
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      const ownerId = user!.id;
      const data = await apiFetch('/api/admin/governance', {
        signal, ...(({ headers: { 'X-PineVela-Account-Context': ownerId } })),
      });
      if (!Array.isArray(data?.members) || (data.currentId !== ownerId))
        throw new Error('Administrator governance could not load. Please sign in again.');
      return data;
    },
  });
}
export default function AdminGovernancePanel() {
  const {user}=useAuth();
  return (<SupabaseAdminGovernancePanel key={user?.id}/>);
}
