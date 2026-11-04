import { useId } from 'react';
import { PLATFORM_TERMS } from '../../legalPolicy';

export default function TermsAcceptanceControl({ checked, onChange, merchant = false, document = PLATFORM_TERMS }:
  { checked: boolean; onChange: (checked: boolean) => void; merchant?: boolean; document?: {version:string;href:string;privacyHref:string} }) {
  const id = useId();
  return <div className="terms-acceptance-control">
    <div className="terms-acceptance-choice">
      <input id={id} type="checkbox" required checked={checked} onChange={e => onChange(e.target.checked)} />
      <label htmlFor={id}>I am at least 16 and I have read and accept the <a href={document.href} target="_blank" rel="noopener">Terms of service</a>
        {' '}(version {document.version}){merchant ? ' for my merchant application and use of PineVela.' : '.'}</label>
    </div>
    <p>See the <a href={document.privacyHref} target="_blank" rel="noopener">Privacy policy</a> for how your data is used. This does not opt you into marketing or AI sharing.</p>
  </div>;
}
