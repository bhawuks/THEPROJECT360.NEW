import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { BaseEntry, DailyReport, RiskEntry, RiskImpact, RiskLikelihood, RiskStatus, EntryCategory, ActivityEntry, ResourceMemory } from '../types';
import { UNITS, RISK_IMPACTS, RISK_LIKELIHOODS, RISK_STATUSES } from '../constants';
import { Trash2, Plus, Save, ChevronLeft, ChevronDown, ChevronUp, Copy, CheckCircle2, Flag, AlertTriangle, Users, Package, Truck, Briefcase, LayoutList, Check, Calendar as CalendarIcon, ArrowLeft, X, TrendingDown, TrendingUp, DollarSign } from 'lucide-react';
import { db } from '../services/firebaseService';
import { doc, getDoc, setDoc, collection, getDocs, query, where, writeBatch, orderBy, limit } from 'firebase/firestore';


// ✅ DND-KIT (Sortable list)
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const generateId = () => Math.random().toString(36).substring(2, 9);
const formatActId = (n: number) => `ACT-${String(n).padStart(5, '0')}`;

const reindexActivities = (acts: ActivityEntry[]): ActivityEntry[] =>
  acts.map((a, idx) => ({ ...a, order: idx + 1, activityId: formatActId(idx + 1) }));

const getVisualIds = (acts: ActivityEntry[]) => {
  const grouped = acts.reduce((acc, a) => {
    const cat = a.workCategory || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {} as Record<string, ActivityEntry[]>);

  return Object.keys(grouped)
    .sort()
    .flatMap((cat) => grouped[cat].map((a) => a.id));
};

// Firestore returns untyped data; this keeps TS happy without changing UI logic.
const coerceActivities = (v: unknown): ActivityEntry[] => (Array.isArray(v) ? (v as ActivityEntry[]) : []);



// ------------------------------------------------------------------
// ✅ MANPOWER SMART MEMORY (Name-based templates saved in Firestore)
// ------------------------------------------------------------------
type ManpowerTemplate = {
  nameKey: string;
  name: string;
  trade?: string;
  unit?: string;
  regularHours?: number;
  overtime?: number;
  cost?: number;
  updatedAt: number;
};

const normalizeKey = (s: string) =>
  String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const safeDocId = (nameKey: string) =>
  encodeURIComponent(nameKey).replace(/%/g, "_"); // Firestore doc id safe

const toTitleCase = (s: string) =>
  String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

const normalizeUnit = (s: string) => {
  const v = String(s || "").trim();
  if (!v) return v;
  const low = v.toLowerCase();
  if (["hr", "hrs", "hour", "hours", "h"].includes(low)) return "Hrs";
  if (["day", "days", "d"].includes(low)) return "Day";
  return v;
};

const numOr = (v: any, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
// ------------------------------------------------------------------
// ✅ FIRESTORE-BACKED STORAGE SERVICE (keeps EntryForm UI intact)
// ------------------------------------------------------------------
// Schema:
// - users/{userId}/reports/{date}  (date = 'YYYY-MM-DD')
// - users/{userId}/resourceMemory/main
const emptyResourceMemory = (): ResourceMemory => ({
  manpower: {},
  material: {},
  equipment: {},
  subcontractor: {},
  risk: {}
});

const StorageService = {
  async getReportByDate(userId: string, date: string): Promise<DailyReport | null> {
    const ref = doc(db, 'users', userId, 'reports', date);
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as DailyReport) : null;
  },

  async saveReport(report: DailyReport): Promise<void> {
    const ref = doc(db, 'users', report.userId, 'reports', report.date);
    await setDoc(ref, report, { merge: true });
  },

  async getReportsInRange(userId: string, startDate: string, endDate: string): Promise<DailyReport[]> {
    const colRef = collection(db, 'users', userId, 'reports');
    const qRef = query(colRef, where('date', '>=', startDate), where('date', '<=', endDate));
    const snaps = await getDocs(qRef);
    return snaps.docs.map(d => d.data() as DailyReport);
  },

  async getResourceMemory(userId: string): Promise<ResourceMemory> {
    const ref = doc(db, 'users', userId, 'resourceMemory', 'main');
    const snap = await getDoc(ref);
    return snap.exists() ? (snap.data() as ResourceMemory) : emptyResourceMemory();
  },

  async saveResourceMemory(userId: string, mem: ResourceMemory): Promise<void> {
    const ref = doc(db, 'users', userId, 'resourceMemory', 'main');
    await setDoc(ref, mem, { merge: true });
  },

  async findActivityHistory(userId: string, activityId: string): Promise<boolean> {
    // Note: This scans the user's reports. Fine for small/medium usage; can be optimized later with an index collection.
    const colRef = collection(db, 'users', userId, 'reports');
    const snaps = await getDocs(colRef);
    const target = activityId.toUpperCase();
    for (const d of snaps.docs) {
      const rep = d.data() as DailyReport;
      if (rep?.activities?.some(a => String(a.activityId || '').toUpperCase() === target)) return true;
    }
    return false;
  },

  async rippleShiftActivityIds(userId: string, activityId: string): Promise<void> {
    // Shifts all activities with numeric part >= conflict upward by 1 across ALL reports.
    const match = activityId.match(/(.*?)(\d+)/);
    if (!match) return;
    const prefix = match[1] || 'ACT-';
    const conflictNum = parseInt(match[2], 10) || 0;

    const colRef = collection(db, 'users', userId, 'reports');
    const snaps = await getDocs(colRef);

    const getNum = (idStr: string) => parseInt(String(idStr).match(/\d+/)?.[0] || '0', 10);

    const batch = writeBatch(db);
    let touched = 0;

    snaps.docs.forEach(docSnap => {
      const rep = docSnap.data() as DailyReport;
      if (!rep?.activities?.length) return;

      let changed = false;
      const newActs = rep.activities.map(a => {
        const aId = String(a.activityId || '');
        const n = getNum(aId);
        const p = aId.match(/^[^\d]+/)?.[0] || prefix;

        if (p.toUpperCase() === prefix.toUpperCase() && n >= conflictNum) {
          changed = true;
          const next = `${p}${String(n + 1).padStart(5, '0')}`;
          return { ...a, activityId: next };
        }
        return a;
      });

      if (changed) {
        const ref = doc(db, 'users', userId, 'reports', rep.date);
        batch.set(ref, { ...rep, activities: newActs, updatedAt: Date.now() }, { merge: true });
        touched += 1;
      }
    });

    if (touched > 0) await batch.commit();
  }
};

// ------------------------------------------------------------------
// ✅ DATE & MATH HELPERS
// ------------------------------------------------------------------
const toDate = (s?: string) => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};
const dayDiff = (from?: string, to?: string) => {
  const a = toDate(from);
  const b = toDate(to);
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
};
const inclusiveDays = (start?: string, finish?: string) => {
  const d = dayDiff(start, finish);
  if (d === null) return null;
  return d + 1;
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------
// ✅ RISK COST MODELLING HELPERS (ONLY USED IN RISK REGISTER UI)
// ------------------------------------------------------------------
const num = (v: any) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const money2 = (n: number) => round2(n);

const safeDays = (start?: string, finish?: string) => {
  const d = inclusiveDays(start, finish);
  return d && d > 0 ? d : 0;
};

type CostModel = {
  plannedDays: number;
  daily: {
    manpower: number;
    material: number;
    equipment: number;
    subcontractor: number;
    total: number;
  };
  total: {
    manpower: number;
    material: number;
    equipment: number;
    subcontractor: number;
    mostLikely: number;
    optimistic: number;
    pessimistic: number;
    stdDev: number;
    expected: number;
  };
};

const buildCostModelForActivity = (a: ActivityEntry | null | undefined): CostModel => {
  const plannedDays = a ? safeDays(a.plannedStart, a.plannedFinish) : 0;

  const manpowerDaily =
    a?.manpower?.reduce((sum, m) => {
      const hrs = num(m.quantity);
      const ot = num((m as any).overtime);
      const rate = num(m.cost);
      return sum + (hrs + ot) * rate;
    }, 0) ?? 0;

  const equipmentDaily =
    a?.equipment?.reduce((sum, e) => {
      const hrs = num(e.quantity);
      const rate = num(e.cost);
      return sum + hrs * rate;
    }, 0) ?? 0;

  const materialDaily =
    a?.material?.reduce((sum, m) => {
      const qty = num(m.quantity);
      const unitCost = num(m.cost);
      return sum + qty * unitCost;
    }, 0) ?? 0;

  const subcontractorDaily =
    a?.subcontractor?.reduce((sum, s) => {
      const qty = num(s.quantity);
      const unitCost = num(s.cost);
      return sum + qty * unitCost;
    }, 0) ?? 0;

  const dailyTotal = manpowerDaily + equipmentDaily + materialDaily + subcontractorDaily;

  const mostLikely = dailyTotal * plannedDays;
  const optimistic = mostLikely * 0.90;
  const pessimistic = mostLikely * 1.21;

  const stdDev = (pessimistic - optimistic) / 6;
  const expected = (optimistic + 4 * mostLikely + pessimistic) / 6;

  return {
    plannedDays,
    daily: {
      manpower: manpowerDaily,
      material: materialDaily,
      equipment: equipmentDaily,
      subcontractor: subcontractorDaily,
      total: dailyTotal
    },
    total: {
      manpower: manpowerDaily * plannedDays,
      material: materialDaily * plannedDays,
      equipment: equipmentDaily * plannedDays,
      subcontractor: subcontractorDaily * plannedDays,
      mostLikely,
      optimistic,
      pessimistic,
      stdDev,
      expected
    }
  };
};

// ------------------------------------------------------------------
// ✅ UNIVERSAL DATE PICKER (Smart View Logic)
// ------------------------------------------------------------------
interface UniversalDatePickerProps {
  initialDate: string; // The date to select
  referenceDate?: string; // The date to open the view to if initialDate is empty
  onSelect: (date: string) => void;
  onClose: () => void;
  label: string;
}

const UniversalDatePicker: React.FC<UniversalDatePickerProps> = ({ initialDate, referenceDate, onSelect, onClose, label }) => {
  const initD = useMemo(() => {
    const d = new Date(initialDate || referenceDate || '');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [initialDate, referenceDate]);

  const [viewYear, setViewYear] = useState(initD.getFullYear());
  const [viewMonth, setViewMonth] = useState(initD.getMonth()); 
  const yearListRef = useRef<HTMLDivElement>(null);

  const years = Array.from({ length: 101 }, (_, i) => 1980 + i);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    if (yearListRef.current) {
      const selectedBtn = yearListRef.current.querySelector(`[data-year="${viewYear}"]`);
      if (selectedBtn) {
        selectedBtn.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    }
  }, [viewYear]);

  const handleDayClick = (d: number) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const dayStr = String(d).padStart(2, '0');
    onSelect(`${viewYear}-${m}-${dayStr}`);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl border-4 border-black shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-black text-white p-4 flex justify-between items-center shrink-0">
          <div>
            <div className="text-[10px] font-bold uppercase opacity-70 tracking-widest">{label}</div>
            <div className="text-xl font-black uppercase flex items-center gap-2">
              <CalendarIcon size={20} />
              {months[viewMonth]} {viewYear}
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all"><X size={20} /></button>
        </div>
        <div className="flex flex-1 overflow-hidden h-[400px]">
          <div ref={yearListRef} className="w-24 bg-gray-50 border-r border-gray-200 overflow-y-scroll entry-scrollbar shrink-0">
            {years.map(y => (
              <button key={y} data-year={y} onClick={() => setViewYear(y)}
                className={`w-full p-3 text-sm font-bold text-center border-b border-gray-100 transition-colors ${y === viewYear ? 'bg-black text-white' : 'text-gray-400 hover:text-black hover:bg-white'}`}>
                {y}
              </button>
            ))}
          </div>
          <div className="w-24 bg-gray-50 border-r border-gray-200 overflow-y-scroll entry-scrollbar shrink-0">
             {months.map((m, idx) => (
              <button key={m} onClick={() => setViewMonth(idx)}
                className={`w-full p-3 text-sm font-bold text-center border-b border-gray-100 uppercase transition-colors ${idx === viewMonth ? 'bg-black text-white' : 'text-gray-400 hover:text-black hover:bg-white'}`}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-scroll p-4 bg-white entry-scrollbar">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (<div key={d} className="text-center text-[10px] font-black text-gray-400 uppercase">{d}</div>))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {blanks.map((b, i) => <div key={`b-${i}`}></div>)}
              {days.map(d => {
                const isSelected = viewYear === initD.getFullYear() && viewMonth === initD.getMonth() && d === initD.getDate();
                return (
                  <button key={d} onClick={() => handleDayClick(d)}
                    className={`aspect-square rounded-lg border-2 text-sm font-bold flex items-center justify-center transition-all ${isSelected ? 'bg-black text-white border-black' : 'border-gray-100 text-black hover:border-black'}`}>
                    {d}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// MAIN COMPONENTS
// ------------------------------------------------------------------

const SortableActivityCard: React.FC<{ activity: ActivityEntry; onClick: () => void; children: React.ReactNode; }> = ({ activity, onClick, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: activity.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.65 : 1 };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick} className="select-none" title="Drag to reorder">
      {children}
    </div>
  );
};

const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);
  return (
    <div className="fixed bottom-24 right-4 bg-black text-white px-6 py-4 rounded-lg shadow-xl flex items-center gap-3 z-50 animate-fade-in-up border border-gray-700">
      <CheckCircle2 className="text-white" size={20} />
      <span className="font-bold text-sm">{message}</span>
    </div>
  );
};

const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1 w-full mb-6">
    <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider pl-1">{label}</label>
    <div className="w-full">{children}</div>
  </div>
);

const SummaryResourceSection = ({ title, icon: Icon, items }: { title: string; icon: any; items: any[] }) => {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <h5 className="text-[10px] font-black uppercase text-gray-500 mb-2 flex items-center gap-1"><Icon size={12} /> {title} ({items.length})</h5>
      <div className="grid gap-2">
        {items.map((item: any, i: number) => (
          <div key={i} className="bg-gray-50 p-2 rounded text-xs border border-gray-100 flex flex-wrap gap-x-3 gap-y-1">
            <span className="font-bold">{item.code}</span>
            <span className="font-medium text-gray-700">{item.name || item.description}</span>
            {item.quantity && <span className="bg-white border px-1 rounded text-[10px] font-bold">{item.quantity} {item.unit}</span>}
            {item.overtime && <span className="bg-white border px-1 rounded text-[10px] font-bold text-blue-600">+{item.overtime} OT</span>}
            {item.status && <span className="text-[10px] bg-red-100 text-red-800 px-1 rounded font-bold">{item.status}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

interface EntryFormProps {
  existingReport?: DailyReport | null;
  onSave: (report: DailyReport) => void;
  onCancel: () => void;
  currentUserId: string;
}

export const EntryForm: React.FC<EntryFormProps> = ({ existingReport, onSave, onCancel, currentUserId }) => {
  const [viewMode, setViewMode] = useState<'selector' | 'form'>('selector');
  const [browseYear, setBrowseYear] = useState(new Date().getFullYear());
  const [browseMonth, setBrowseMonth] = useState(new Date().getMonth());
  const [monthHasReports, setMonthHasReports] = useState<Set<string>>(new Set());

  const [date, setDate] = useState<string>(existingReport?.date || new Date().toISOString().split('T')[0]);
  const [reportId, setReportId] = useState<string>(existingReport?.id || generateId());
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [resourceMemory, setResourceMemory] = useState<ResourceMemory>(emptyResourceMemory());

  const [mpTemplates, setMpTemplates] = useState<ManpowerTemplate[]>([]);
  const mpTemplateMap = useMemo(() => new Map(mpTemplates.map(t => [t.nameKey, t] as const)), [mpTemplates]);
  const mpSaveTimerRef = useRef<number | null>(null);

  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copyTargetDate, setCopyTargetDate] = useState('');
  const [showSavedDialog, setShowSavedDialog] = useState(false);
  const [showDeleteActivityConfirm, setShowDeleteActivityConfirm] = useState(false);
  
  // ✅ DATE PICKER STATES
  const [datePickerTarget, setDatePickerTarget] = useState<{ activityId: string, field: 'plannedStart' | 'plannedFinish' | 'actualStart' | 'actualFinish', label: string } | null>(null);
  const [showCopyDatePicker, setShowCopyDatePicker] = useState(false);
  const [asOnDate, setAsOnDate] = useState<string>(date);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;
    setActivities((prev) => {
      const visualIds = getVisualIds(prev);
      const oldIndex = visualIds.indexOf(String(active.id));
      const newIndex = visualIds.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
    
      const newVisualIds = arrayMove(visualIds, oldIndex, newIndex);
      const byId = new Map(prev.map((a) => [a.id, a] as const));
    
      const reordered = newVisualIds
        .map((id) => byId.get(id))
        .filter((a): a is ActivityEntry => Boolean(a));
    
      return reindexActivities(reordered);
    });
    
  };
  const groupedActivities = useMemo(() => activities.reduce((acc, a) => {
    const cat = a.workCategory || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {} as Record<string, ActivityEntry[]>), [activities]);

  useEffect(() => { if (existingReport) { setViewMode('form'); setDate(existingReport.date); } }, [existingReport]);

  // ✅ Load resource memory from Firestore
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mem = await StorageService.getResourceMemory(currentUserId);
        if (!cancelled) setResourceMemory(mem);
      } catch {
        // keep default empty memory
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId]);

  // ✅ Load manpower templates (Name-based smart memory) from Firestore
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const colRef = collection(db, 'users', currentUserId, 'manpowerTemplates');
        const qRef = query(colRef, orderBy('updatedAt', 'desc'), limit(50));
        const snaps = await getDocs(qRef);
        if (cancelled) return;
        const list: ManpowerTemplate[] = snaps.docs.map(d => {
          const data: any = d.data() || {};
          const name = String(data.name || data.displayName || '').trim();
          const nameKey = normalizeKey(name || decodeURIComponent(String(d.id).replace(/_/g, '%')));
          return {
            nameKey,
            name: name || String(data.nameKey || '').trim() || '',
            trade: data.trade || '',
            unit: data.unit || '',
            regularHours: numOr(data.regularHours, 0),
            overtime: numOr(data.overtime, 0),
            cost: data.cost !== undefined ? numOr(data.cost, 0) : undefined,
            updatedAt: numOr(data.updatedAt, 0)
          };
        }).filter(t => t.nameKey && t.name);
        setMpTemplates(list);
      } catch {
        if (!cancelled) setMpTemplates([]);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId]);



  // ✅ Prefetch reports for the currently browsed month (for calendar dots)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const start = `${browseYear}-${String(browseMonth + 1).padStart(2, '0')}-01`;
        const end = `${browseYear}-${String(browseMonth + 1).padStart(2, '0')}-${String(new Date(browseYear, browseMonth + 1, 0).getDate()).padStart(2, '0')}`;
        const reps = await StorageService.getReportsInRange(currentUserId, start, end);
        if (cancelled) return;
        setMonthHasReports(new Set(reps.map(r => r.date)));
      } catch {
        if (!cancelled) setMonthHasReports(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [currentUserId, browseYear, browseMonth]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1) If parent passed an existingReport for this date, use it
      if (existingReport && existingReport.date === date) {
        if (cancelled) return;
        setReportId(existingReport.id);
        setActivities(coerceActivities((existingReport as any).activities));
        setSelectedActivityId(null);
        return;
      }

      // 2) Otherwise load from Firestore by date
      try {
        const existing = await StorageService.getReportByDate(currentUserId, date);
        if (cancelled) return;

        if (existing) {
          setReportId(existing.id || existing.date || generateId());
          setActivities(coerceActivities((existing as any).activities));
        } else {
          setReportId(generateId());
          setActivities([]);
          setSelectedActivityId(null);
        }
      } catch {
        if (cancelled) return;
        // Fail-safe: don't crash UI
        setReportId(generateId());
        setActivities([]);
        setSelectedActivityId(null);
      }

      setSelectedActivityId(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [existingReport, date, currentUserId]);

  useEffect(() => { setAsOnDate(date); }, [date, selectedActivityId]);

  useEffect(() => {
    const categories = Array.from(new Set(activities.map(a => a.workCategory || 'Uncategorized'))) as string[];
    const initialExpanded: Record<string, boolean> = {};
    categories.forEach(c => initialExpanded[c] = true);
    setExpandedCategories(prev => ({ ...initialExpanded, ...prev }));
  }, [activities.length]);

  const toggleCategory = (category: string) => { setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] })); };

  const addActivity = () => {
    const maxOrder = activities.reduce((max, a) => Math.max(max, a.order || 0), 0);
    const nextNum = maxOrder + 1;
    const newActivity: ActivityEntry = {
      id: generateId(), activityId: `ACT-${String(nextNum).padStart(5, '0')}`, order: nextNum, description: '', responsiblePerson: '', workCategory: '', detailedDescription: '', plannedCompletion: 0, plannedQuantity: 0, actualQuantity: 0, quantityUnit: 'm', referenceCode: '', workArea: '', stationGrid: '', 
      plannedStart: date, plannedFinish: date, actualStart: '', actualFinish: '', isMilestone: false, manpower: [], material: [], equipment: [], subcontractor: [], risks: []
    };
    setActivities(prev => reindexActivities([...prev, newActivity]));
    setSelectedActivityId(newActivity.id);
  };

  const deleteSelectedActivity = () => {
    if (!selectedActivityId) return;
    setActivities(prev => {
      const filtered = prev.filter(a => a.id !== selectedActivityId);
      return reindexActivities(filtered);
    });
    setSelectedActivityId(null);
    setShowDeleteActivityConfirm(false);
    setToastMessage("Activity removed.");
  };

  const handleActivityIdBlur = (id: string, newIdString: string) => {
    requestAnimationFrame(() => { (async () => {
      const upperId = newIdString.toUpperCase();
      const conflictInHistory = await StorageService.findActivityHistory(currentUserId, upperId);
      const conflictInCurrent = activities.some(a => a.activityId === upperId && a.id !== id);
      if (conflictInHistory || conflictInCurrent) {
        const confirmShift = window.confirm(`Activity ID "${upperId}" is already in use.\n\nOK: Insert here and SHIFT existing activities down.\nCancel: Keep duplicate ID.`);
        if (confirmShift) {
          await StorageService.rippleShiftActivityIds(currentUserId, upperId);
          const getNum = (idStr: string) => parseInt(idStr.match(/\d+/)?.[0] || '0');
          const conflictNum = getNum(upperId);
          setActivities(prev => prev.map(a => {
            if (a.id === id) { return { ...a, activityId: upperId }; }
            const currentNum = getNum(a.activityId);
            if (currentNum >= conflictNum) {
              const prefix = a.activityId.match(/^[^\d]+/)?.[0] || "ACT-";
              const newId = `${prefix}${String(currentNum + 1).padStart(5, '0')}`;
              return { ...a, activityId: newId };
            }
            return a;
          }));
          setToastMessage("Activities shifted successfully.");
        } else { updateActivityField(id, 'activityId', upperId); }
      } else { updateActivityField(id, 'activityId', upperId); }
    })(); });
  };

  const updateActivityField = (id: string, field: keyof ActivityEntry, value: any) => {
    setActivities(prev => prev.map(a => a.id === id ? { ...a, [field]: value } : a));
  };

  const getActiveActivity = () => activities.find(a => a.id === selectedActivityId);
  
  const addItemToActivity = (category: EntryCategory) => {
    if (!selectedActivityId) return;
    const act = getActiveActivity(); if (!act) return;
    const prefixMap: Record<EntryCategory, string> = { manpower: 'MAN', material: 'MAT', equipment: 'EQ', subcontractor: 'SUB' };
    const key = category as keyof ActivityEntry;
    const currentList = act[key] as BaseEntry[];
    const maxCode = currentList.reduce((max, item) => Math.max(max, parseInt(item.code.split('-')[1]) || 0), 0);
    const newItem: BaseEntry = { id: generateId(), code: `${prefixMap[category]}-${String(maxCode + 1).padStart(2, '0')}`, name: '', quantity: 0, unit: '', comments: '' };
    setActivities(prev => prev.map(a => a.id === selectedActivityId ? { ...a, [key]: [...currentList, newItem] } : a));
  };
  const updateItemInActivity = (category: EntryCategory, itemId: string, field: keyof BaseEntry, value: any) => {
    const key = category as keyof ActivityEntry;
    setActivities(prev => prev.map(a => a.id === selectedActivityId ? { ...a, [key]: (a[key] as any[]).map(i => i.id === itemId ? { ...i, [field]: value } : i) } : a));
  };
  const handleResourceCodeBlur = (category: EntryCategory | 'risk', itemId: string, code: string) => {
    requestAnimationFrame(() => {
      if (!code) return;
      const upperCode = code.toUpperCase();
      const mem = resourceMemory[category][upperCode];
      if (mem) {
        if (category === 'risk') {
          setActivities(prev => prev.map(a => a.id === selectedActivityId ? { ...a, risks: a.risks.map(r => r.id === itemId ? { ...r, description: mem.description || r.description, likelihood: (mem.likelihood as RiskLikelihood) || r.likelihood, impact: (mem.impact as RiskImpact) || r.impact, status: (mem.status as RiskStatus) || r.status, mitigation: mem.mitigation || r.mitigation, code: upperCode } : r) } : a));
        } else {
          setActivities(prev => prev.map(a => a.id === selectedActivityId ? { ...a, [category]: (a[category as EntryCategory] as BaseEntry[]).map(i => i.id === itemId ? { ...i, name: mem.name || i.name, unit: mem.unit || i.unit, cost: mem.cost !== undefined ? mem.cost : i.cost, trade: mem.trade || i.trade, company: mem.company || i.company, quantity: mem.quantity || i.quantity, comments: mem.comments || i.comments, code: upperCode } : i) } : a));
        }
        setToastMessage("Smart memory applied.");
      }
    });
  };
  

  // ------------------------------------------------------------------
  // ✅ Manpower smart memory (Name → auto-fill other cells + suggestions)
  // ------------------------------------------------------------------
  const queueSaveManpowerTemplate = useCallback((row: any) => {
    const rawName = String(row?.name || "").trim();
    const nameKey = normalizeKey(rawName);
    if (!nameKey) return;

    const template: ManpowerTemplate = {
      nameKey,
      name: toTitleCase(rawName),
      trade: toTitleCase(String(row?.trade || "")),
      unit: normalizeUnit(String(row?.unit || "")),
      regularHours: numOr(row?.quantity, 0),
      overtime: numOr((row as any)?.overtime, 0),
      cost: row?.cost !== undefined && row?.cost !== "" ? numOr(row?.cost, 0) : undefined,
      updatedAt: Date.now(),
    };

    // Debounce writes (keeps Firestore cost low + avoids spam)
    if (mpSaveTimerRef.current) window.clearTimeout(mpSaveTimerRef.current);
    mpSaveTimerRef.current = window.setTimeout(async () => {
      try {
        const docId = safeDocId(template.nameKey);
        const ref = doc(db, "users", currentUserId, "manpowerTemplates", docId);
        await setDoc(ref, template, { merge: true });

        // Update local list so suggestions are instant
        setMpTemplates((prev) => {
          const others = prev.filter((t) => t.nameKey !== template.nameKey);
          return [template, ...others].slice(0, 50);
        });
      } catch {
        // no-op
      }
    }, 500);
  }, [currentUserId, mpSaveTimerRef]);

  const applyManpowerTemplate = useCallback((itemId: string, rawName: string) => {
    const nameKey = normalizeKey(rawName);
    if (!nameKey) return;
    const tpl = mpTemplateMap.get(nameKey);
    if (!tpl) return;

    setActivities((prev) =>
      prev.map((a) => {
        if (a.id !== selectedActivityId) return a;
        const updated = (a.manpower || []).map((m: any) => {
          if (m.id !== itemId) return m;

          const next: any = { ...m };

          // Only fill if empty/zero (user can still override anytime)
          if (!String(next.trade || "").trim() && tpl.trade) next.trade = tpl.trade;
          if (!String(next.unit || "").trim() && tpl.unit) next.unit = tpl.unit;
          if (!numOr(next.quantity, 0) && tpl.regularHours !== undefined) next.quantity = tpl.regularHours;
          if (!numOr(next.overtime, 0) && tpl.overtime !== undefined) next.overtime = tpl.overtime;
          if ((next.cost === undefined || next.cost === "" || numOr(next.cost, 0) === 0) && tpl.cost !== undefined) next.cost = tpl.cost;

          return next;
        });

        return { ...a, manpower: updated };
      })
    );

    setToastMessage("Manpower template applied.");
  }, [mpTemplateMap, selectedActivityId]);

  const handleManpowerNameBlur = useCallback((itemId: string, row: any) => {
    // Apply from existing template first (if any)
    applyManpowerTemplate(itemId, row?.name || "");

    // Then persist latest values as the new template
    queueSaveManpowerTemplate({
      ...row,
      name: toTitleCase(String(row?.name || "")),
      trade: toTitleCase(String(row?.trade || "")),
      unit: normalizeUnit(String(row?.unit || "")),
    });
  }, [applyManpowerTemplate, queueSaveManpowerTemplate]);

const deleteItemFromActivity = (category: EntryCategory, itemId: string) => {
    const key = category as keyof ActivityEntry;
    setActivities(prev => prev.map(a => a.id === selectedActivityId ? { ...a, [key]: (a[key] as any[]).filter(i => i.id !== itemId) } : a));
  };
  const addRiskToActivity = () => {
    const act = getActiveActivity(); if (!act) return;
    const maxCode = act.risks.reduce((max, item) => Math.max(max, parseInt(item.code.split('-')[1]) || 0), 0);
    const newItem: RiskEntry = { id: generateId(), code: `RISK-${String(maxCode + 1).padStart(2, '0')}`, description: '', likelihood: RiskLikelihood.LOW, impact: RiskImpact.LOW, status: RiskStatus.OPEN, mitigation: '' };
    setActivities(prev => prev.map(a => a.id === selectedActivityId ? { ...a, risks: [...a.risks, newItem] } : a));
  };
  const updateRiskInActivity = (itemId: string, field: keyof RiskEntry, value: any) => {
    setActivities(prev => prev.map(a => a.id === selectedActivityId ? { ...a, risks: a.risks.map(r => r.id === itemId ? { ...r, [field]: value } : r) } : a));
  };

  const handleSave = async () => {
    const report: DailyReport = { id: reportId, userId: currentUserId, createdAt: existingReport?.createdAt || Date.now(), updatedAt: Date.now(), date, activities };
    const newMemory = { ...resourceMemory };
    activities.forEach(act => {
      act.manpower.forEach(m => { if (m.code) newMemory.manpower[m.code] = { name: m.name, trade: m.trade, unit: m.unit, cost: m.cost, quantity: m.quantity, comments: m.comments }; });
      act.material.forEach(m => { if (m.code) newMemory.material[m.code] = { name: m.name, unit: m.unit, cost: m.cost, quantity: m.quantity, comments: m.comments }; });
      act.equipment.forEach(m => { if (m.code) newMemory.equipment[m.code] = { name: m.name, unit: m.unit, cost: m.cost, quantity: m.quantity, comments: m.comments }; });
      act.subcontractor.forEach(m => { if (m.code) newMemory.subcontractor[m.code] = { name: m.name, company: m.company, unit: m.unit, cost: m.cost, quantity: m.quantity, comments: m.comments }; });
      act.risks.forEach(r => { if (r.code) newMemory.risk[r.code] = { description: r.description, likelihood: r.likelihood, impact: r.impact, mitigation: r.mitigation, status: r.status }; });
    });
    setResourceMemory(newMemory);
    await StorageService.saveResourceMemory(currentUserId, newMemory);
    await await StorageService.saveReport(report);
    onSave(report);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setShowSavedDialog(true);
  };

  const handleCopyReport = async () => {
    if (!copyTargetDate) return;
    const report: DailyReport = { id: generateId(), userId: currentUserId, createdAt: Date.now(), updatedAt: Date.now(), date: copyTargetDate, activities: JSON.parse(JSON.stringify(activities)) };
    await StorageService.saveReport(report);
    setToastMessage(`Record duplicated to ${copyTargetDate}`);
    setShowCopyModal(false);
  };

  const renderDateSelector = () => {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 81 }, (_, i) => currentYear - 20 + i);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const firstDay = new Date(browseYear, browseMonth, 1).getDay();
    const daysInMonth = new Date(browseYear, browseMonth + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array.from({ length: firstDay }, (_, i) => i);
    return (
      <div className="flex flex-col md:flex-row h-full animate-fade-in bg-white">
        <div className="w-full md:w-32 flex-shrink-0 border-b-2 md:border-b-0 md:border-r-2 border-black flex flex-row md:flex-col overflow-x-auto md:overflow-y-scroll bg-gray-50 entry-scrollbar">
          <div className="p-3 bg-black text-white font-black text-xs uppercase sticky top-0 md:left-0 z-10 text-center">Year</div>
          {years.map(year => (
            <button key={year} onClick={() => setBrowseYear(year)} className={`p-4 font-black text-lg text-center transition-all ${year === browseYear ? 'bg-white text-black border-l-4 border-black' : 'text-gray-400 hover:text-black hover:bg-white'}`}>{year}</button>
          ))}
        </div>
        <div className="w-full md:w-40 flex-shrink-0 border-b-2 md:border-b-0 md:border-r-2 border-black flex flex-row md:flex-col overflow-x-auto md:overflow-y-scroll bg-gray-50 entry-scrollbar">
          <div className="p-3 bg-black text-white font-black text-xs uppercase sticky top-0 md:left-0 z-10 text-center">Month</div>
          {months.map((month, idx) => (
            <button key={month} onClick={() => setBrowseMonth(idx)} className={`p-4 font-bold text-base text-center transition-all uppercase ${idx === browseMonth ? 'bg-white text-black border-l-4 border-black' : 'text-gray-400 hover:text-black hover:bg-white'}`}>{month}</button>
          ))}
        </div>
        <div className="flex-1 p-4 md:p-8 overflow-y-scroll entry-scrollbar bg-white">
          <h2 className="text-3xl font-black uppercase tracking-tight mb-8">{new Date(browseYear, browseMonth).toLocaleString('default', { month: 'long' })} {browseYear}</h2>
          <div className="grid grid-cols-7 gap-2 w-full max-w-5xl">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (<div key={d} className="text-center font-black uppercase text-gray-400 text-xs py-2">{d}</div>))}
            {blanks.map(b => <div key={`blank-${b}`}></div>)}
            {days.map(d => {
              const currentDateStr = `${browseYear}-${String(browseMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const hasReport = monthHasReports.has(currentDateStr);
              return (
                <button key={d} onClick={() => { setDate(currentDateStr); setViewMode('form'); }} className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-center relative transition-all group ${hasReport ? 'bg-gray-100 border-black' : 'bg-white border-gray-200 hover:border-black'}`}>
                  <span className={`text-lg font-black ${hasReport ? 'text-black' : 'text-gray-600 group-hover:text-black'}`}>{d}</span>
                  {hasReport && <div className="w-1.5 h-1.5 bg-black rounded-full mt-1"></div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const act = getActiveActivity();

  const formula = useMemo(() => {
    if (!act) return null;
    const plannedDur = inclusiveDays(act.plannedStart, act.plannedFinish);
    const actualDurFull = inclusiveDays(act.actualStart, act.actualFinish);
    const actualDurToDate = inclusiveDays(act.actualStart, asOnDate);
    const durationVariance = plannedDur !== null ? ((actualDurFull ?? actualDurToDate ?? null) !== null ? (actualDurFull ?? actualDurToDate!) - plannedDur : null) : null;
    const startDelay = dayDiff(act.plannedStart, act.actualStart);
    const finishDelay = dayDiff(act.plannedFinish, act.actualFinish);

    const plannedQty = Number((act as any).plannedQuantity ?? 0);
    const actualQty = Number((act as any).actualQuantity ?? 0);
    const unit = String((act as any).quantityUnit ?? '');

    let plannedPctAsOn: number | null = null;
    const ps = toDate(act.plannedStart); const pf = toDate(act.plannedFinish); const ao = toDate(asOnDate);
    if (ps && pf && ao) {
      if (ao.getTime() >= pf.getTime()) plannedPctAsOn = 100;
      else if (ao.getTime() <= ps.getTime()) plannedPctAsOn = 0;
      else { const total = inclusiveDays(act.plannedStart, act.plannedFinish); const elapsed = inclusiveDays(act.plannedStart, asOnDate); if (total && elapsed) plannedPctAsOn = clamp((elapsed / total) * 100, 0, 100); }
    }

    const actualPct = plannedQty > 0 ? (actualQty / plannedQty) * 100 : null;
    const plannedQtyExpected = plannedPctAsOn !== null ? (plannedQty * plannedPctAsOn) / 100 : null;
    const shortfall = plannedQtyExpected !== null ? plannedQtyExpected - actualQty : (plannedQty ? plannedQty - actualQty : null);
    const plannedRate = plannedDur && plannedDur > 0 ? plannedQty / plannedDur : null;
    const actualRate = actualDurToDate && actualDurToDate > 0 ? actualQty / actualDurToDate : null;
    const scheduleVarianceQty = plannedQtyExpected !== null ? actualQty - plannedQtyExpected : null;
    const spi = plannedQtyExpected && plannedQtyExpected > 0 ? actualQty / plannedQtyExpected : null;

    const cm = buildCostModelForActivity(act);
    const plannedCostTotal = cm.total.mostLikely;
    const pv = plannedPctAsOn !== null ? (plannedCostTotal * plannedPctAsOn) / 100 : null;
    const ev = actualPct !== null ? (plannedCostTotal * actualPct) / 100 : null;
    const ac = (actualDurToDate && actualDurToDate > 0) ? (cm.daily.total * actualDurToDate) : (cm.daily.total || 0);
    const cpi = ev !== null && ac > 0 ? ev / ac : null;
    const performancePct = (plannedRate !== null && actualRate !== null && plannedRate > 0) ? (actualRate / plannedRate) * 100 : null;

    return { plannedDur, actualDurFull, actualDurToDate, durationVariance, startDelay, finishDelay, plannedQty, actualQty, unit, plannedPctAsOn, actualPct, plannedQtyExpected, shortfall, plannedRate, actualRate, scheduleVarianceQty, spi, cpi, performancePct };
  }, [act, asOnDate]);

  const costModel = useMemo(() => {
    return buildCostModelForActivity(act);
  }, [act]);

  if (viewMode !== 'form') {
    return (
      <div className="bg-white rounded-xl shadow-lg border-2 border-black flex flex-col h-full relative overflow-hidden">
        <style>{`.entry-scrollbar { scrollbar-width: thin; scrollbar-color: #000 #fff; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; overflow-y: scroll !important; } @media (min-width: 768px) { .entry-scrollbar::-webkit-scrollbar { width: 16px !important; height: 16px !important; display: block !important; } .entry-scrollbar::-webkit-scrollbar-track { background: #f1f1f1 !important; border-left: 2px solid #000000 !important; } .entry-scrollbar::-webkit-scrollbar-thumb { background-color: #000000 !important; border: 4px solid #ffffff !important; border-radius: 99px !important; } }`}</style>
        {renderDateSelector()}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border-2 border-black flex flex-col h-full relative overflow-hidden">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      <style>{`.entry-scrollbar { scrollbar-width: thin; scrollbar-color: #000 #f1f1f1; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; overflow-y: scroll !important; } @media (min-width: 768px) { .entry-scrollbar::-webkit-scrollbar { width: 16px !important; height: 16px !important; display: block !important; } .entry-scrollbar::-webkit-scrollbar-track { background: #f1f1f1 !important; border-left: 2px solid #000000 !important; } .entry-scrollbar::-webkit-scrollbar-thumb { background-color: #000000 !important; border: 4px solid #ffffff !important; border-radius: 99px !important; } }`}</style>

      {datePickerTarget && act && (
        <UniversalDatePicker 
          initialDate={act[datePickerTarget.field] as string}
          referenceDate={act.plannedStart} // ✅ Smart reference logic
          label={datePickerTarget.label}
          onClose={() => setDatePickerTarget(null)}
          onSelect={(d) => {
             updateActivityField(act.id, datePickerTarget.field, d);
             setDatePickerTarget(null);
          }}
        />
      )}

      {/* ✅ SMART COPY DATE PICKER */}
      {showCopyDatePicker && (
        <UniversalDatePicker
           initialDate={copyTargetDate}
           referenceDate={date} // ✅ FIXED: Uses current report's date as reference
           label="Select Copy Target Date"
           onClose={() => setShowCopyDatePicker(false)}
           onSelect={(d) => {
             setCopyTargetDate(d);
             setShowCopyDatePicker(false);
           }}
        />
      )}

      <div className="p-4 border-b-2 border-black bg-white flex justify-between items-center z-20">
        <div className="flex items-center gap-4">
          <button onClick={() => setViewMode('selector')} className="bg-gray-100 hover:bg-black hover:text-white p-2 rounded-lg transition-colors border-2 border-transparent hover:border-black"><ArrowLeft size={20} /></button>
          <div><h2 className="text-lg font-black text-black uppercase tracking-tight flex items-center gap-2">Daily Record <span className="text-gray-400 font-bold text-sm bg-gray-100 px-2 py-0.5 rounded border border-gray-200">{date}</span></h2></div>
        </div>
        <button onClick={() => { setCopyTargetDate(date); setShowCopyModal(true); }} className="p-3 bg-gray-100 rounded-lg border-2 border-black hover:bg-black hover:text-white transition-all shadow-sm"><Copy size={18} /></button>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white">
        <div className={`entry-scrollbar w-full md:w-1/3 border-r-2 border-black bg-white overflow-y-scroll ${selectedActivityId ? 'hidden md:block' : 'block'}`}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={getVisualIds(activities)} strategy={verticalListSortingStrategy}>
              {Object.keys(groupedActivities).sort().map(cat => (
                <div key={cat} className="border-b border-gray-200">
                  <button onClick={() => toggleCategory(cat)} className="w-full flex justify-between items-center p-4 hover:bg-gray-50 text-left font-bold text-sm uppercase">{cat} ({groupedActivities[cat].length}) {expandedCategories[cat] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                  {expandedCategories[cat] && groupedActivities[cat].map(a => (
                    <SortableActivityCard key={a.id} activity={a} onClick={() => setSelectedActivityId(a.id)}>
                      <div className={`p-4 mx-3 mb-3 rounded-lg border-2 cursor-pointer transition-all ${selectedActivityId === a.id ? 'bg-black text-white border-black shadow-md' : 'bg-white text-black border-gray-200 hover:border-black'}`}>
                        <div className="flex justify-between items-center mb-1"><span className="font-mono text-xs font-bold">{a.activityId}</span>{a.isMilestone && <Flag size={14} className="fill-current" />}</div>
                        <div className="text-sm font-black truncate">{a.description || 'Untitled Activity'}</div>
                        <div className="text-[10px] uppercase font-bold text-gray-400 mt-1">Planned: {a.plannedQuantity ?? 0} {a.quantityUnit ?? ''} • Actual: {a.actualQuantity ?? 0} {a.quantityUnit ?? ''}</div>
                      </div>
                    </SortableActivityCard>
                  ))}
                </div>
              ))}
              {activities.length === 0 && <div className="p-12 text-center text-gray-400 font-bold uppercase text-xs italic leading-relaxed">No activities recorded.<br />Click "New Activity" to begin.</div>}
            </SortableContext>
          </DndContext>
        </div>

        <div className={`entry-scrollbar flex-1 overflow-y-scroll bg-gray-50 ${selectedActivityId ? 'block' : 'hidden md:block'}`}>
          {act ? (
            <div className="p-4 md:p-10 pb-40 space-y-10 max-w-2xl mx-auto">
              <div className="flex justify-between items-center">
                <button onClick={() => setSelectedActivityId(null)} className="md:hidden text-xs font-black uppercase flex items-center gap-1 bg-white border-2 border-black px-4 py-2 rounded-lg"><ChevronLeft size={16} /> Back</button>
                <button onClick={() => setShowDeleteActivityConfirm(true)} className="flex items-center gap-2 px-4 py-2 text-red-600 border-2 border-red-600 rounded-lg font-black uppercase text-xs hover:bg-red-600 hover:text-white transition-all">
                  <Trash2 size={16} /> Delete Activity
                </button>
              </div>

              <div className="bg-white p-8 rounded-2xl border-2 border-black shadow-sm flex flex-col gap-0">
                <InputGroup label="1) Activity ID"><input className="w-full font-mono font-black text-2xl border-b-4 border-black focus:outline-none bg-transparent py-2 uppercase" value={act.activityId} onChange={e => updateActivityField(act.id, 'activityId', e.target.value)} onBlur={e => handleActivityIdBlur(act.id, e.target.value)} /></InputGroup>
                <InputGroup label="2) Ref Code"><input className="w-full font-black text-xl border-b-4 border-gray-300 focus:border-black focus:outline-none bg-transparent py-2 uppercase" value={act.referenceCode} onChange={e => updateActivityField(act.id, 'referenceCode', e.target.value)} /></InputGroup>
                <InputGroup label="3) Activity Name"><input className="w-full font-black text-lg border-b-2 border-gray-200 focus:border-black py-3 bg-transparent outline-none" value={act.description} onChange={e => updateActivityField(act.id, 'description', e.target.value)} /></InputGroup>
                <InputGroup label="4) Category"><input className="w-full font-bold border-b-2 border-gray-200 focus:border-black py-3 bg-transparent outline-none" value={act.workCategory} onChange={e => updateActivityField(act.id, 'workCategory', e.target.value)} /></InputGroup>

                <InputGroup label="5) Planned Quantity">
                  <div className="flex gap-3 items-center">
                    <input type="number" className="w-full font-black text-lg border-b-2 border-gray-200 focus:border-black py-3 bg-transparent outline-none" value={act.plannedQuantity ?? 0} onChange={e => updateActivityField(act.id, 'plannedQuantity', parseFloat(e.target.value))} />
                    <input className="w-24 font-bold border-b-2 border-gray-200 focus:border-black py-3 bg-transparent outline-none uppercase" value={act.quantityUnit ?? 'm'} onChange={e => updateActivityField(act.id, 'quantityUnit', e.target.value)} placeholder="m" />
                  </div>
                </InputGroup>
                <InputGroup label="6) Actual Quantity">
                  <div className="flex gap-3 items-center">
                    <input type="number" className="w-full font-black text-lg border-b-2 border-gray-200 focus:border-black py-3 bg-transparent outline-none" value={act.actualQuantity ?? 0} onChange={e => updateActivityField(act.id, 'actualQuantity', parseFloat(e.target.value))} />
                    <div className="w-24 text-xs font-black uppercase text-gray-400 py-3">{act.quantityUnit ?? 'm'}</div>
                  </div>
                </InputGroup>

                <InputGroup label="7) Detailed Progress Notes"><textarea className="w-full text-base border-2 border-gray-200 rounded-xl p-4 focus:border-black h-32 outline-none" value={act.detailedDescription} onChange={e => updateActivityField(act.id, 'detailedDescription', e.target.value)} /></InputGroup>
                <InputGroup label="8) Supervisor"><input className="w-full border-b-2 border-gray-200 font-bold py-3 text-base outline-none focus:border-black" value={act.responsiblePerson} onChange={e => updateActivityField(act.id, 'responsiblePerson', e.target.value)} /></InputGroup>
                <InputGroup label="9) Location / Work Area"><input className="w-full border-b-2 border-gray-200 font-bold py-3 text-base outline-none focus:border-black" value={act.workArea} onChange={e => updateActivityField(act.id, 'workArea', e.target.value)} /></InputGroup>
                <InputGroup label="10) Station / Grid Line"><input className="w-full border-b-2 border-gray-200 font-bold py-3 text-base outline-none focus:border-black" value={act.stationGrid} onChange={e => updateActivityField(act.id, 'stationGrid', e.target.value)} /></InputGroup>

                <div className="bg-gray-50 p-6 rounded-2xl border-2 border-gray-200 mt-6 space-y-6">
                  <InputGroup label="11) Planned Start">
                    <div onClick={() => setDatePickerTarget({ activityId: act.id, field: 'plannedStart', label: 'Planned Start' })} className="w-full font-bold p-3 rounded-lg border-2 border-gray-200 bg-white flex justify-between items-center cursor-pointer hover:border-black transition-all">
                      <span>{act.plannedStart || 'Select Date'}</span> <CalendarIcon size={16} className="text-gray-400" />
                    </div>
                  </InputGroup>
                  <InputGroup label="12) Planned Finish">
                     <div onClick={() => setDatePickerTarget({ activityId: act.id, field: 'plannedFinish', label: 'Planned Finish' })} className="w-full font-bold p-3 rounded-lg border-2 border-gray-200 bg-white flex justify-between items-center cursor-pointer hover:border-black transition-all">
                      <span>{act.plannedFinish || 'Select Date'}</span> <CalendarIcon size={16} className="text-gray-400" />
                    </div>
                  </InputGroup>
                  <InputGroup label="13) Actual Start">
                     <div onClick={() => setDatePickerTarget({ activityId: act.id, field: 'actualStart', label: 'Actual Start' })} className="w-full font-bold p-3 rounded-lg border-2 border-gray-200 bg-white flex justify-between items-center cursor-pointer hover:border-black transition-all">
                      <span>{act.actualStart || 'Select Date'}</span> <CalendarIcon size={16} className="text-gray-400" />
                    </div>
                  </InputGroup>
                  <InputGroup label="14) Actual Finish">
                     <div onClick={() => setDatePickerTarget({ activityId: act.id, field: 'actualFinish', label: 'Actual Finish' })} className="w-full font-bold p-3 rounded-lg border-2 border-gray-200 bg-white flex justify-between items-center cursor-pointer hover:border-black transition-all">
                      <span>{act.actualFinish || 'Select Date'}</span> <CalendarIcon size={16} className="text-gray-400" />
                    </div>
                  </InputGroup>
                </div>

                <div className="flex items-center gap-4 bg-gray-100 p-5 rounded-2xl mt-8 cursor-pointer hover:bg-black hover:text-white transition-all group" onClick={() => updateActivityField(act.id, 'isMilestone', !act.isMilestone)}>
                  <input type="checkbox" checked={act.isMilestone || false} readOnly className="w-6 h-6 rounded-lg border-2 border-black group-hover:border-white" />
                  <span className="text-sm font-black uppercase flex items-center gap-3"><Flag size={18} /> Tag as Milestone</span>
                </div>
              </div>

              

              <div className="bg-gray-50 p-6 rounded-2xl border-2 border-gray-200">
                <h4 className="font-black text-black uppercase mb-8 flex items-center gap-2 border-b-2 border-gray-300 pb-3"><Users size={20} /> Manpower Entries</h4>
                <datalist id="mp-name-suggestions">
                  {mpTemplates.map(t => (
                    <option key={t.nameKey} value={t.name} />
                  ))}
                </datalist>
                <datalist id="mp-trade-suggestions">
                  {Array.from(new Set(mpTemplates.map(t => String(t.trade || '').trim()).filter(Boolean))).map(v => (
                    <option key={v} value={v} />
                  ))}
                </datalist>

                <div className="space-y-10">
                  {act.manpower.map(item => (
                    <div key={item.id} className="bg-white border-2 border-black rounded-xl p-6 shadow-sm flex flex-col">
                      <InputGroup label="Manpower Code"><input className="w-full border-b-2 border-black font-mono font-bold p-2 bg-gray-50 uppercase" value={item.code} onChange={e => updateItemInActivity('manpower', item.id, 'code', e.target.value)} onBlur={e => handleResourceCodeBlur('manpower', item.id, e.target.value)} /></InputGroup>
                      <InputGroup label="Name"><input list="mp-name-suggestions" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.name} onChange={e => updateItemInActivity('manpower', item.id, 'name', e.target.value)} onBlur={() => handleManpowerNameBlur(item.id, item)} /></InputGroup>
                      <InputGroup label="Trade"><input list="mp-trade-suggestions" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.trade} onChange={e => updateItemInActivity('manpower', item.id, 'trade', e.target.value)} onBlur={() => queueSaveManpowerTemplate(item)} /></InputGroup>
                      <InputGroup label="Regular Hrs"><input type="number" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.quantity} onChange={e => updateItemInActivity('manpower', item.id, 'quantity', parseFloat(e.target.value))} onBlur={() => queueSaveManpowerTemplate(item)} /></InputGroup>
                      <InputGroup label="Overtime"><input type="number" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.overtime || ''} onChange={e => updateItemInActivity('manpower', item.id, 'overtime', parseFloat(e.target.value))} onBlur={() => queueSaveManpowerTemplate(item)} /></InputGroup>
                      <InputGroup label="Unit"><input className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.unit} onChange={e => updateItemInActivity('manpower', item.id, 'unit', e.target.value)} onBlur={() => queueSaveManpowerTemplate(item)} /></InputGroup>
                      <InputGroup label="Cost (Opt)"><input type="number" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.cost || ''} onChange={e => updateItemInActivity('manpower', item.id, 'cost', parseFloat(e.target.value))} onBlur={() => queueSaveManpowerTemplate(item)} /></InputGroup>
                      <InputGroup label="Site Notes"><textarea className="w-full text-sm italic p-2 border-2 border-gray-100 rounded-lg min-h-[60px]" value={item.comments} onChange={e => updateItemInActivity('manpower', item.id, 'comments', e.target.value)} /></InputGroup>
                      <button onClick={() => deleteItemFromActivity('manpower', item.id)} className="self-end text-red-600 mt-2 p-2 border-2 border-red-100 rounded-lg hover:bg-red-50"><Trash2 size={18} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => addItemToActivity('manpower')} className="w-full mt-10 py-4 border-2 border-black border-dashed rounded-xl font-black uppercase text-xs hover:bg-black hover:text-white transition-all">+ Add Manpower</button>
              </div>
              
              <div className="bg-gray-50 p-6 rounded-2xl border-2 border-gray-200">
                <h4 className="font-black text-black uppercase mb-8 flex items-center gap-2 border-b-2 border-gray-300 pb-3"><Package size={20} /> Material Deployment</h4>
                <div className="space-y-10">
                  {act.material.map(item => (
                    <div key={item.id} className="bg-white border-2 border-black rounded-xl p-6 shadow-sm flex flex-col">
                      <InputGroup label="Material Code"><input className="w-full border-b-2 border-black font-mono font-bold p-2 bg-gray-50 uppercase" value={item.code} onChange={e => updateItemInActivity('material', item.id, 'code', e.target.value)} onBlur={e => handleResourceCodeBlur('material', item.id, e.target.value)} /></InputGroup>
                      <InputGroup label="Description"><input className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.name} onChange={e => updateItemInActivity('material', item.id, 'name', e.target.value)} /></InputGroup>
                      <InputGroup label="Qty"><input type="number" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.quantity} onChange={e => updateItemInActivity('material', item.id, 'quantity', parseFloat(e.target.value))} /></InputGroup>
                      <InputGroup label="Unit"><input className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.unit} onChange={e => updateItemInActivity('material', item.id, 'unit', e.target.value)} /></InputGroup>
                      <InputGroup label="Cost"><input type="number" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.cost || ''} onChange={e => updateItemInActivity('material', item.id, 'cost', parseFloat(e.target.value))} /></InputGroup>
                      <InputGroup label="Site Notes"><textarea className="w-full text-sm italic p-2 border-2 border-gray-100 rounded-lg min-h-[60px]" value={item.comments} onChange={e => updateItemInActivity('material', item.id, 'comments', e.target.value)} /></InputGroup>
                      <button onClick={() => deleteItemFromActivity('material', item.id)} className="self-end text-red-600 mt-2 p-2 border-2 border-red-100 rounded-lg hover:bg-red-50"><Trash2 size={18} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => addItemToActivity('material')} className="w-full mt-10 py-4 border-2 border-black border-dashed rounded-xl font-black uppercase text-xs hover:bg-black hover:text-white transition-all">+ Add Material</button>
              </div>

              <div className="bg-gray-50 p-6 rounded-2xl border-2 border-gray-200">
                <h4 className="font-black text-black uppercase mb-8 flex items-center gap-2 border-b-2 border-gray-300 pb-3"><Truck size={20} /> Heavy Equipment</h4>
                <div className="space-y-10">
                  {act.equipment.map(item => (
                    <div key={item.id} className="bg-white border-2 border-black rounded-xl p-6 shadow-sm flex flex-col">
                      <InputGroup label="Equipment Code"><input className="w-full border-b-2 border-black font-mono font-bold p-2 bg-gray-50 uppercase" value={item.code} onChange={e => updateItemInActivity('equipment', item.id, 'code', e.target.value)} onBlur={e => handleResourceCodeBlur('equipment', item.id, e.target.value)} /></InputGroup>
                      <InputGroup label="Description"><input className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.name} onChange={e => updateItemInActivity('equipment', item.id, 'name', e.target.value)} /></InputGroup>
                      <InputGroup label="Operating Hrs"><input type="number" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.quantity} onChange={e => updateItemInActivity('equipment', item.id, 'quantity', parseFloat(e.target.value))} /></InputGroup>
                      <InputGroup label="Unit"><input className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.unit} onChange={e => updateItemInActivity('equipment', item.id, 'unit', e.target.value)} /></InputGroup>
                      <InputGroup label="Hourly Rate"><input type="number" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.cost || ''} onChange={e => updateItemInActivity('equipment', item.id, 'cost', parseFloat(e.target.value))} /></InputGroup>
                      <InputGroup label="Site Notes"><textarea className="w-full text-sm italic p-2 border-2 border-gray-100 rounded-lg min-h-[60px]" value={item.comments} onChange={e => updateItemInActivity('equipment', item.id, 'comments', e.target.value)} /></InputGroup>
                      <button onClick={() => deleteItemFromActivity('equipment', item.id)} className="self-end text-red-600 mt-2 p-2 border-2 border-red-100 rounded-lg hover:bg-red-50"><Trash2 size={18} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => addItemToActivity('equipment')} className="w-full mt-10 py-4 border-2 border-black border-dashed rounded-xl font-black uppercase text-xs hover:bg-black hover:text-white transition-all">+ Add Equipment</button>
              </div>

              <div className="bg-gray-50 p-6 rounded-2xl border-2 border-gray-200">
                <h4 className="font-black text-black uppercase mb-8 flex items-center gap-2 border-b-2 border-gray-300 pb-3"><Briefcase size={20} /> Subcontractors</h4>
                <div className="space-y-10">
                  {act.subcontractor.map(item => (
                    <div key={item.id} className="bg-white border-2 border-black rounded-xl p-6 shadow-sm flex flex-col">
                      <InputGroup label="Ref Code"><input className="w-full border-b-2 border-black font-mono font-bold p-2 bg-gray-50 uppercase" value={item.code} onChange={e => updateItemInActivity('subcontractor', item.id, 'code', e.target.value)} onBlur={e => handleResourceCodeBlur('subcontractor', item.id, e.target.value)} /></InputGroup>
                      <InputGroup label="Service Rendered"><input className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.name} onChange={e => updateItemInActivity('subcontractor', item.id, 'name', e.target.value)} /></InputGroup>
                      <InputGroup label="Company"><input className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.company} onChange={e => updateItemInActivity('subcontractor', item.id, 'company', e.target.value)} /></InputGroup>
                      <InputGroup label="Progress Qty"><input type="number" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.quantity} onChange={e => updateItemInActivity('subcontractor', item.id, 'quantity', parseFloat(e.target.value))} /></InputGroup>
                      <InputGroup label="Unit"><input className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.unit} onChange={e => updateItemInActivity('subcontractor', item.id, 'unit', e.target.value)} /></InputGroup>
                      <InputGroup label="Cost (Opt)"><input type="number" className="w-full border-b-2 border-gray-200 font-bold p-2" value={item.cost || ''} onChange={e => updateItemInActivity('subcontractor', item.id, 'cost', parseFloat(e.target.value))} /></InputGroup>
                      <InputGroup label="Site Notes"><textarea className="w-full text-sm italic p-2 border-2 border-gray-100 rounded-lg min-h-[60px]" value={item.comments} onChange={e => updateItemInActivity('subcontractor', item.id, 'comments', e.target.value)} /></InputGroup>
                      <button onClick={() => deleteItemFromActivity('subcontractor', item.id)} className="self-end text-red-600 mt-2 p-2 border-2 border-red-100 rounded-lg hover:bg-red-50"><Trash2 size={18} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={() => addItemToActivity('subcontractor')} className="w-full mt-10 py-4 border-2 border-black border-dashed rounded-xl font-black uppercase text-xs hover:bg-black hover:text-white transition-all">+ Add Subcon</button>
              </div>

              

              <div className="bg-white p-6 rounded-2xl border-2 border-black shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                    <h3 className="font-black uppercase text-lg tracking-tight">Schedule & Delay Calculator</h3>
                    <p className="text-xs font-bold text-gray-500">Auto-calculated (Dates are Inclusive)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-gray-500">As on</span>
                    <input type="date" value={asOnDate} onChange={(e) => setAsOnDate(e.target.value)} className="font-bold p-2 rounded-lg border-2 border-black outline-none bg-white text-xs" />
                  </div>
                </div>

                {formula ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <div className="font-black uppercase text-gray-500 mb-2">1) Planned vs Actual Durations</div>
                      <div className="flex justify-between gap-3"><span className="font-bold text-gray-500">Planned Duration</span><span className="font-black text-black">{formula.plannedDur ?? '-'} days</span></div>
                      <div className="flex justify-between gap-3 mt-1"><span className="font-bold text-gray-500">Actual Duration</span><span className="font-black text-black">{formula.actualDurFull ?? formula.actualDurToDate ?? '-'} days {!formula.actualDurFull && formula.actualDurToDate ? '(to-date)' : ''}</span></div>
                      <div className="flex justify-between gap-3 mt-2 pt-2 border-t border-gray-200"><span className="font-bold text-gray-500">Duration Variance</span><span className="font-black">{formula.durationVariance === null ? '-' : (formula.durationVariance > 0 ? `+${formula.durationVariance}` : `${formula.durationVariance}`)} days</span></div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <div className="font-black uppercase text-gray-500 mb-2">2) Delay (Date Slip)</div>
                      <div className="flex justify-between gap-3"><span className="font-bold text-gray-500">Start Delay</span><span className="font-black text-black">{formula.startDelay === null ? '-' : (formula.startDelay > 0 ? `+${formula.startDelay}` : `${formula.startDelay}`)} days</span></div>
                      <div className="flex justify-between gap-3 mt-1"><span className="font-bold text-gray-500">Finish Delay</span><span className="font-black text-black">{formula.finishDelay === null ? '-' : (formula.finishDelay > 0 ? `+${formula.finishDelay}` : `${formula.finishDelay}`)} days</span></div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <div className="font-black uppercase text-gray-500 mb-2">3) Progress Status (As on {asOnDate})</div>
                      <div className="flex justify-between gap-3"><span className="font-bold text-gray-500">Planned Qty</span><span className="font-black text-black">{formula.plannedQty} {formula.unit}</span></div>
                      <div className="flex justify-between gap-3 mt-1"><span className="font-bold text-gray-500">Actual Completed</span><span className="font-black text-black">{formula.actualQty} {formula.unit}</span></div>
                      <div className="flex justify-between gap-3 mt-2 pt-2 border-t border-gray-200"><span className="font-bold text-gray-500">Planned %</span><span className="font-black text-black">{formula.plannedPctAsOn === null ? '-' : `${round2(formula.plannedPctAsOn)}%`}</span></div>
                      <div className="flex justify-between gap-3 mt-1"><span className="font-bold text-gray-500">Actual %</span><span className="font-black text-black">{formula.actualPct === null ? '-' : `${round2(formula.actualPct)}%`}</span></div>
                      <div className="flex justify-between gap-3 mt-2 pt-2 border-t border-gray-200"><span className="font-bold text-gray-500">Shortfall</span><span className="font-black">{formula.shortfall === null ? '-' : `${round2(formula.shortfall)} ${formula.unit}`}</span></div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <div className="font-black uppercase text-gray-500 mb-2">4) Performance Numbers</div>
                      <div className="flex justify-between gap-3"><span className="font-bold text-gray-500">Planned Rate</span><span className="font-black text-black">{formula.plannedRate === null ? '-' : `${round2(formula.plannedRate)} /day`}</span></div>
                      <div className="flex justify-between gap-3 mt-1"><span className="font-bold text-gray-500">Actual Rate</span><span className="font-black text-black">{formula.actualRate === null ? '-' : `${round2(formula.actualRate)} /day`}</span></div>
                      <div className="flex justify-between gap-3 mt-2 pt-2 border-t border-gray-200"><span className="font-bold text-gray-500">Schedule Var (Qty)</span><span className="font-black text-black">{formula.scheduleVarianceQty === null ? '-' : `${round2(formula.scheduleVarianceQty)} ${formula.unit}`}</span></div>
                      <div className="flex justify-between gap-3 mt-1"><span className="font-bold text-gray-500">CPI</span><span className="font-black text-black">{formula.cpi === null ? '-' : round2(formula.cpi)}</span></div>
<div className="flex justify-between gap-3 mt-1"><span className="font-bold text-gray-500">SPI</span><span className="font-black text-black">{formula.spi === null ? '-' : round2(formula.spi)}</span></div>
                      <div className="flex justify-between gap-3 mt-1"><span className="font-bold text-gray-500">Performance %</span><span className="font-black text-black">{formula.performancePct === null ? '-' : `${round2(formula.performancePct)}%`}</span></div>
                    </div>
                  </div>
                ) : <div className="text-xs font-bold text-gray-500">Select an activity to see calculations.</div>}
              </div>

              {/* UPGRADED RISK REGISTER SECTION */}
              <div className="bg-red-50 p-6 rounded-2xl border-2 border-red-200">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h4 className="font-black text-red-900 uppercase flex items-center gap-2 pb-1">
                      <AlertTriangle size={20} /> Safety Risk Register
                    </h4>
                    <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest opacity-60">Quantitative Cost Modelling Intelligence</p>
                  </div>
                </div>

                {/* COST MODELLING PANEL */}
                <div className="bg-white border-2 border-red-900 rounded-2xl p-6 mb-10 shadow-sm">
                  <h5 className="text-xs font-black uppercase text-red-900 mb-4 flex items-center gap-2">
                    <DollarSign size={14} /> Total Activity Cost Model ({costModel.plannedDays} days)
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                      <div className="text-[10px] font-black uppercase text-green-700 mb-1 flex items-center gap-1">
                        <TrendingDown size={12} /> Optimistic (O)
                      </div>
                      <div className="text-xl font-black text-green-900">${money2(costModel.total.optimistic).toLocaleString()}</div>
                      <p className="text-[9px] font-bold text-green-600 mt-1">90% of Most Likely</p>
                    </div>
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-300 ring-2 ring-black">
                      <div className="text-[10px] font-black uppercase text-gray-500 mb-1">Most Likely (M)</div>
                      <div className="text-xl font-black text-black">${money2(costModel.total.mostLikely).toLocaleString()}</div>
                      <p className="text-[9px] font-bold text-gray-400 mt-1">Baseline Planned Cost</p>
                    </div>
                    <div className="bg-red-50 p-4 rounded-xl border border-red-200">
                      <div className="text-[10px] font-black uppercase text-red-700 mb-1 flex items-center gap-1">
                        <TrendingUp size={12} /> Pessimistic (P)
                      </div>
                      <div className="text-xl font-black text-red-900">${money2(costModel.total.pessimistic).toLocaleString()}</div>
                      <p className="text-[9px] font-bold text-red-600 mt-1">121% of Most Likely</p>
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap gap-6 text-[10px] font-bold uppercase">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Daily Burn Rate:</span>
                      <span className="text-black font-black">${money2(costModel.daily.total).toLocaleString()} /day</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">PERT Expected (E):</span>
                      <span className="text-black font-black">${money2(costModel.total.expected).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Standard Deviation (σ):</span>
                      <span className="text-black font-black">${money2(costModel.total.stdDev).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-10">
                  {(act?.risks ?? []).map(r => (
                    <div key={r.id} className="bg-white border-2 border-red-900 rounded-xl p-6 shadow-sm flex flex-col relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-red-900 text-white px-3 py-1 text-[9px] font-black uppercase">Active Risk Threat</div>
                      <InputGroup label="Risk ID"><input className="w-full border-b-2 border-red-900 font-mono font-bold p-2 bg-red-50/20 uppercase" value={r.code} onChange={e => updateRiskInActivity(r.id, 'code', e.target.value)} onBlur={e => handleResourceCodeBlur('risk', r.id, e.target.value)} /></InputGroup>
                      <InputGroup label="Description"><input className="w-full border-b-2 border-red-100 font-bold p-2" value={r.description} onChange={e => updateRiskInActivity(r.id, 'description', e.target.value)} /></InputGroup>
                      
                      {/* Risk-specific Cost Threat UI */}
                      <div className="mb-6 p-4 bg-red-50/50 rounded-xl border border-red-100">
                        <div className="text-[10px] font-black uppercase text-red-900/60 mb-2">Cost Range Threat Exposure</div>
                        <div className="flex items-center justify-between text-xs font-black">
                          <span className="text-green-700">${money2(costModel.total.optimistic).toLocaleString()}</span>
                          <div className="flex-1 mx-4 h-1.5 bg-gray-200 rounded-full relative overflow-hidden">
                             <div className="absolute inset-y-0 left-0 right-0 bg-gradient-to-r from-green-500 via-yellow-400 to-red-600 opacity-50"></div>
                             <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-black -translate-x-1/2"></div>
                          </div>
                          <span className="text-red-700">${money2(costModel.total.pessimistic).toLocaleString()}</span>
                        </div>
                        <p className="text-[9px] font-bold text-gray-500 mt-2 text-center">Baseline Cost Risk Range based on Activity Resources</p>
                      </div>

                      <div className="flex gap-4">
                        <InputGroup label="Likelihood">
                          <select className="w-full bg-transparent border-b-2 border-red-100 p-2 font-bold" value={r.likelihood} onChange={e => updateRiskInActivity(r.id, 'likelihood', e.target.value)}>
                            {RISK_LIKELIHOODS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </InputGroup>
                        <InputGroup label="Impact">
                          <select className="w-full bg-transparent border-b-2 border-red-100 p-2 font-bold" value={r.impact} onChange={e => updateRiskInActivity(r.id, 'impact', e.target.value)}>
                            {RISK_IMPACTS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </InputGroup>
                      </div>
                      <InputGroup label="Status">
                        <select className="w-full bg-transparent border-b-2 border-red-100 p-2 font-bold" value={r.status} onChange={e => updateRiskInActivity(r.id, 'status', e.target.value)}>
                          {RISK_STATUSES.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </InputGroup>
                      <InputGroup label="Mitigation Plan"><textarea className="w-full text-sm italic p-2 border-2 border-red-50 rounded-lg min-h-[60px]" value={r.mitigation} onChange={e => updateRiskInActivity(r.id, 'mitigation', e.target.value)} /></InputGroup>
                      <button onClick={() => updateActivityField(selectedActivityId!, 'risks', act.risks.filter(x => x.id !== r.id))} className="self-end text-red-600 mt-2 p-2 border-2 border-red-100 rounded-lg hover:bg-red-100 transition-all"><Trash2 size={18} /></button>
                    </div>
                  ))}
                </div>
                <button onClick={addRiskToActivity} className="w-full mt-10 py-4 border-2 border-red-900 border-dashed rounded-xl font-black uppercase text-xs text-red-900 hover:bg-red-900 hover:text-white transition-all">+ Add New Risk</button>
                
                <div className="mt-8 pt-4 border-t border-red-200">
                  <p className="text-[9px] font-bold text-red-900/40 uppercase leading-relaxed">
                    * Risk Likelihood × Risk Impact are used for qualitative severity tracking.<br />
                    * Cost modelling is separate and based on baseline planned cost range (Manpower, Material, Equipment, Subcontractor).<br />
                    * The Impact dropdown is the primary "Risk Impact" measure for executive dashboards.
                  </p>
                </div>
              </div>

            </div>
          ) : (
             <div className="h-full flex flex-col p-4 md:p-10 pb-40 space-y-6 max-w-2xl mx-auto overflow-y-scroll entry-scrollbar">
              <div className="bg-white p-6 rounded-2xl border-2 border-black shadow-sm text-center mb-4"><h3 className="font-black text-xl uppercase mb-2">Daily Summary: {date}</h3><p className="text-gray-500 font-bold text-sm">Select an activity from the left to edit details.</p></div>
              {activities.length > 0 ? activities.map(a => (
                <div key={a.id} className="bg-white rounded-xl shadow-sm border-2 border-black overflow-hidden p-5 transition-all hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedActivityId(a.id)}>
                   <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 mb-3 border-b border-gray-100 pb-3"><div className="flex items-center gap-2"><span className="font-mono bg-black text-white px-2 py-1 rounded text-[10px] font-bold">{a.activityId}</span>{a.isMilestone && <Flag size={14} className="fill-black" />}</div><div className="flex-1"><div className="text-sm font-black text-black">{a.description || 'Untitled'}</div></div></div>
                   <SummaryResourceSection title="Manpower" icon={Users} items={a.manpower} />
                   <SummaryResourceSection title="Materials" icon={Package} items={a.material} />
                   <SummaryResourceSection title="Equipment" icon={Truck} items={a.equipment} />
                   <SummaryResourceSection title="Subcons" icon={Briefcase} items={a.subcontractor} />
                </div>
              )) : <div className="flex flex-col items-center justify-center text-gray-400 p-12 text-center border-2 border-dashed border-gray-300 rounded-2xl"><LayoutList size={48} className="mb-4 opacity-20 text-black" /><p className="text-black font-black uppercase text-sm tracking-widest italic leading-relaxed">No activities recorded.<br />Click "New Activity" to begin.</p></div>}
            </div>
          )}
        </div>
      </div>
      <div className="fixed bottom-0 left-0 right-0 md:left-64 p-4 bg-white border-t-4 border-black z-50 flex gap-4 shadow-[0_-10px_25px_-5px_rgba(0,0,0,0.15)]">
        <button onClick={addActivity} className="flex-1 flex items-center justify-center gap-3 px-6 py-5 bg-white text-black rounded-2xl hover:bg-gray-100 font-black uppercase shadow-sm text-sm border-2 border-black active:scale-95 transition-all"><Plus size={22} /> New Activity</button>
        <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-3 px-6 py-5 bg-black text-white rounded-2xl hover:bg-gray-800 font-black uppercase shadow-sm text-sm border-2 border-black active:scale-95 transition-all"><Save size={22} /> Save</button>
      </div>
      {showCopyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl border-4 border-black w-full max-w-sm shadow-2xl animate-scale-in">
            <h3 className="text-xl font-black uppercase mb-6 flex items-center gap-2 text-black"><Copy size={20} /> Duplicate Log</h3>
            
            {/* ✅ FIXED: Trigger for custom smart picker */}
            <div onClick={() => {
              setCopyTargetDate(date); // Initialize with current report date
              setShowCopyDatePicker(true);
            }} className="w-full p-4 border-4 border-black rounded-2xl font-black text-lg mb-8 outline-none bg-gray-50 flex justify-between items-center cursor-pointer hover:bg-white transition-all">
               <span>{copyTargetDate || date}</span>
               <CalendarIcon size={20} />
            </div>

            <div className="flex gap-4"><button onClick={() => setShowCopyModal(false)} className="flex-1 py-4 border-2 border-black rounded-2xl font-black uppercase hover:bg-gray-100 transition-colors">Cancel</button><button onClick={handleCopyReport} disabled={!copyTargetDate && !date} className="flex-1 py-4 bg-black text-white rounded-2xl font-black uppercase hover:bg-gray-800 disabled:opacity-20">Copy Now</button></div>
          </div>
        </div>
      )}
      {showSavedDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-3xl border-4 border-black w-full max-w-xs shadow-2xl animate-scale-in text-center">
            <div className="flex justify-center mb-6"><div className="bg-black text-white p-4 rounded-full"><Check size={40} strokeWidth={3} /></div></div>
            <h3 className="text-2xl font-black uppercase mb-2 text-black">Saved</h3><p className="text-gray-500 font-bold mb-8">Record has been updated successfully.</p>
            <button onClick={() => setShowSavedDialog(false)} className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase hover:bg-gray-800 active:scale-95 transition-all">Okay</button>
          </div>
        </div>
      )}
      {showDeleteActivityConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[210] flex items-center justify-center p-4">
          <div className="bg-white p-10 rounded-3xl border-4 border-black w-full max-w-xs shadow-2xl animate-scale-in text-center">
            <div className="flex justify-center mb-6">
              <div className="bg-red-600 text-white p-4 rounded-full">
                <Trash2 size={40} strokeWidth={3} />
              </div>
            </div>
            <h3 className="text-2xl font-black uppercase mb-2 text-black">Delete Activity?</h3>
            <p className="text-gray-500 font-bold mb-8">This will remove this activity from the current list. This cannot be undone.</p>
            <div className="flex flex-col gap-3">
              <button onClick={deleteSelectedActivity} className="w-full py-4 bg-red-600 text-white rounded-2xl font-black uppercase hover:bg-red-700 active:scale-95 transition-all">
                Delete
              </button>
              <button onClick={() => setShowDeleteActivityConfirm(false)} className="w-full py-4 bg-gray-100 text-black rounded-2xl font-black uppercase hover:bg-gray-200 active:scale-95 transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};