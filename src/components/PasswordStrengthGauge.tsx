/** Visual guidance only; account password validation remains authoritative. */
export default function PasswordStrengthGauge({ password }: { password: string }) {
  if (!password) return null;
  const points = Number(password.length >= 6) + Number(password.length >= 8) + Number(/[A-Z]/.test(password)) + Number(/[0-9]/.test(password)) + Number(/[^A-Za-z0-9]/.test(password));
  const level = password.length < 6 || points <= 1 ? 0 : points === 2 ? 1 : points <= 4 ? 2 : 3;
  const labels = ['Weak', 'Okay', 'Good', 'Strong'];
  const colors = ['bg-rose-500', 'bg-amber-500', 'bg-blue-600', 'bg-emerald-600'];
  return <div className="mt-2 space-y-1" data-password-gauge>
    <p className="text-right text-[11px] font-semibold text-slate-600" aria-live="polite">{labels[level]}</p>
    <div role="progressbar" aria-label="Password strength" aria-valuemin={0} aria-valuemax={4} aria-valuenow={level + 1} aria-valuetext={labels[level]} className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className={`h-full rounded-full transition-[width] duration-200 motion-reduce:transition-none ${colors[level]}`} style={{ width: `${(level + 1) * 25}%` }} />
    </div>
  </div>;
}
