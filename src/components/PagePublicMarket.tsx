import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PublicHeader from './PublicHeader';
import PublicMarketCatalog from './PublicMarketCatalog';
import CompanyStory from './CompanyStory';
import type { CompanySection } from './companyStoryContent';
import LogoutConfirmationModal from './LogoutConfirmationModal';

export default function PagePublicMarket() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [companyStorySection, setCompanyStorySection] = useState<CompanySection['id'] | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  return <div className="h-dvh flex flex-col overflow-hidden bg-transparent font-sans">
    <PublicHeader searchQuery={searchQuery} setSearchQuery={setSearchQuery} onHome={() => navigate('/')}
      onSearch={() => navigate(`/?search=${encodeURIComponent(searchQuery)}`)}
      setCompanyStorySection={setCompanyStorySection} setShowLogoutConfirm={setShowLogoutConfirm} />
    <main className="public-market-content hide-scrollbar w-full max-w-7xl mx-auto flex-1 min-h-0 overflow-y-auto px-6 md:px-12 pt-8 pb-16" style={{ marginTop: 'var(--pv-public-header-height, 100px)' }}>
      <PublicMarketCatalog />
    </main>
    {companyStorySection && <CompanyStory initialSection={companyStorySection} onClose={() => setCompanyStorySection(null)} />}
    <LogoutConfirmationModal isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} onConfirm={async () => { if (await logout()) setShowLogoutConfirm(false); }} />
  </div>;
}
