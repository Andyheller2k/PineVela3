import { BadgeCheck } from 'lucide-react';

export default function AdministratorLabel({ slot, name }: { slot?: number; name?: string }) {
  return <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
    <span>Administrator</span>
    <BadgeCheck aria-label="Verified administrator" role="img" className="h-5 w-5 shrink-0 fill-emerald-50 text-emerald-600" />
    {slot !== undefined && <span className="shrink-0">{slot}</span>}
    {name && <span className="min-w-0 break-words [overflow-wrap:anywhere]">{name}</span>}
  </span>;
}
