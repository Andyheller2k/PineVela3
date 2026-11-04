import React from 'react';
import { MARKET_DEFAULT_LOGO } from '../../marketBranding';

interface PineLogoProps {
  className?: string;
  size?: number;
  hideText?: boolean;
  variant?: 'light' | 'dark';
}

export function PineWordmark({ className = '', surface }: { className?: string; surface?: 'inverse' }) {
  return <span className={`pinevela-wordmark ${className}`} data-brand-surface={surface}><span className="pine-label">Pine</span><span className="vela-label">Vela</span></span>;
}

export default function PineLogo({ className = '', size = 32, hideText = false }: PineLogoProps) {
  return (
    <div role="img" aria-label="PineVela" className={`pinevela-brand flex items-center gap-2.5 font-sans ${className}`}>
      <img
        src={MARKET_DEFAULT_LOGO}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        className="pinevela-brand-mark shrink-0"
      />
      {!hideText && <PineWordmark className="text-xl" />}
    </div>
  );
}
