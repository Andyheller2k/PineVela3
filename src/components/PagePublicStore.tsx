import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PublicHeader from './PublicHeader';
import MarketStorefront from './MarketStorefront';
import LogoutConfirmationModal from './LogoutConfirmationModal';

export default function PagePublicStore() {
  const navigate = useNavigate();
  const { storeId } = useParams();
  const { logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  return <div className="page-canvas h-dvh flex flex-col overflow-hidden font-sans">
    <PublicHeader searchQuery={searchQuery} setSearchQuery={setSearchQuery} onHome={() => navigate('/')}
      onSearch={() => navigate(`/?search=${encodeURIComponent(searchQuery)}`)}
      onCompanySection={section => navigate(`/?section=${section}`)} setShowLogoutConfirm={setShowLogoutConfirm} />
    <main className="public-market-content hide-scrollbar w-full max-w-7xl mx-auto flex-1 min-h-0 overflow-y-auto px-6 md:px-12 pt-8 pb-16" style={{ marginTop: 'var(--pv-public-header-height, 100px)' }}>
      <button type="button" onClick={() => navigate('/pinemarket')} className="mb-5 text-xs font-bold text-blue-800">← Back to PineMarket</button>
      {storeId && <MarketStorefront key={storeId} storeId={storeId} />}
    </main>
    <LogoutConfirmationModal isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} onConfirm={async () => { if (await logout()) setShowLogoutConfirm(false); }} />
  </div>;
}
