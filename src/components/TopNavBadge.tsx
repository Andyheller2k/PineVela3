export default function TopNavBadge({ count, color = 'red', inset = false }: { count?: number | null; color?: 'red' | 'blue'; inset?: boolean }) {
  if (!count || count <= 0) return null;

  return (
    <span
      aria-label={`${count} unread notifications`}
      data-notification-count={count}
      className={`absolute ${inset ? 'right-0 top-0' : '-right-3 -top-2'} flex h-4 min-w-4 items-center justify-center rounded-full ${color === 'blue' ? 'bg-blue-600' : 'bg-rose-600'} px-0.5 text-[9px] font-black leading-none text-white ring-2 ring-white`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
