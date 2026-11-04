import { useEffect } from 'react';
import { HashRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { NativePreviewAuthProvider } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
import PageUnifiedLogin from '../components/PageUnifiedLogin';
import PageFAQ from '../components/PageFAQ';
import SupportLayout from '../components/SupportLayout';

function NativeHelp() {
  return <SupportLayout publicPage>
    <h1 className="text-3xl font-bold">Help & support</h1>
    <p className="mt-4 max-w-xl text-sm leading-7">You can read PineVela’s frequently asked questions and policies in this Android preview. Sending support requests and signing in will be connected in the next step.</p>
    <Link to="/faq" className="mt-6 inline-flex rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white">Browse frequently asked questions</Link>
    <p className="mt-6 text-sm">Support email: andyheller2k@gmail.com</p>
  </SupportLayout>;
}

function NativeRoutes() {
  const location = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return <div className="native-preview-shell">
    <aside role="status" className="native-preview-notice">Android preview · Sign-in connects next.</aside>
    <div className="native-preview-route"><Routes>
      <Route path="/login" element={<PageUnifiedLogin nativePreview />} />
      <Route path="/help" element={<NativeHelp />} />
      <Route path="/faq" element={<PageFAQ />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes></div>
  </div>;
}

export default function NativeApp() {
  return <NativePreviewAuthProvider><HashRouter><ThemeProvider><NativeRoutes /></ThemeProvider></HashRouter></NativePreviewAuthProvider>;
}
