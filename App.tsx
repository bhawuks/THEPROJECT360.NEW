import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './services/firebaseService';
import { DailyReport, User, ViewState } from './types';
import {
  addUser,  getReports,
  deleteReport,
} from './services/firestoreService';
import { EntryForm } from './components/EntryForm';
import { History } from './components/History';
import { Milestones } from './components/Milestones';
import { BarChart } from './components/BarChart';
import { Chatbot } from './components/Chatbot';
import { Auth } from './components/Auth';
import { MasterData } from './components/MasterData';
import {
  PlusCircle,
  History as HistoryIcon,
  LogOut,
  Construction,
  Flag,
  Menu,
  X,
  Loader2,
  BarChart2,
  Database,
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
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          const newUser = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            username: firebaseUser.displayName || 'User',
          };
          setUser(newUser);
          await addUser(newUser);
          loadReports(newUser.id);
        } else {
          setUser(null);
          setReports([]);
        }
        setLoading(false);
      });
      return () => unsubscribe();
    } else {
      setFirebaseInitialized(false);
      setLoading(false);
    }
  }, []);

  const loadReports = async (userId: string) => {
    try {
      const loadedReports = await getReports(userId);
      setReports(loadedReports);
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  };

  const handleSaveReport = async (report: DailyReport) => {
    if (!user) return;
    try {
      await loadReports(user.id);
      // stay on Entry Form after save
      setEditingReport(null);
      alert("Report saved successfully!");
    } catch (error) {
      console.error('Error saving report:', error);
      alert('Failed to save report. Please try again.');
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!user || !confirm('Are you sure you want to delete this report?')) return;
    try {
      await deleteReport(user.id, reportId);
      await loadReports(user.id);
    } catch (error) {
      console.error('Error deleting report:', error);
    }
  };

  const handleEditReport = (report: DailyReport) => {
    setEditingReport(report);
    setView('entry');
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-black" size={48} />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const NavItem = ({
    targetView,
    icon: Icon,
    label,
  }: {
    targetView: ViewState;
    icon: any;
    label: string;
  }) => (
    <button
      onClick={() => {
        setView(targetView);
        setMobileMenuOpen(false);
        // NOTE: We do NOT clear editingReport here so your data persists
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold ${
        view === targetView
          ? 'bg-black text-white shadow-lg shadow-black/20'
          : 'text-gray-500 hover:bg-gray-100 hover:text-black'
      }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans text-gray-900">
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-72 bg-white border-r border-gray-100 transform transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } flex flex-col`}
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3 text-black">
            <div className="bg-black text-white p-2 rounded-xl">
              <Construction size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight uppercase">SiteReport</h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                Daily Logs
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden text-gray-400 hover:text-black"
          >
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavItem targetView="entry" icon={PlusCircle} label="New Entry" />
          <NavItem targetView="history" icon={HistoryIcon} label="History" />
          <NavItem targetView="masterdata" icon={Database} label="Master Data" />
          <NavItem targetView="milestones" icon={Flag} label="Milestones" />
          <NavItem targetView="barchart" icon={BarChart2} label="Progress" />
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-xs">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user.username}</p>
              <p className="text-xs text-gray-500 font-bold uppercase truncate">
                Site Supervisor
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-black"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-65px)] md:h-screen bg-white pb-24 md:pb-8 relative">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden absolute top-4 right-4 z-30 bg-white p-2 rounded-lg shadow-sm border border-gray-100"
        >
          <Menu size={24} />
        </button>

        {/* ✅ PERSISTENCE FIX: We hide EntryForm instead of destroying it */}
        <div style={{ display: view === 'entry' ? 'block' : 'none', height: '100%' }}>
          <EntryForm
            existingReport={editingReport}
            onSave={handleSaveReport}
            onCancel={() => setEditingReport(null)}
            currentUserId={user.id}
          />
        </div>

        {view === 'history' && (
          <History
            reports={reports}
            onEdit={handleEditReport}
            onDelete={handleDeleteReport}
          />
        )}

        {/* ✅ FIX: Explicitly pass user ID to MasterData */}
        {view === 'masterdata' && <MasterData currentUserId={user.id} />}
        
        {view === 'milestones' && <Milestones reports={reports} />}

        {view === 'barchart' && <BarChart reports={reports} />}

        <Chatbot 
          currentUserId={user.id} 
          reports={reports}
          onViewReport={(report) => {
            setEditingReport(report);
            setView('entry');
          }}
        />
      </main>
    </div>
  );
};

export default App;