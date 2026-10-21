import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import landing from '../../assets/landing-welcome.png';
import login from '../../assets/login-market-new.png';
import cleanPlate from '../../assets/marketing-artwork/landing-cleanplate.png';
import { useMotionActivity } from '../hooks/useMotionActivity';
import '../artworkLayers.css';

type Variant = 'landing' | 'login';
type Piece = { name: string; path: string; duration: number; phase: number; dx: number; dy: number; turn: number; repairY?: number };

// These paths select pixels from the supplied PNGs, including their original
// wording. The subject is never regenerated, translated, or scaled separately.
const pieces: Record<Variant, Piece[]> = {
  landing: [
    { name: 'heart', path: 'M936 113 Q975 103 990 123 L1008 170 Q1012 186 995 191 L984 197 L981 211 L968 200 L938 205 Q921 208 915 190 L906 147 Q902 130 919 123 Z', duration: 5.7, phase: -1.3, dx: 2, dy: -8, turn: -1.8 },
    { name: 'parcel', path: 'M1059 110 L1184 139 L1190 149 L1166 236 L1151 241 L1032 205 L1025 195 L1050 122 Z', duration: 7.1, phase: -2.4, dx: -2, dy: -6, turn: 1.1, repairY: -640 },
    { name: 'growth', path: 'M1208 142 Q1262 133 1295 99 L1291 90 L1325 78 L1328 112 L1317 107 L1306 121 L1334 129 L1310 222 L1282 237 L1254 226 L1223 217 L1203 204 L1215 169 L1244 176 L1254 149 L1265 154 L1274 127 L1284 132 Q1251 151 1211 156 Z', duration: 6.6, phase: -.8, dx: 1, dy: -7, turn: .6 },
    { name: 'coin', path: 'M1356 217 C1396 221 1391 263 1359 291 C1326 320 1290 306 1292 275 C1294 244 1324 217 1356 217 Z', duration: 5.4, phase: -2.7, dx: 3, dy: -6, turn: 2.4, repairY: -600 },
    { name: 'availability', path: 'M900 289 L1170 246 Q1198 241 1206 269 L1217 319 Q1223 345 1194 353 L929 394 L890 401 L902 381 Q883 379 879 356 L871 328 Q864 302 900 289 Z', duration: 6.4, phase: -.5, dx: 0, dy: -4, turn: .3 },
    { name: 'maintenance', path: 'M900 394 L1159 409 Q1186 408 1190 438 L1192 475 Q1192 511 1156 509 L903 496 L873 507 L880 484 Q862 479 863 456 L864 428 Q863 395 900 394 Z', duration: 7.4, phase: -2.9, dx: 1, dy: -4, turn: -.3 },
    { name: 'sale', path: 'M944 505 L1183 530 Q1212 533 1210 562 L1207 603 Q1207 637 1175 635 L939 610 L909 624 L917 597 Q903 592 903 570 L907 535 Q907 504 944 505 Z', duration: 7.8, phase: -4.2, dx: -1, dy: -4, turn: .25 },
    { name: 'chat', path: 'M1034 637 L1100 651 Q1122 656 1117 680 L1107 719 Q1103 742 1079 735 L1050 727 L1003 741 L1012 716 Q991 712 995 691 L1004 656 Q1010 636 1034 637 Z', duration: 6.1, phase: -1.9, dx: 2, dy: -7, turn: -1.4 },
  ],
  login: [
    { name: 'heart', path: 'M197 336 L233 328 Q254 328 260 348 L272 382 Q279 406 254 414 L243 427 L228 414 L205 419 Q185 421 178 398 L166 367 Q160 346 181 340 Z', duration: 5.9, phase: -1.3, dx: -1, dy: -7, turn: -1.5 },
    { name: 'coin', path: 'M136 557 C159 549 195 576 207 608 C219 638 205 662 179 657 C153 651 124 628 115 604 C105 580 112 563 136 557 Z', duration: 6.5, phase: -2.8, dx: 2, dy: -7, turn: 2 },
    { name: 'chat', path: 'M937 395 Q958 388 976 403 L1011 435 Q1030 453 1014 476 L999 497 Q985 513 966 503 L946 491 L919 499 L922 479 Q904 476 896 463 Q890 448 902 431 L921 407 Q927 398 937 395 Z', duration: 6.9, phase: -.8, dx: 2, dy: -6, turn: 1.5 },
  ],
};
const centers: Record<Variant, Record<string, [number, number]>> = {
  landing: { heart: [960, 160], parcel: [1108, 177], growth: [1270, 157], coin: [1341, 265], availability: [1044, 322], maintenance: [1028, 452], sale: [1057, 570], chat: [1056, 690] },
  login: { heart: [220, 375], coin: [160, 607], chat: [960, 451] },
};

/** Progressive enhancement: the ordinary image remains the accessible fallback. */
export default function ArtworkLayers({ variant }: { variant: Variant }) {
  const ref = useRef<SVGSVGElement>(null);
  const id = 'art-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(() => typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)').matches);
  const source = variant === 'landing' ? landing : login;
  const width = variant === 'landing' ? 1448 : 1122;
  const height = variant === 'landing' ? 1086 : 1402;
  useMotionActivity(ref);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)');
    const sync = () => setAllowed(!preference.matches);
    preference.addEventListener('change', sync);
    sync();
    return () => preference.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    let active = true;
    setReady(false);
    if (!allowed) return;
    const images = (variant === 'landing' ? [source, cleanPlate] : [source]).map(url => {
      const image = new Image();
      const promise = new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(); });
      image.src = url;
      return { image, promise };
    });
    void Promise.all(images.map(item => item.promise)).then(() => { if (active) setReady(true); }).catch(() => { /* Keep the complete original on failure. */ });
    return () => { active = false; images.forEach(({ image }) => { image.onload = image.onerror = null; }); };
  }, [allowed, source, variant]);

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (ready && allowed) parent?.setAttribute('data-artwork-layered', 'true');
    else parent?.removeAttribute('data-artwork-layered');
    return () => parent?.removeAttribute('data-artwork-layered');
  }, [ready, allowed]);

  return <svg ref={ref} className="artwork-layers" data-artwork-layers={variant} data-motion-ready={ready && allowed}
    viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
    <defs>
      <mask id={id + '-base'} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
        <rect width={width} height={height} fill="white" />
        {pieces[variant].map(piece => <path key={piece.name} d={piece.path} fill="black" />)}
      </mask>
      <clipPath id={id + '-repair'} clipPathUnits="userSpaceOnUse">
        {pieces[variant].map(piece => <path key={piece.name} d={piece.path} />)}
      </clipPath>
      {pieces[variant].map(piece => <clipPath key={piece.name} id={id + '-' + piece.name} clipPathUnits="userSpaceOnUse"><path d={piece.path} /></clipPath>)}
    </defs>
    {variant === 'landing' && <>
      <image href={allowed ? cleanPlate : undefined} width={width} height={height} preserveAspectRatio="none" clipPath={`url(#${id}-repair)`} />
      {pieces.landing.filter(piece => piece.repairY).map(piece => <image key={piece.name} href={allowed ? cleanPlate : undefined}
        y={piece.repairY} width={width} height={height} preserveAspectRatio="none" clipPath={`url(#${id}-${piece.name})`} />)}
    </>}
    <image data-artwork-base="true" href={allowed ? source : undefined} width={width} height={height} mask={`url(#${id}-base)`} />
    {pieces[variant].map(piece => <g key={piece.name} className="artwork-layer" data-artwork-layer={piece.name}
      style={{ '--art-dx': `${piece.dx * 2.5}px`, '--art-dy': `${piece.dy * 2.5}px`, '--art-turn': `${piece.turn * 1.5}deg`, transformOrigin: centers[variant][piece.name].map(value => `${value}px`).join(' '), animationDuration: `${piece.duration}s`, animationDelay: `${piece.phase}s` } as CSSProperties}>
      <image href={allowed ? source : undefined} width={width} height={height} clipPath={`url(#${id}-${piece.name})`} />
    </g>)}
  </svg>;
}
