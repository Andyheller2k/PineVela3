import { useId } from 'react';
import { companionById, type CompanionId } from '../../companionModel';

/** Original vector portraits: clear silhouettes remain recognizable at launcher size. */
export default function CompanionAvatar({ companion, className = '' }: { companion: CompanionId; className?: string }) {
  const id = useId().replaceAll(':', ''), c = companionById(companion);
  return <svg className={`pv-companion-avatar ${className}`} viewBox="0 0 100 100" role="img" aria-label={`${c.name}, ${c.taste} companion`}>
    <defs><linearGradient id={id} x2="1" y2="1"><stop stopColor="#003566" /><stop offset="1" stopColor="#000814" /></linearGradient></defs>
    <rect width="100" height="100" rx="30" fill={`url(#${id})`} />
    <circle cx="50" cy="48" r="35" fill={c.accent} opacity=".12" />
    {companion === 'nova' && <>
      <path d="M23 88V48c0-25 54-25 54 0v40" fill="#142542" />
      <path d="M15 100c2-28 68-28 70 0" fill="#416889" /><path d="M34 82l16 12 16-12" fill="#b7e5f5" />
      <path d="M41 69v13l9 6 9-6V69" fill="#c7896e" /><ellipse cx="50" cy="53" rx="21" ry="26" fill="#e8b394" />
      <path d="M27 49c-3-24 38-37 47-5-14 0-22-6-29-13-2 10-10 14-18 18" fill="#192a43" />
      <rect x="25" y="47" width="50" height="13" rx="6.5" fill="#83c9ff" opacity=".85" /><path d="M33 50h13m6 0h7" stroke="#e8f7ff" strokeWidth="2" strokeLinecap="round" />
      <path d="M44 67q6 5 12 0" fill="none" stroke="#935242" strokeWidth="2" strokeLinecap="round" />
      <path d="M80 13v10m-5-5h10M16 30v6m-3-3h6" stroke="#ffd60a" strokeWidth="2" strokeLinecap="round" />
    </>}
    {companion === 'mabel' && <>
      <path d="M22 78V49c-1-31 57-30 56 0v29" fill="#704735" />
      <path d="M14 100c5-30 67-30 72 0" fill="#91694a" /><path d="M32 81l18 14 18-14-9-4H41" fill="#fff0cc" />
      <path d="M41 69v13q9 9 18 0V69" fill="#bd805e" /><ellipse cx="50" cy="53" rx="21" ry="26" fill="#dba17b" />
      <path d="M27 48q1-30 26-28 26 0 23 32c-10-1-20-12-23-20-4 13-15 19-26 16" fill="#734835" />
      <path d="M29 25q21-17 43 0v10H29" fill="#e4b477" /><path d="M25 35h52" stroke="#f3d8a3" strokeWidth="7" strokeLinecap="round" />
      <path d="M39 54h4m15 0h4" stroke="#382a2c" strokeWidth="3" strokeLinecap="round" /><path d="M44 67q6 6 12 0" fill="none" stroke="#9d4e48" strokeWidth="2" strokeLinecap="round" />
      <circle cx="28" cy="64" r="3" fill="#fff0cc" /><circle cx="72" cy="64" r="3" fill="#fff0cc" />
      <path d="M82 15l3 6-3 6-3-6z" fill="#edbd82" />
    </>}
    {companion === 'axel' && <>
      <path d="M13 100c4-29 69-29 74 0" fill="#7589b7" /><path d="M39 73v11l11 8 11-8V73" fill="#916347" />
      <ellipse cx="50" cy="52" rx="22" ry="27" fill="#b5805d" />
      <path d="M27 48c-6-24 23-34 36-24 12 2 15 11 11 25l-8-12q-16 11-31 0z" fill="#161f31" />
      <path d="M23 50v15m54-15v15M23 52c-4-40 59-40 54 0" fill="none" stroke="#a5b8ed" strokeWidth="6" strokeLinecap="round" />
      <rect x="19" y="48" width="9" height="19" rx="4" fill="#dce4ff" /><rect x="72" y="48" width="9" height="19" rx="4" fill="#dce4ff" />
      <path d="M36 52h9m10 0h9" stroke="#14213a" strokeWidth="5" strokeLinecap="round" /><path d="M45 67q6 3 12-1" stroke="#714533" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M31 86l6 14m32-14-6 14" stroke="#cad5ef" strokeWidth="3" /><circle cx="84" cy="22" r="4" fill="#ffd60a" />
    </>}
    {companion === 'ziggy' && <>
      <path d="M14 100c2-28 70-28 72 0" fill="#ffc300" /><path d="M41 70v14q9 10 18 0V70" fill="#b97850" />
      <ellipse cx="50" cy="53" rx="22" ry="27" fill="#e3a579" />
      <path d="M27 47l-3-15 12 1 1-15 13 8 13-10 2 15 14 3-8 16-7-13q-15 8-30 1z" fill="#e5a02e" />
      <circle cx="40" cy="54" r="9" fill="none" stroke="#14213a" strokeWidth="3" /><circle cx="61" cy="54" r="9" fill="none" stroke="#14213a" strokeWidth="3" /><path d="M49 53h3" stroke="#14213a" strokeWidth="3" />
      <circle cx="41" cy="54" r="2" fill="#14213a" /><path d="M57 54h6" stroke="#14213a" strokeWidth="2" strokeLinecap="round" />
      <path d="M42 67q9 14 18-1" fill="#fff5d1" stroke="#a75e41" strokeWidth="2" strokeLinejoin="round" />
      <path d="M37 86l13 5-13 6zm26 0-13 5 13 6z" fill="#003566" /><circle cx="50" cy="91" r="3" fill="#000814" />
      <path d="M15 18l4 4-4 4m68 39 4 4-4 4" fill="none" stroke="#ffd60a" strokeWidth="3" strokeLinecap="round" />
    </>}
  </svg>;
}
