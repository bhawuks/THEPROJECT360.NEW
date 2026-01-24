import React, { useState, useMemo } from 'react';
import { DailyReport, ActivityEntry } from '../types';
import { StorageService } from '../services/storageService';
import { Search, Download, Table2, Flag } from 'lucide-react';

interface MilestonesProps {
  reports: DailyReport[];
}

export const Milestones: React.FC<MilestonesProps> = ({ reports }) => {
  const [search, setSearch] = useState('');
  
  // Derive schedule directly from reports prop to avoid issues with user session sync in StorageService
  const schedule = useMemo(() => {
    const activityMap = new Map<string, any>();
    // Sort reports by date ascending so later reports update activity status correctly
    const sortedReports = [...reports].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    sortedReports.forEach(r => {
      r.activities?.forEach(a => {
        if (!a.activityId) return;
        activityMap.set(a.activityId, {
          activityId: a.activityId,
          workCategory: a.workCategory || 'Uncategorized',
          workArea: a.workArea || '',
          stationGrid: a.stationGrid || '',
          activityName: a.description,
          plannedStart: a.plannedStart,
          actualStart: a.actualStart,
          plannedFinish: a.plannedFinish,
          actualFinish: a.actualFinish
        });
      });
    });

    return Array.from(activityMap.values()).sort((a, b) => a.activityId.localeCompare(b.activityId));
  }, [reports]);

  const filteredSchedule = useMemo(() => {
    return schedule.filter(item => {
        const s = search.toLowerCase();
        return item.activityId.toLowerCase().includes(s) || 
               item.activityName.toLowerCase().includes(s) ||
               item.workCategory.toLowerCase().includes(s) ||
               item.workArea.toLowerCase().includes(s) ||
               item.stationGrid.toLowerCase().includes(s);
    });
  }, [schedule, search]);

  const milestoneIds = useMemo(() => {
    const ids = new Set<string>();
    reports.forEach(r => r.activities?.forEach(a => { if(a.isMilestone) ids.add(a.activityId); }));
    return ids;
  }, [reports]);

  // EVERY SINGLE ENTRY shows in the Master List
  const masterLog = filteredSchedule; 
  // ONLY Milestone-flagged entries show in the Tracker
  const milestones = filteredSchedule.filter(x => milestoneIds.has(x.activityId));

  const handleExport = () => {
      StorageService.exportToCSV(reports);
  };

  return (
    <div className="space-y-10 animate-fade-in pb-24 md:pb-8 max-w-7xl mx-auto">
        <div className="bg-white p-8 rounded-3xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="w-full md:w-auto">
                <h2 className="text-3xl font-black text-black flex items-center gap-4 uppercase tracking-tight">
                    <Table2 className="text-black" size={32} />
                    Project Tracker
                </h2>
                <p className="text-sm font-bold text-gray-500 mt-2 uppercase tracking-widest">
                    Master Log & Milestone Tracking
                </p>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-black" size={20} />
                    <input 
                        type="text" 
                        placeholder="Search project log..." 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-12 pr-6 py-4 border-4 border-black rounded-2xl text-base w-full font-black focus:outline-none bg-gray-50 focus:bg-white transition-all shadow-sm"
                    />
                </div>
                <button 
                    onClick={handleExport}
                    className="flex items-center justify-center gap-2 px-8 py-4 bg-black text-white rounded-2xl hover:bg-gray-800 transition-all font-black uppercase text-sm shadow-[4px_4px_0px_0px_rgba(156,163,175,1)] active:shadow-none active:translate-x-1 active:translate-y-1"
                >
                    <Download size={20} /> Export CSV
                </button>
            </div>
        </div>

        {/* MILESTONE TABLE - Tracker Section */}
        <div className="bg-amber-50 border-4 border-amber-500 rounded-3xl overflow-hidden shadow-[8px_8px_0px_0px_rgba(245,158,11,1)]">
            <div className="bg-amber-100 p-6 border-b-4 border-amber-500 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Flag size={24} className="text-amber-600 fill-amber-600"/>
                    <h3 className="font-black text-xl uppercase tracking-tight text-amber-900">Milestone Tracker</h3>
                </div>
                <span className="bg-amber-600 text-white px-4 py-1 rounded-full text-xs font-black uppercase shadow-sm">
                    {milestones.length} Milestones
                </span>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1400px]">
                    <thead>
                        <tr className="bg-amber-100 text-[10px] uppercase font-black text-amber-900 border-b-4 border-amber-500">
                            <th className="p-5 w-24 sticky left-0 bg-amber-100 z-10 border-r-2 border-amber-200">ID</th>
                            <th className="p-5 w-32">Category</th>
                            <th className="p-5 w-32">Work Area</th>
                            <th className="p-5 w-32">Grid Line</th>
                            <th className="p-5">Description</th>
                            <th className="p-5 w-32 opacity-60">Plan Start</th>
                            <th className="p-5 w-32 opacity-60">Plan Finish</th>
                            <th className="p-5 w-32">Actual Start</th>
                            <th className="p-5 w-32">Actual Finish</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {milestones.length > 0 ? (
                            milestones.map((item) => (
                                <tr key={item.activityId} className="border-b-2 border-amber-200 bg-white hover:bg-amber-50 transition-colors">
                                    <td className="p-5 font-mono font-black text-amber-600 flex items-center gap-2 sticky left-0 bg-white z-10 border-r-2 border-amber-100 group-hover:bg-amber-50">
                                        {item.activityId}
                                        <Flag size={14} className="text-amber-600 fill-amber-600" />
                                    </td>
                                    <td className="p-5 font-black text-amber-400 uppercase text-xs">
                                        {item.workCategory}
                                    </td>
                                    <td className="p-5 font-bold text-amber-800">
                                        {item.workArea || '-'}
                                    </td>
                                    <td className="p-5 font-bold text-amber-800">
                                        {item.stationGrid || '-'}
                                    </td>
                                    <td className="p-5 font-bold text-black">
                                        {item.activityName}
                                    </td>
                                    <td className="p-5 font-mono font-bold text-gray-400">
                                        {item.plannedStart || '-'}
                                    </td>
                                    <td className="p-5 font-mono font-bold text-gray-400">
                                        {item.plannedFinish || '-'}
                                    </td>
                                    <td className="p-5 font-mono font-black">
                                        {item.actualStart ? (
                                            <span className="text-amber-900 border-2 border-amber-900 px-3 py-1 rounded-lg bg-amber-100 shadow-[2px_2px_0px_0px_rgba(120,53,15,1)]">
                                                {item.actualStart}
                                            </span>
                                        ) : (
                                            <span className="text-gray-300 italic font-bold">In-Progress</span>
                                        )}
                                    </td>
                                    <td className="p-5 font-mono font-black">
                                        {item.actualFinish ? (
                                            <span className="text-white border-2 border-amber-900 px-3 py-1 rounded-lg bg-amber-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]">
                                                {item.actualFinish}
                                            </span>
                                        ) : (
                                            <span className="text-gray-300 italic font-bold">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={9} className="p-16 text-center text-amber-400 font-black uppercase text-xl italic leading-relaxed">
                                    No milestones identified in your reports.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* MASTER LOG - All Activities Section */}
        <div className="bg-white border-4 border-black rounded-3xl overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
            <div className="bg-gray-50 p-6 border-b-4 border-black flex items-center gap-3">
                <Table2 size={24} className="text-black"/>
                <h3 className="font-black text-xl uppercase tracking-tight text-black">Master Activity Log</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1400px]">
                    <thead>
                        <tr className="bg-gray-100 text-[10px] uppercase font-black text-black border-b-4 border-black">
                            <th className="p-5 w-24 sticky left-0 bg-gray-100 z-10 border-r-2 border-gray-200">ID</th>
                            <th className="p-5 w-32">Category</th>
                            <th className="p-5 w-32">Work Area</th>
                            <th className="p-5 w-32">Grid Line</th>
                            <th className="p-5">Description</th>
                            <th className="p-5 w-32 text-gray-500">Plan Start</th>
                            <th className="p-5 w-32 text-gray-500">Plan Finish</th>
                            <th className="p-5 w-32">Actual Start</th>
                            <th className="p-5 w-32">Actual Finish</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {masterLog.length > 0 ? (
                            masterLog.map((item) => {
                                const isMilestone = milestoneIds.has(item.activityId);
                                return (
                                    <tr key={item.activityId} className={`border-b-2 border-gray-100 hover:bg-gray-50 transition-colors ${isMilestone ? 'bg-amber-50/40' : ''}`}>
                                        <td className="p-5 font-mono font-black text-black flex items-center gap-2 sticky left-0 bg-white z-10 border-r-2 border-gray-100 group-hover:bg-gray-50">
                                            {item.activityId}
                                            {isMilestone && <Flag size={14} className="text-amber-600 fill-amber-600 animate-pulse" />}
                                        </td>
                                        <td className="p-5 font-black text-gray-400 uppercase text-xs">
                                            {item.workCategory}
                                        </td>
                                        <td className="p-5 font-bold text-gray-600">
                                            {item.workArea || '-'}
                                        </td>
                                        <td className="p-5 font-bold text-gray-600">
                                            {item.stationGrid || '-'}
                                        </td>
                                        <td className="p-5 font-bold text-black">
                                            {item.activityName}
                                        </td>
                                        <td className="p-5 font-mono font-bold text-gray-400">
                                            {item.plannedStart || '-'}
                                        </td>
                                        <td className="p-5 font-mono font-bold text-gray-400">
                                            {item.plannedFinish || '-'}
                                        </td>
                                        <td className="p-5 font-mono font-black">
                                            {item.actualStart ? (
                                                <span className="text-black border-2 border-black px-3 py-1 rounded-lg bg-white shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                                                    {item.actualStart}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 italic font-bold">In-Progress</span>
                                            )}
                                        </td>
                                        <td className="p-5 font-mono font-black">
                                            {item.actualFinish ? (
                                                <span className="text-white border-2 border-black px-3 py-1 rounded-lg bg-black shadow-[2px_2px_0px_0px_rgba(0,0,0,0.2)]">
                                                    {item.actualFinish}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300 italic font-bold">-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={9} className="p-16 text-center text-gray-300 font-black uppercase text-xl italic leading-relaxed">
                                    No activities recorded in your project logs.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};
