import { useAuth } from '../context/AuthContext';
import SupabaseAccountModerationPanel from './SupabaseAccountModerationPanel';

const root = '/api/admin/governance';
const field = 'w-full rounded-xl border border-blue-200 bg-white/70 px-3 py-2 text-sm';
const button = 'rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';
export default function AccountModerationPanel({ target, onClose, onApplied }: { target: any; onClose: () => void; onApplied: () => void }) {
  const {user}=useAuth();
  return (<SupabaseAccountModerationPanel key={`${user?.id}:${target?.role}:${target?.id}`} target={target} onClose={onClose} onApplied={onApplied}/>);
}
