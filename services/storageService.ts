import { DailyReport, User, MasterData, ResourceMemory, ActivityEntry, MasterActivity } from '../types';
import { STORAGE_KEY_PREFIX, CURRENT_USER_KEY } from '../constants';

const getStorageKey = (userId: string) => `${STORAGE_KEY_PREFIX}${userId}`;
const getMasterDataKey = (userId: string) => `${STORAGE_KEY_PREFIX}${userId}_master`;
const getMemoryKey = (userId: string) => `${STORAGE_KEY_PREFIX}${userId}_memory`;

const DEFAULT_MASTER_DATA: MasterData = {
  manpower: [], materials: [], equipment: [], subcontractors: [], services: [], risks: []
};

const DEFAULT_MEMORY: ResourceMemory = {
  manpower: {}, material: {}, equipment: {}, subcontractor: {}, risk: {}
};

export const StorageService = {
  // Legacy methods kept for interface compatibility but primarily handled by Firebase now
  login: (username: string): User => {
    const user: User = { id: btoa(username), username };
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    return user;
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(CURRENT_USER_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  },

  logout: () => {
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  saveReport: (report: DailyReport): void => {
    const userId = report.userId;
    if (!userId) throw new Error("Report missing user ID");

    const reports = StorageService.getReports(userId);
    const existingIndex = reports.findIndex(r => r.id === report.id || r.date === report.date);

    if (existingIndex >= 0) {
      reports[existingIndex] = { ...report, updatedAt: Date.now() };
    } else {
      reports.push({ ...report, createdAt: Date.now(), updatedAt: Date.now() });
    }

    localStorage.setItem(getStorageKey(userId), JSON.stringify(reports));
  },

  getReportByDate: (userId: string, date: string): DailyReport | undefined => {
    const reports = StorageService.getReports(userId);
    return reports.find(r => r.date === date);
  },

  deleteReport: (userId: string, reportId: string): void => {
    if (!userId) return;
    let reports = StorageService.getReports(userId);
    reports = reports.filter(r => r.id !== reportId);
    localStorage.setItem(getStorageKey(userId), JSON.stringify(reports));
  },

  deleteActivityFromReport: (report: DailyReport, activityKey: string) => {
    const key = String(activityKey);

    const prevActs: any[] = Array.isArray(report.activities) ? (report.activities as any[]) : [];
    const nextActs = prevActs.filter((a: any) => String(a?.id) !== key);

    const removed = nextActs.length !== prevActs.length;

    const updatedReport: DailyReport = {
      ...report,
      activities: nextActs as any,
      updatedAt: Date.now()
    };

    return { updatedReport, removed };
  },

  getReports: (userId: string): DailyReport[] => {
    if (!userId) return [];
    const stored = localStorage.getItem(getStorageKey(userId));
    return stored ? JSON.parse(stored) : [];
  },

  findActivityHistory: (userId: string, activityId: string): ActivityEntry | undefined => {
    const reports = StorageService.getReports(userId).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    for (const report of reports) {
      const found = report.activities?.find(a => a.activityId === activityId);
      if (found) return found;
    }
    return undefined;
  },

  getProjectSchedule: (userId: string): MasterActivity[] => {
    const reports = StorageService.getReports(userId);
    const activityMap = new Map<string, MasterActivity>();
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
  },

  getResourceMemory: (userId: string): ResourceMemory => {
    const stored = localStorage.getItem(getMemoryKey(userId));
    return stored ? JSON.parse(stored) : DEFAULT_MEMORY;
  },

  saveResourceMemory: (userId: string, memory: ResourceMemory) => {
    localStorage.setItem(getMemoryKey(userId), JSON.stringify(memory));
  },

  rippleShiftActivityIds: (userId: string, conflictId: string) => {
    try {
      const reports = StorageService.getReports(userId);
      const getNum = (id: string) => {
        const matches = id.match(/\d+/);
        return matches ? parseInt(matches[0]) : 0;
      };
      const getPrefix = (id: string) => {
        const matches = id.match(/^[^\d]+/);
        return matches ? matches[0] : "ACT-";
      };

      const conflictNum = getNum(conflictId);
      if (conflictNum === 0) return;

      let updated = false;

      reports.forEach(report => {
        if (!report.activities) return;
        report.activities.forEach((act: any) => {
          const currentNum = getNum(act.activityId);
          if (currentNum >= conflictNum) {
            const prefix = getPrefix(act.activityId);
            const newNum = currentNum + 1;
            const padding = 5;
            act.activityId = `${prefix}${String(newNum).padStart(padding, '0')}`;
            updated = true;
          }
        });
      });

      if (updated) {
        localStorage.setItem(getStorageKey(userId), JSON.stringify(reports));
      }
    } catch (e) {
      console.error("Ripple Shift Error", e);
    }
  },

  exportToCSV: (reports: DailyReport[]) => {
    const rows: string[][] = [];

    const c = (val: any) => {
      if (val === undefined || val === null) return '';
      let str = String(val);
      if (!isNaN(val as any) && str.trim() !== '') return str;
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    reports.forEach(report => {
      if (!report.activities) return;
      report.activities.forEach((act: any) => {
        const manpowerItems = act.manpower?.length > 0 ? act.manpower : [{} as any];
        const materialItems = act.material?.length > 0 ? act.material : [{} as any];
        const equipmentItems = act.equipment?.length > 0 ? act.equipment : [{} as any];
        const subconItems = act.subcontractor?.length > 0 ? act.subcontractor : [{} as any];
        const riskItems = act.risks?.length > 0 ? act.risks : [{} as any];

        const maxResources = Math.max(
          manpowerItems.length,
          materialItems.length,
          equipmentItems.length,
          subconItems.length,
          riskItems.length
        );

        for (let i = 0; i < maxResources; i++) {
          const mp = manpowerItems[i] || {};
          const mat = materialItems[i] || {};
          const eq = equipmentItems[i] || {};
          const sub = subconItems[i] || {};
          const risk = riskItems[i] || {};

          const row = [
            c(act.activityId),
            c(report.date),
            c(act.referenceCode),
            c(act.description),
            c(act.workCategory),
            c(act.detailedDescription),
            c(act.responsiblePerson),
            c(act.plannedCompletion),
            c(act.workArea),
            c(act.stationGrid),
            c(act.plannedStart),
            c(act.plannedFinish),
            c(act.actualStart),
            c(act.actualFinish),

            c(mp.code),
            c(mp.name),
            c(mp.trade),
            c(mp.quantity),
            c(mp.overtime),
            c(mp.unit),
            c(mp.cost),
            c(mp.comments),

            c(mat.code),
            c(mat.name),
            c(mat.quantity),
            c(mat.unit),
            c(mat.cost),
            c(mat.comments),

            c(eq.code),
            c(eq.name),
            c(eq.quantity),
            c(eq.unit),
            c(eq.cost),
            c(eq.comments),

            c(sub.code),
            c(sub.name),
            c(sub.company),
            c(sub.quantity),
            c(sub.unit),
            c(sub.cost),
            c(sub.comments),

            c(risk.code),
            c(risk.description),
            c(risk.likelihood),
            c(risk.impact),
            c(risk.status),
            c(risk.mitigation),
            c(act.isMilestone ? 'YES' : 'NO')
          ];

          rows.push(row);
        }
      });
    });

    const headers = [
      "Activity ID", "Date", "Reference Code", "Activity Name", "Work Category",
      "Detailed Description", "Responsible Person", "Completion %", "Work Area",
      "Station/Grid", "Planned Start", "Planned Finish", "Actual Start", "Actual Finish",

      "Manpower Code", "Manpower Name", "Manpower Trade", "Manpower Hrs", "Manpower OT", "Manpower Unit", "Manpower Cost", "Manpower Notes",
      "Material Code", "Material Name", "Material Qty", "Material Unit", "Material Cost", "Material Notes",
      "Equipment Code", "Equipment Name", "Equipment Hrs", "Equipment Unit", "Equipment Cost", "Equipment Notes",
      "Subcontractor Code", "Subcontractor Service", "Subcontractor Company", "Subcontractor Qty", "Subcontractor Unit", "Subcontractor Cost", "Subcontractor Notes",

      "Risk ID", "Risk Description", "Risk Likelihood", "Risk Impact", "Risk Status", "Risk Mitigation",
      "Is Milestone"
    ];

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `ProjectExport_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};