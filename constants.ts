import { DailyReport, RiskLikelihood, RiskImpact, RiskStatus } from './types';

export const STORAGE_KEY_PREFIX = 'sitelog_pro_data_';
export const CURRENT_USER_KEY = 'sitelog_pro_user';

export const INITIAL_REPORT: Omit<DailyReport, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
  date: new Date().toISOString().split('T')[0],
  activities: []
};

export const UNITS = ['hours', 'qty', 'kg', 'm', 'm2', 'm3', 'liters', 'units', 'days', 'ft', 'lbs'];

export const RISK_LIKELIHOODS = Object.values(RiskLikelihood);
export const RISK_IMPACTS = Object.values(RiskImpact);
export const RISK_STATUSES = Object.values(RiskStatus);