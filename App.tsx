import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './services/firebaseService';
import { DailyReport, User, ViewState } from './types';
import { StorageService } from './services/storageService';
import { EntryForm } from './components/EntryForm';
import { History } from './components/History';
import { Milestones } from './components/Milestones';
import { BarChart } from './components/BarChart';
import { Chatbot } from './components/Chatbot';
import { Auth } from './components/Auth';
import {
  PlusCircle,
  History as HistoryIcon,
  LogOut,
  Construction,
  Flag,
  Menu,
  X,
  Loader2,
  BarChart2
} from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewState>('entry');
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [firebaseInitialized, setFirebaseInitialized] = useState(false);


  useEffect(() => {
    if (auth) {
      setFirebaseInitialized(true);
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        // Only treat user as logged in if they exist AND their email is verified
        if (firebaseUser && firebaseUser.emailVerified) {
          const userData: User = {
            id: firebaseUser.uid,
            username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User'
          };
          setUser(userData);
          loadReports(userData.id);
        } else {
          // If user is logged in but unverified, the Auth component handles showing the verification screen
          // by checking verification status during the login/registration process.
          setUser(null);
          setReports([]);
        }
        setLoading(false);
      });

      return () => unsubscribe();
    } else {
      setLoading(false);
      setFirebaseInitialized(false);
    }
  }, []);

  const loadReports = (userId: string) => {
    setReports(StorageService.getReports(userId));
  };

  const handleLogout = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setView('entry');
    } catch (error) {
      console.error("Logout error", error);
    }
  };

  const handleSaveReport = (report: DailyReport) => {
    if (!user) return;
    StorageService.saveReport(report);
    loadReports(user.id);
    setEditingReport(report);
  };

  const handleDeleteReport = (id: string) => {
    if (!user) return;
    StorageService.deleteReport(user.id, id);
    loadReports(user.id);
    if (editingReport?.id === id) setEditingReport(null);
  };

  const handleEditReport = (report: DailyReport) => {
    setEditingReport(report);
    setView('entry');
    setMobileMenuOpen(false);
  };

  const NavButton = ({
    target,
    icon: Icon,
    label
  }: {
    target: ViewState;
    icon: any;
    label: string;
  }) => (
    <button
      onClick={() => {
        if (target === 'entry') setEditingReport(null);
        setView(target);
        setMobileMenuOpen(false);
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-bold uppercase transition-colors ${
        view === target
          ? 'bg-black text-white'
          : 'text-gray-500 hover:bg-gray-100 hover:text-black'
      }`}
    >
      <Icon size={20} />
      {label}
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="animate-spin text-black" size={48} />
      </div>
    );
  }

  if (!firebaseInitialized) {
    return <Auth />
  }


  if (!user) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col md:flex-row font-sans text-black">
      {/* Mobile Header */}
      <header className="bg-white border-b-2 border-black p-4 flex justify-between items-center md:hidden sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Construction className="text-black" size={24} />
          <span className="font-black text-xl tracking-tight">THEPROJECT 360</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="text-black"
        >
          {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </header>

      {/* Sidebar / Mobile Menu */}
      <aside
        className={`
            fixed inset-0 bg-white z-40 transform transition-transform duration-300 ease-in-out
            md:relative md:translate-x-0 md:w-64 md:h-screen md:border-r-2 md:border-black md:flex md:flex-col md:sticky md:top-0
            ${mobileMenuOpen ? 'translate-x-0 pt-20 px-4' : '-translate-x-full md:p-0'}
        `}
      >
        <div className="hidden md:flex p-6 border-b-2 border-black items-center gap-3">
          <div className="p-2 bg-black rounded-lg text-white">
            <Construction size={24} />
          </div>
          <h1 className="font-black text-xl tracking-tight">THEPROJECT 360</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <NavButton target="entry" icon={PlusCircle} label="Daily Records" />
          <NavButton target="history" icon={HistoryIcon} label="History" />
          <NavButton target="milestones" icon={Flag} label="Milestones" />
          <NavButton target="barchart" icon={BarChart2} label="Duration Analysis" />
        </nav>

        <div className="p-4 border-t-2 border-black mt-auto">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-lg border-2 border-black">
            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user.username}</p>
              <p className="text-xs text-gray-500 font-bold uppercase truncate">
                Site Supervisor
              </p>
            </div>
            <button onClick={handleLogout} className="text-gray-400 hover:text-black">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-65px)] md:h-screen bg-white pb-24 md:pb-8 relative">
        {view === 'entry' && (
          <EntryForm
            existingReport={editingReport}
            onSave={handleSaveReport}
            onCancel={() => {}}
            currentUserId={user.id}
          />
        )}

        {view === 'history' && (
          <History
            reports={reports}
            onEdit={handleEditReport}
            onDelete={handleDeleteReport}
          />
        )}

        {view === 'milestones' && <Milestones reports={reports} />}

        {view === 'barchart' && <BarChart reports={reports} />}

        {/* AI Chatbot */}
        <Chatbot reports={reports} />
      </main>
    </div>
  );
};

export default App;
