import React, { useMemo, useState, useEffect, useRef } from 'react';
import { DailyReport } from '../types';
import {
  FileText,
  Download,
  Calendar as CalendarIcon,
  Search,
  Flag,
  ChevronDown,
  ChevronUp,
  X,
  ArrowUp
} from 'lucide-react';

interface HistoryProps {
  reports: DailyReport[];
  onEdit: (report: DailyReport) => void;
  onDelete: (id: string) => void;
  // ✅ removed onDeleteActivity from props (delete button + logic fully removed)
}

// ------------------------------------------------------------------
// ✅ COMPONENT: Universal Date Picker (Smart View Logic)
// ------------------------------------------------------------------
interface UniversalDatePickerProps {
  initialDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
  label: string;
  referenceDate?: string;
}

const UniversalDatePicker: React.FC<UniversalDatePickerProps> = ({
  initialDate,
  onSelect,
  onClose,
  label,
  referenceDate
}) => {
  const initD = useMemo(() => {
    const d = new Date(initialDate || referenceDate || '');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [initialDate, referenceDate]);

  const [viewYear, setViewYear] = useState(initD.getFullYear());
  const [viewMonth, setViewMonth] = useState(initD.getMonth());
  const yearListRef = useRef<HTMLDivElement>(null);

  const years = Array.from({ length: 101 }, (_, i) => 1980 + i);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const blanks = Array.from({ length: firstDay }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  useEffect(() => {
    if (yearListRef.current) {
      const selectedBtn = yearListRef.current.querySelector(`[data-year="${viewYear}"]`);
      if (selectedBtn) selectedBtn.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }, [viewYear]);

  const handleDayClick = (d: number) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const dayStr = String(d).padStart(2, '0');
    onSelect(`${viewYear}-${m}-${dayStr}`);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl border-4 border-black shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-black text-white p-4 flex justify-between items-center shrink-0">
          <div>
            <div className="text-[10px] font-bold uppercase opacity-70 tracking-widest">{label}</div>
            <div className="text-xl font-black uppercase flex items-center gap-2">
              <CalendarIcon size={20} /> {months[viewMonth]} {viewYear}
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden h-[400px]">
          <div
            ref={yearListRef}
            className="w-24 bg-gray-50 border-r border-gray-200 overflow-y-scroll entry-scrollbar shrink-0"
          >
            {years.map((y) => (
              <button
                key={y}
                data-year={y}
                onClick={() => setViewYear(y)}
                className={`w-full p-3 text-sm font-bold text-center border-b border-gray-100 transition-colors ${
                  y === viewYear ? 'bg-black text-white' : 'text-gray-400 hover:text-black hover:bg-white'
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="w-24 bg-gray-50 border-r border-gray-200 overflow-y-scroll entry-scrollbar shrink-0">
            {months.map((m, idx) => (
              <button
                key={m}
                onClick={() => setViewMonth(idx)}
                className={`w-full p-3 text-sm font-bold text-center border-b border-gray-100 uppercase transition-colors ${
                  idx === viewMonth ? 'bg-black text-white' : 'text-gray-400 hover:text-black hover:bg-white'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-scroll p-4 bg-white entry-scrollbar">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
                <div key={d} className="text-center text-[10px] font-black text-gray-400 uppercase">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {blanks.map((_, i) => (
                <div key={`b-${i}`}></div>
              ))}
              {days.map((d) => {
                const isSelected =
                  viewYear === initD.getFullYear() &&
                  viewMonth === initD.getMonth() &&
                  d === initD.getDate();
                return (
                  <button
                    key={d}
                    onClick={() => handleDayClick(d)}
                    className={`aspect-square rounded-lg border-2 text-sm font-bold flex items-center justify-center transition-all ${
                      isSelected ? 'bg-black text-white border-black' : 'border-gray-100 text-black hover:border-black'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// CSV Export (Full History Loop - Matches Visual List Exactly)
// ------------------------------------------------------------------
function exportFullEntryFormCSV(reports: DailyReport[], filename = 'Project360_History_Export.csv') {
  const escapeCSV = (val: any) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const headers = [
    'ReportDate',
    'ReportId',
    'ActivityUID',
    'ActivityId',
    'RefCode',
    'ActivityName',
    'Category',
    'Supervisor',
    'WorkArea',
    'StationGrid',
    'DetailedProgressNotes',
    'IsMilestone',
    'PlannedStart',
    'PlannedFinish',
    'ActualStart',
    'ActualFinish',
    'PlannedQuantity',
    'ActualQuantity',
    'QuantityUnit',
    'PlannedCompletionPercent',
    'EntryType',
    'EntryId',
    'EntryCode',
    'EntryNameOrDesc',
    'Trade',
    'Company',
    'Quantity',
    'Unit',
    'Overtime',
    'Cost',
    'Comments',
    'RiskLikelihood',
    'RiskImpact',
    'RiskStatus',
    'RiskMitigation'
  ];

  const rows: any[][] = [];
  const pushRow = (obj: Record<string, any>) => {
    const row = headers.map((h) => escapeCSV(obj[h]));
    rows.push(row);
  };

  const sortedReports = [...reports].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  for (const report of sortedReports) {
    const acts = report.activities || [];
    for (const a of acts as any[]) {
      const base = {
        ReportDate: report.date,
        ReportId: report.id,
        ActivityUID: a.id,
        ActivityId: a.activityId,
        RefCode: a.referenceCode || '',
        ActivityName: a.description || '',
        Category: a.workCategory || '',
        Supervisor: a.responsiblePerson || '',
        WorkArea: a.workArea || '',
        StationGrid: a.stationGrid || '',
        DetailedProgressNotes: a.detailedDescription || '',
        IsMilestone: a.isMilestone ? 'YES' : 'NO',
        PlannedStart: a.plannedStart || '',
        PlannedFinish: a.plannedFinish || '',
        ActualStart: a.actualStart || '',
        ActualFinish: a.actualFinish || '',
        PlannedQuantity: (a as any).plannedQuantity ?? '',
        ActualQuantity: (a as any).actualQuantity ?? '',
        QuantityUnit: (a as any).quantityUnit ?? '',
        PlannedCompletionPercent: a.plannedCompletion ?? ''
      };

      pushRow({ ...base, EntryType: 'ACTIVITY' });

      for (const m of a.manpower || [])
        pushRow({
          ...base,
          EntryType: 'MANPOWER',
          EntryId: m.id,
          EntryCode: m.code,
          EntryNameOrDesc: m.name,
          Trade: (m as any).trade,
          Quantity: m.quantity,
          Unit: m.unit,
          Overtime: (m as any).overtime,
          Cost: m.cost,
          Comments: m.comments
        });

      for (const m of a.material || [])
        pushRow({
          ...base,
          EntryType: 'MATERIAL',
          EntryId: m.id,
          EntryCode: m.code,
          EntryNameOrDesc: m.name,
          Quantity: m.quantity,
          Unit: m.unit,
          Cost: m.cost,
          Comments: m.comments
        });

      for (const e of a.equipment || [])
        pushRow({
          ...base,
          EntryType: 'EQUIPMENT',
          EntryId: e.id,
          EntryCode: e.code,
          EntryNameOrDesc: e.name,
          Quantity: e.quantity,
          Unit: e.unit,
          Cost: e.cost,
          Comments: e.comments
        });

      for (const s of a.subcontractor || [])
        pushRow({
          ...base,
          EntryType: 'SUBCONTRACTOR',
          EntryId: s.id,
          EntryCode: s.code,
          EntryNameOrDesc: s.name,
          Company: (s as any).company,
          Quantity: s.quantity,
          Unit: s.unit,
          Cost: s.cost,
          Comments: s.comments
        });

      for (const r of a.risks || [])
        pushRow({
          ...base,
          EntryType: 'RISK',
          EntryId: r.id,
          EntryCode: r.code,
          EntryNameOrDesc: r.description,
          RiskLikelihood: r.likelihood,
          RiskImpact: r.impact,
          RiskStatus: r.status,
          RiskMitigation: r.mitigation
        });
    }
  }

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------
// HISTORY COMPONENT
// ------------------------------------------------------------------
export const History: React.FC<HistoryProps> = ({ reports, onEdit }) => {
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [search, setSearch] = useState('');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [datePickerTarget, setDatePickerTarget] = useState<'start' | 'end' | null>(null);

  // Flatten reports to activities for display
  const allActivities = useMemo(
    () =>
      reports.flatMap((report) =>
        (report.activities || []).map((activity: any) => ({
          ...activity,
          reportDate: report.date,
          reportId: report.id,
          originalReport: report
        }))
      ),
    [reports]
  );

  // ✅ NO DEDUPLICATION. Show every occurrence.
  const filteredActivities = useMemo(() => {
    const matches = allActivities.filter((item: any) => {
      const d = new Date(item.reportDate);
      const start = filterStart ? new Date(filterStart) : null;
      const end = filterEnd ? new Date(filterEnd) : null;

      if (start) {
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
      if (end) {
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }

      if (search) {
        const s = search.toLowerCase();
        return (
          (item.activityId || '').toLowerCase().includes(s) ||
          (item.description || '').toLowerCase().includes(s) ||
          (item.reportDate || '').includes(s)
        );
      }
      return true;
    });

    // Strictly sort by report date descending (Newest on top)
    return matches.sort((a: any, b: any) => new Date(b.reportDate).getTime() - new Date(a.reportDate).getTime());
  }, [allActivities, filterStart, filterEnd, search]);

  const toggleExpand = (uniqueKey: string) => {
    const newSet = new Set(expandedItems);
    if (newSet.has(uniqueKey)) newSet.delete(uniqueKey);
    else newSet.add(uniqueKey);
    setExpandedItems(newSet);
  };

  const scrollToTop = () => {
    const mainContent = document.querySelector('main');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const fmtReportDate = (raw: string) => {
    // Avoid UTC shift for YYYY-MM-DD (it shows previous day in some timezones)
    const isoDay = /^\\d{4}-\\d{2}-\\d{2}$/.test(raw);
    const d = new Date(isoDay ? `${raw}T00:00:00` : raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const safeVal = (v: any) => (v === null || v === undefined || v === '' ? '-' : v);

  return (
    <div className="space-y-6 animate-fade-in pb-24 md:pb-8 relative min-h-screen">
      <style>{`
        .entry-scrollbar::-webkit-scrollbar { width: 16px; height: 16px; display: block !important; }
        .entry-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; border-left: 2px solid #000; }
        .entry-scrollbar::-webkit-scrollbar-thumb { background: #000; border: 4px solid #fff; border-radius: 99px; }
        .entry-scrollbar::-webkit-scrollbar-thumb:hover { background: #333; }
        .entry-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #000 #f1f1f1;
          overflow-y: scroll !important;
        }
      `}</style>

      {datePickerTarget && (
        <UniversalDatePicker
          initialDate={datePickerTarget === 'start' ? filterStart : filterEnd}
          label={datePickerTarget === 'start' ? 'Filter From Date' : 'Filter To Date'}
          onClose={() => setDatePickerTarget(null)}
          onSelect={(d) => {
            if (datePickerTarget === 'start') setFilterStart(d);
            else setFilterEnd(d);
            setDatePickerTarget(null);
          }}
        />
      )}

      {/* Header / Filter Bar */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border-2 border-black">
        <div className="w-full xl:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black" size={18} />
            <input
              type="text"
              placeholder="Search project log..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border-2 border-black rounded-lg text-sm font-bold focus:outline-none focus:ring-0"
            />
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-2 w-full xl:w-auto">
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border-2 border-black w-full md:w-auto justify-between">
            <CalendarIcon size={16} className="text-black" />
            <div
              onClick={() => setDatePickerTarget('start')}
              className="cursor-pointer text-xs font-bold w-24 text-center hover:bg-gray-100 p-1 rounded transition-colors"
            >
              {filterStart || 'From Date'}
            </div>
            <span className="text-black font-bold">-</span>
            <div
              onClick={() => setDatePickerTarget('end')}
              className="cursor-pointer text-xs font-bold w-24 text-center hover:bg-gray-100 p-1 rounded transition-colors"
            >
              {filterEnd || 'To Date'}
            </div>
            {(filterStart || filterEnd) && (
              <button
                onClick={() => {
                  setFilterStart('');
                  setFilterEnd('');
                }}
                className="ml-2 text-red-500 font-bold hover:bg-red-50 p-1 rounded"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            onClick={() => exportFullEntryFormCSV(reports)}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-gray-100 rounded-lg transition-colors text-sm font-bold border-2 border-black w-full md:w-auto justify-center uppercase"
            title="Export Full History CSV"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        {filteredActivities.length > 0 ? (
          filteredActivities.map((item: any, idx: number) => {
            const uniqueKey = `${item.reportId}-${item.id}-${idx}`;
            const isExpanded = expandedItems.has(uniqueKey);

            const plannedQty = (item as any).plannedQuantity ?? (item as any).plannedQty ?? '';
            const actualQty = (item as any).actualQuantity ?? (item as any).actualQty ?? '';
            const qtyUnit = (item as any).quantityUnit ?? (item as any).unit ?? '';

            return (
              <div
                key={uniqueKey}
                className="bg-white rounded-lg shadow-sm border-2 border-black overflow-hidden transition-all"
              >
                <div
                  onClick={() => toggleExpand(uniqueKey)}
                  className="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-6 flex-1">
                    <div className="text-xs font-black uppercase text-gray-500 w-24">{item.reportDate}</div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono bg-black text-white px-2 py-1 rounded text-xs font-bold">
                        {item.activityId}
                      </span>
                      <h3 className="font-bold text-black text-sm md:text-base">{item.description}</h3>
                      {item.isMilestone && <Flag size={14} className="fill-black" />}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">{isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t-2 border-gray-100 bg-gray-50/50 animate-slide-down">
                    {/* ✅ Only Edit Report button remains */}
                    <div className="flex justify-end pt-2 mb-2 gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(item.originalReport);
                        }}
                        className="text-black hover:text-white hover:bg-black text-xs font-bold border-2 border-black px-3 py-1 rounded whitespace-nowrap transition-colors uppercase"
                      >
                        Edit Report
                      </button>
                    </div>

                    {/* ✅ ONLY the required details (no other sections) */}
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs bg-white p-4 rounded-xl border border-gray-200">
                      <div>
                        <span className="block font-black text-gray-400 uppercase tracking-wide">Recorded On</span>
                        <span className="font-bold text-base">{fmtReportDate(item.reportDate)}</span>
                      </div>

                      <div>
                        <span className="block font-black text-gray-400 uppercase tracking-wide">Activity ID</span>
                        <span className="font-bold text-base font-mono">{safeVal(item.activityId)}</span>
                      </div>

                      <div className="md:col-span-2">
                        <span className="block font-black text-gray-400 uppercase tracking-wide">Activity Name</span>
                        <span className="font-bold text-base">{safeVal(item.description)}</span>
                      </div>

                      <div>
                        <span className="block font-black text-gray-400 uppercase tracking-wide">Planned Qty</span>
                        <span className="font-bold text-base">
                          {safeVal(plannedQty)}{qtyUnit ? ` ${qtyUnit}` : ''}
                        </span>
                        <span className="block font-black text-gray-400 uppercase tracking-wide mt-3">Actual Qty</span>
                        <span className="font-bold text-base">
                          {safeVal(actualQty)}{qtyUnit ? ` ${qtyUnit}` : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <FileText size={48} className="mb-4 opacity-20 text-black" />
            <p className="text-black font-bold">No historical data found matching filters.</p>
          </div>
        )}
      </div>

      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={scrollToTop}
          className="bg-black text-white p-3 rounded-full shadow-xl border-2 border-white hover:scale-110 transition-transform flex items-center gap-2 px-6"
        >
          <ArrowUp size={20} /> <span className="text-xs font-black uppercase">Scroll Top</span>
        </button>
      </div>
    </div>
  );
};
