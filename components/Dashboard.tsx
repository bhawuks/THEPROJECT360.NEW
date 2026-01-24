import React, { useState } from 'react';
import { DailyReport, RiskStatus } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { BrainCircuit, Loader2, TrendingUp, AlertTriangle, Users, Package } from 'lucide-react';
import { GeminiService } from '../services/geminiService';

interface DashboardProps {
  reports: DailyReport[];
  onNavigate: (view: 'entry' | 'history') => void;
}

const COLORS = ['#000000', '#4B5563', '#9CA3AF', '#D1D5DB', '#E5E7EB'];

export const Dashboard: React.FC<DashboardProps> = ({ reports, onNavigate }) => {
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Helper to extract all risks from all activities in a report
  const getReportRisks = (r: DailyReport) => r.activities ? r.activities.flatMap(a => a.risks) : [];
  
  // Helper to calculate manpower from all activities
  const getReportManpowerHours = (r: DailyReport) => 
    r.activities ? r.activities.reduce((sum, act) => 
      sum + act.manpower.reduce((mSum, m) => mSum + (m.quantity * (m.unit === 'hours' ? 1 : 8)), 0), 0) : 0;

  const getReportWorkerCount = (r: DailyReport) => 
    r.activities ? r.activities.reduce((sum, act) => 
      sum + act.manpower.reduce((mSum, m) => mSum + (m.unit !== 'hours' ? m.quantity : 0), 0), 0) : 0;

  // Computed Stats
  const totalReports = reports.length;
  const totalManpowerHours = reports.reduce((acc, r) => acc + getReportManpowerHours(r), 0);
  
  const allRisks = reports.flatMap(r => getReportRisks(r));
  const openRisks = allRisks.filter(r => r.status === RiskStatus.OPEN).length;
  const highRisks = allRisks.filter(r => r.impact === 'High').length;

  // Chart Data Preparation
  const last7Days = reports.slice(-7).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const manpowerData = last7Days.map(r => ({
    date: r.date.substring(5), // MM-DD
    workers: getReportWorkerCount(r),
    hours: getReportManpowerHours(r)
  }));

  const riskStatusData = [
    { name: 'Open', value: allRisks.filter(r => r.status === RiskStatus.OPEN).length },
    { name: 'Mitigated', value: allRisks.filter(r => r.status === RiskStatus.MITIGATED).length },
    { name: 'Closed', value: allRisks.filter(r => r.status === RiskStatus.CLOSED).length },
  ].filter(d => d.value > 0);

  const generateAiTrends = async () => {
    setLoadingAi(true);
    const insight = await GeminiService.identifyRiskTrends(reports);
    setAiInsight(insight);
    setLoadingAi(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-black flex items-center space-x-4">
            <div className="p-3 bg-black rounded-lg text-white">
                <Users size={24} />
            </div>
            <div>
                <p className="text-xs uppercase font-bold text-gray-500">Total Manpower Hrs</p>
                <h3 className="text-2xl font-black text-black">{totalManpowerHours.toLocaleString()}</h3>
            </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-black flex items-center space-x-4">
            <div className="p-3 bg-black rounded-lg text-white">
                <Package size={24} />
            </div>
            <div>
                <p className="text-xs uppercase font-bold text-gray-500">Reports Logged</p>
                <h3 className="text-2xl font-black text-black">{totalReports}</h3>
            </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-black flex items-center space-x-4">
            <div className="p-3 bg-black rounded-lg text-white">
                <AlertTriangle size={24} />
            </div>
            <div>
                <p className="text-xs uppercase font-bold text-gray-500">Open Risks</p>
                <h3 className="text-2xl font-black text-black">{openRisks}</h3>
            </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-black flex items-center space-x-4">
            <div className="p-3 bg-black rounded-lg text-white">
                <TrendingUp size={24} />
            </div>
            <div>
                <p className="text-xs uppercase font-bold text-gray-500">High Impact Risks</p>
                <h3 className="text-2xl font-black text-black">{highRisks}</h3>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Chart */}
        <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-black lg:col-span-2">
            <h3 className="text-lg font-black text-black mb-4 uppercase">Manpower Trends (Last 7 Reports)</h3>
            <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={manpowerData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="date" stroke="#000" fontSize={12} tickLine={false} axisLine={false} fontWeight="bold" />
                        <YAxis stroke="#000" fontSize={12} tickLine={false} axisLine={false} fontWeight="bold" />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '2px solid black', boxShadow: 'none' }}
                            itemStyle={{ color: '#000', fontSize: '12px', fontWeight: 'bold' }}
                        />
                        <Bar dataKey="workers" name="Headcount" fill="#000000" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="hours" name="Total Hours" fill="#9CA3AF" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>

        {/* Risk Breakdown */}
        <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-black">
            <h3 className="text-lg font-black text-black mb-4 uppercase">Risk Distribution</h3>
            <div className="h-64">
                {riskStatusData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={riskStatusData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {riskStatusData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="black" />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36}/>
                        </PieChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm font-medium">
                        No risk data available
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* AI Section */}
      <div className="bg-white p-6 rounded-xl border-2 border-black">
        <div className="flex justify-between items-start mb-4">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-black rounded-lg shadow-sm text-white">
                    <BrainCircuit size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-black text-black uppercase">AI Risk Intelligence</h3>
                    {/* Fix: Updated text to reflect Gemini 3 series intelligence */}
                    <p className="text-xs font-bold text-gray-500">Powered by Gemini 3</p>
                </div>
            </div>
            <button 
                onClick={generateAiTrends}
                disabled={loadingAi}
                className="px-4 py-2 bg-black text-white text-sm font-bold uppercase rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-sm"
            >
                {loadingAi ? <Loader2 className="animate-spin" size={16} /> : <BrainCircuit size={16} />}
                Analyze Trends
            </button>
        </div>
        
        {aiInsight ? (
            <div className="prose prose-sm max-w-none text-black bg-gray-50 p-4 rounded-lg border-2 border-black">
                <pre className="whitespace-pre-wrap font-sans font-medium">{aiInsight}</pre>
            </div>
        ) : (
            <p className="text-sm font-bold text-gray-500">
                Click "Analyze Trends" to let AI scan your recent reports.
            </p>
        )}
      </div>

      {reports.length === 0 && (
          <div className="text-center py-12">
              <p className="text-gray-500 font-bold mb-4">No reports found yet.</p>
              <button 
                onClick={() => onNavigate('entry')}
                className="px-6 py-3 bg-black text-white font-bold uppercase rounded-lg hover:bg-gray-800 transition-colors"
              >
                  Create First Report
              </button>
          </div>
      )}
    </div>
  );
};