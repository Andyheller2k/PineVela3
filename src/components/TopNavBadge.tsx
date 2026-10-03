export default function TopNavBadge({ count }: { count?: number | null }) {
  if (!count || count <= 0) return null;

  return (
    <span
      aria-hidden="true"
      className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-0.5 text-[9px] font-black leading-none text-white ring-2 ring-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
