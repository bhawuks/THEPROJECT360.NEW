export type EntryCategory = 'manpower' | 'material' | 'equipment' | 'subcontractor';

export interface BaseEntry {
  id: string;
  code: string; // e.g., MAN-01, MAT-01
  name: string;
  quantity: number;
  unit: string;
  cost?: number;
  overtime?: number; // Added field
  comments?: string;
  company?: string; // Added for Subcontractor
  trade?: string; // Added for Manpower
}

export interface MasterData {
  manpower: { name: string; code: string; trade: string }[];
  materials: { name: string; code: string }[];
  equipment: { name: string; code: string }[];
  subcontractors: { name: string; code: string }[]; // company name, code
  services: { name: string }[];
  risks: { description: string; category?: string }[];
}

export interface ResourceMemoryItem {
  name?: string; // For resources
  description?: string; // For risks
  trade?: string;
  unit?: string;
  cost?: number;
  quantity?: number; // Added to remember last used quantity/hours
  company?: string;
  comments?: string;
  category?: string;
  likelihood?: string;
  impact?: string;
  mitigation?: string;
  status?: string;
}

export type ResourceMemory = {
  [key in EntryCategory | 'risk']: Record<string, ResourceMemoryItem>;
};

export enum RiskLikelihood {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High'
}

export enum RiskImpact {
  LOW = 'Low',
  MEDIUM = 'Medium',
  HIGH = 'High'
}

export enum RiskStatus {
  OPEN = 'Open',
  CLOSED = 'Closed',
  MITIGATED = 'Mitigated'
}

export interface RiskEntry {
  id: string;
  code: string; // RISK-01
  description: string;
  likelihood: RiskLikelihood;
  impact: RiskImpact;
  status: RiskStatus;
  mitigation: string;
}

export interface ActivityEntry {
  id: string;
  activityId: string; // ACT-00001
  order: number; // True sort order
  description: string;
  responsiblePerson: string;

  workCategory?: string; // New field
  detailedDescription?: string; // NEW REQUIRED FIELD

  // ❗You removed Progress UI, but keep this optional for backward compatibility with older saved data
  plannedCompletion?: number; // 0-100 (legacy)

  // ✅ NEW: Quantities
  plannedQuantity?: number; // e.g., 1000
  actualQuantity?: number; // e.g., 500
  quantityUnit?: string; // e.g., m, m2, m3, ton

  referenceCode: string;
  workArea: string;
  stationGrid: string;

  plannedStart: string;
  plannedFinish: string;
  actualStart: string;
  actualFinish: string;

  isMilestone?: boolean;

  // Resources are now owned by the Activity
  manpower: BaseEntry[];
  material: BaseEntry[];
  equipment: BaseEntry[];
  subcontractor: BaseEntry[];
  risks: RiskEntry[];
}

export interface MasterActivity {
  activityId: string;
  workCategory: string;
  workArea: string;      // Added
  stationGrid: string;   // Added
  activityName: string;
  plannedStart: string;
  actualStart: string;
  plannedFinish: string;
  actualFinish: string;
}

export interface DailyReport {
  id: string;
  date: string; // YYYY-MM-DD
  userId: string;
  createdAt: number;
  updatedAt: number;
  activities: ActivityEntry[];
}

export interface User {
  id: string;
  username: string;
}

export type ViewState = 'entry' | 'history' | 'milestones' | 'barchart';