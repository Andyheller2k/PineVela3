import { useLocation } from 'react-router-dom';
import PineLogo from './PineLogo';

function Shape({ className = '' }: { className?: string }) {
  return <div className={`rounded-xl bg-blue-200/45 motion-safe:animate-pulse ${className}`} />;
}

/** Loading structure only: no account information or fabricated content. */
export default function RouteSkeleton() {
  const { pathname } = useLocation();
  const formPage = pathname === '/login' || pathname.includes('onboard') || pathname === '/register-manager';
  const panel = 'rounded-3xl border border-white/70 bg-white/40 p-6 shadow-sm backdrop-blur-xl';

  return (
    <div role="status" aria-busy="true" aria-live="polite" data-route-skeleton={formPage ? 'form' : 'dashboard'} className="min-h-screen w-full bg-blue-50/25 p-4 text-blue-950 sm:p-6 lg:p-8">
      <span className="sr-only">Loading page</span>
      <div aria-hidden="true" className="mx-auto w-full max-w-7xl space-y-6">
        <div className="flex h-16 items-center justify-between gap-4 rounded-2xl border border-white/70 bg-white/40 px-4 backdrop-blur-xl">
          <PineLogo size={36} />
          <div className="flex gap-3"><Shape className="hidden h-9 w-24 sm:block" /><Shape className="h-9 w-9 rounded-full" /></div>
        </div>
        {formPage ? (
          <div className="grid min-h-[70vh] items-center gap-8 lg:grid-cols-2">
            <div className="hidden space-y-6 lg:block"><Shape className="aspect-square w-full max-w-lg rounded-3xl" /><Shape className="h-5 w-2/3" /></div>
            <div className={`${panel} mx-auto w-full max-w-lg space-y-7 sm:p-10`}>
              <Shape className="h-9 w-2/3" /><Shape className="h-4 w-4/5" />
              {[0, 1, 2].map(index => <div key={index} className="space-y-3"><Shape className="h-3 w-24" /><Shape className="h-12 w-full" /></div>)}
              <Shape className="h-12 w-full bg-blue-300/45" /><Shape className="mx-auto h-4 w-1/2" />
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <div className={`${panel} hidden space-y-5 lg:block`}><Shape className="mb-8 h-12 w-full" />{[0, 1, 2, 3, 4, 5].map(index => <Shape key={index} className="h-9 w-full" />)}</div>
            <div className="min-w-0 space-y-6">
              <div className="space-y-3 py-3"><Shape className="h-9 w-2/3 max-w-sm" /><Shape className="h-4 w-4/5 max-w-md" /></div>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">{[0, 1, 2, 3].map(index => <div key={index} className={`${panel} space-y-4`}><Shape className="h-9 w-9" /><Shape className="h-5 w-2/3" /><Shape className="h-3 w-full" /></div>)}</div>
              <div className={`${panel} space-y-5`}><Shape className="h-6 w-1/3" />{[0, 1, 2, 3].map(index => <div key={index} className="flex items-center gap-4"><Shape className="h-14 w-14 shrink-0" /><div className="flex-1 space-y-3"><Shape className="h-4 w-2/3" /><Shape className="h-3 w-full" /></div></div>)}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
