import React, { useState, useMemo } from 'react';
import { DailyReport } from '../types';
import { 
  BarChart as RechartsBarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell
} from 'recharts';
import { BarChart2, Calendar, Clock, LayoutList } from 'lucide-react';

interface BarChartProps {
  reports: DailyReport[];
}

type DurationMode = 'days' | 'weeks' | 'months';

const parseDateSafely = (dateStr?: string) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

const getInclusiveDays = (start?: string, finish?: string): number => {
  const s = parseDateSafely(start);
  const f = parseDateSafely(finish);
  if (!s || !f) return 0;
  const diffTime = f.getTime() - s.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays + 1);
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const BarChart: React.FC<BarChartProps> = ({ reports }) => {
  const [mode, setMode] = useState<DurationMode>('days');

  // Deduplicate activities by activityId, taking the latest occurrence
  const uniqueActivities = useMemo(() => {
    const map = new Map<string, any>();
    // Sort reports by date ascending so later reports overwrite earlier ones for same activityId
    const sortedReports = [...reports].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sortedReports.forEach(report => {
      report.activities?.forEach(act => {
        if (!act.activityId) return;
        map.set(act.activityId, {
          ...act,
          reportDate: report.date
        });
      });
    });
    
    return Array.from(map.values()).sort((a, b) => a.activityId.localeCompare(b.activityId));
  }, [reports]);

  const chartData = useMemo(() => {
    return uniqueActivities.map(a => {
      const days = getInclusiveDays(a.plannedStart, a.plannedFinish);
      let value = days;
      if (mode === 'weeks') value = round2(days / 7);
      if (mode === 'months') value = round2(days / 30);

      return {
        activityId: a.activityId,
        description: a.description,
        fullName: `${a.activityId}: ${a.description}`,
        duration: value,
        originalDays: days,
        plannedStart: a.plannedStart,
        plannedFinish: a.plannedFinish
      };
    });
  }, [uniqueActivities, mode]);

  const unitLabel = mode === 'days' ? 'Days' : mode === 'weeks' ? 'Weeks' : 'Months';

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-12">
      {/* Header & Controls */}
      <div className="bg-white p-8 rounded-3xl border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-3xl font-black text-black flex items-center gap-4 uppercase tracking-tight">
            <BarChart2 size={32} strokeWidth={3} />
            Duration Analytics
          </h2>
          <p className="text-xs font-bold text-gray-500 mt-2 uppercase tracking-widest">
            Visualizing Planned Activity Timelines
          </p>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-2xl border-4 border-black">
          {(['days', 'weeks', 'months'] as DurationMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${
                mode === m 
                  ? 'bg-black text-white shadow-md' 
                  : 'text-gray-500 hover:text-black hover:bg-white'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Main Chart */}
      <div className="bg-white border-4 border-black rounded-3xl overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6">
        <div className="mb-6 flex items-center justify-between border-b-4 border-gray-100 pb-4">
          <h3 className="font-black text-xl uppercase tracking-tight text-black flex items-center gap-2">
            <Clock size={24} /> 
            Activity Roadmap ({unitLabel})
          </h3>
        </div>

        <div className="h-[500px] w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <RechartsBarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 60, left: 100, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                <XAxis 
                  type="number" 
                  stroke="#000" 
                  fontSize={12} 
                  fontWeight="bold" 
                  tickLine={false} 
                  axisLine={{ stroke: '#000', strokeWidth: 2 }}
                />
                <YAxis 
                  dataKey="activityId" 
                  type="category" 
                  stroke="#000" 
                  fontSize={10} 
                  fontWeight="black" 
                  tickLine={false}
                  axisLine={{ stroke: '#000', strokeWidth: 2 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f3f4f6', opacity: 0.5 }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white border-4 border-black p-3 shadow-md">
                          <p className="text-xs font-black uppercase text-gray-400 mb-1">{data.activityId}</p>
                          <p className="text-sm font-black mb-2">{data.description}</p>
                          <div className="flex gap-4 text-[10px] font-bold uppercase">
                            <span className="text-blue-600">Start: {data.plannedStart || '-'}</span>
                            <span className="text-red-600">Finish: {data.plannedFinish || '-'}</span>
                          </div>
                          <p className="mt-2 text-base font-black border-t-2 border-gray-100 pt-2">
                            {data.duration} {unitLabel}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar 
                  dataKey="duration" 
                  fill="#000" 
                  radius={[0, 8, 8, 0]} 
                  barSize={32}
                >
                   {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.duration > 0 ? "#000" : "#E5E7EB"} />
                  ))}
                </Bar>
              </RechartsBarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-300">
               <BarChart2 size={64} className="opacity-10 mb-4" />
               <p className="font-black uppercase text-sm tracking-widest italic leading-relaxed">No duration data to display.</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-white border-4 border-black rounded-3xl overflow-hidden shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="bg-gray-50 p-6 border-b-4 border-black flex items-center gap-3">
          <LayoutList size={24} className="text-black"/>
          <h3 className="font-black text-xl uppercase tracking-tight text-black">Timeline Detail View</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 text-xs uppercase font-black text-black border-b-4 border-black">
                <th className="p-5 border-r-2 border-gray-200">Activity ID</th>
                <th className="p-5">Description</th>
                <th className="p-5 w-40">Planned Start</th>
                <th className="p-5 w-40">Planned Finish</th>
                <th className="p-5 w-40 text-right bg-black text-white">Duration ({unitLabel})</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {chartData.length > 0 ? (
                chartData.map((a) => (
                  <tr key={a.activityId} className="border-b-2 border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-5 font-mono font-black text-black border-r-2 border-gray-100">{a.activityId}</td>
                    <td className="p-5 font-bold text-gray-700">{a.description}</td>
                    <td className="p-5 font-bold text-gray-400">{a.plannedStart || '-'}</td>
                    <td className="p-5 font-bold text-gray-400">{a.plannedFinish || '-'}</td>
                    <td className="p-5 font-black text-right bg-gray-50">{a.duration}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-16 text-center text-gray-300 font-black uppercase text-xl italic leading-relaxed">
                    Log some activities to see analysis.
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