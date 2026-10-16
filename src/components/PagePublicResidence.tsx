import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PublicHeader from './PublicHeader';
import PublicResidenceCatalog from './PublicResidenceCatalog';
import LogoutConfirmationModal from './LogoutConfirmationModal';

export default function PagePublicResidence() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [params] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(params.get('search') || '');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  return <div className="page-canvas h-dvh flex flex-col overflow-hidden font-sans">
    <PublicHeader searchQuery={searchQuery} setSearchQuery={setSearchQuery} onHome={() => navigate('/')}
      onSearch={() => document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' })}
      onCompanySection={section => navigate(`/?section=${section}`)} setShowLogoutConfirm={setShowLogoutConfirm} />
    <main className="public-residence-content hide-scrollbar w-full max-w-7xl mx-auto flex-1 min-h-0 overflow-y-auto px-6 md:px-12 pt-8 pb-16" style={{ marginTop: 'var(--pv-public-header-height, 100px)' }}>
      <PublicResidenceCatalog searchQuery={searchQuery} />
    </main>
    <LogoutConfirmationModal isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} onConfirm={async () => { if (await logout()) setShowLogoutConfirm(false); }} />
  </div>;
}
