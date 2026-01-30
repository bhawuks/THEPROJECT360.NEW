import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  getDoc,
  query,
  orderBy,
  limit
} from "firebase/firestore";
import { db } from "./firebaseService";

// --- 1. CORE APP FUNCTIONS ---

export const addUser = async (user: any) => {
  if (!db) return;
  try {
    const userId = user.uid || user.id;
    if (!userId) return;
    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) {
      await setDoc(userRef, {
        username: user.displayName || user.email?.split('@')[0] || "User",
        email: user.email,
        createdAt: Date.now(),
      });
    }
  } catch (error) {
    console.error("Error adding user:", error);
  }
};

// ✅ RESTORES THE SAVE BUTTON
export const saveReport = async (userId: string, report: any) => {
  if (!db) return;
  try {
    if (!report.id) throw new Error("Report missing ID");
    const reportRef = doc(db, "users", userId, "reports", report.id);
    await setDoc(reportRef, report, { merge: true });
  } catch (error) {
    console.error("Error saving report:", error);
    throw error;
  }
};

export const getReports = async (userId: string): Promise<any[]> => {
  if (!db) return [];
  try {
    const reportsRef = collection(db, "users", userId, "reports");
    const q = query(reportsRef, orderBy("date", "desc"), limit(50));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => doc.data());
  } catch (error) {
    console.error("Error getting reports:", error);
    return [];
  }
};

export const deleteReport = async (userId: string, reportId: string) => {
  if (!db) return;
  try {
    await deleteDoc(doc(db, "users", userId, "reports", reportId));
  } catch (error) {
    console.error("Error deleting report:", error);
    throw error;
  }
};

// --- 2. MASTER DATA LOGIC ---

export type MasterCategory = "manpower" | "material" | "equipment" | "subcontractor" | "risk";

export type MasterItem = {
  code: string;
  name: string;
  unit?: string;
  quantity?: number;     
  overtime?: number;
  trade?: string;        
  company?: string;      
  cost?: number;
  comments?: string;
  updatedAt?: number;
  [key: string]: any;    
};

const MASTER_COLLECTION: Record<MasterCategory, string> = {
  manpower: "master_manpower",
  material: "master_material",
  equipment: "master_equipment",
  subcontractor: "master_subcontractor",
  risk: "master_risk",
};

const normCode = (v: any) => String(v ?? "").trim().toUpperCase();
const tidyName = (v: any) => String(v ?? "").trim();
const normalizeKey = (s: string) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();

function ensureDb() {
  if (!db) throw new Error("Firestore db is not initialized.");
}

// ✅ SYNC TRANSLATOR: Now strictly maps 'quantity' to 'regularHours'
async function syncItemToMemory(userId: string, category: MasterCategory, item: MasterItem) {
  if (category === 'risk') return; 

  const nameKey = normalizeKey(item.name);
  if (!nameKey) return;

  const memoryRef = doc(db, "users", userId, "resourceMemory", "main");

  // Base Template
  let template: any = {
    nameKey,
    name: item.name,
    unit: item.unit || '',
    cost: item.cost || 0,
    updatedAt: Date.now(),
  };

  if (category === 'manpower') {
    // We treat 'quantity' from MasterData as 'Regular Hours'
    const hrs = item.quantity || 8;
    
    template = {
      ...template,
      trade: item.trade || '',
      regularHours: hrs, // Standard for EntryForm
      regularHrs: hrs,   // Backup name
      overtime: item.overtime || 0,
    };
  } else if (category === 'subcontractor') {
    template = {
      ...template,
      company: item.company || '',
    };
  } else if (category === 'material' || category === 'equipment') {
    if (item.quantity) template.quantity = item.quantity;
  }

  const updatePayload = {
    [`${category}.${nameKey}`]: template
  };

  try {
    await setDoc(memoryRef, updatePayload, { merge: true });
  } catch (err) {
    console.error("Error syncing to EntryForm memory:", err);
  }
}

// ✅ SYNC ALL: Triggered by the button
export async function syncAllMasterItemsToMemory(userId: string) {
  ensureDb();
  const categories: MasterCategory[] = ['manpower', 'material', 'equipment', 'subcontractor'];
  const allData: Record<string, any> = {};
  
  for (const cat of categories) {
    const items = await listMasterItems(userId, cat);
    if (!allData[cat]) allData[cat] = {};
    
    items.forEach(item => {
      const nameKey = normalizeKey(item.name);
      if (!nameKey) return;
      
      let template: any = {
        nameKey,
        name: item.name,
        unit: item.unit || '',
        cost: item.cost || 0,
        updatedAt: Date.now(),
      };

      if (cat === 'manpower') {
        const hrs = item.quantity || 8;
        template.trade = item.trade || '';
        template.regularHours = hrs;
        template.regularHrs = hrs;
        template.overtime = item.overtime || 0;
      } else if (cat === 'subcontractor') {
        template.company = item.company || '';
      } else {
         if (item.quantity) template.quantity = item.quantity;
      }

      allData[cat][nameKey] = template;
    });
  }

  const memoryRef = doc(db, "users", userId, "resourceMemory", "main");
  await setDoc(memoryRef, allData, { merge: true });
}

export async function listMasterItems(
  userId: string,
  category: MasterCategory
): Promise<MasterItem[]> {
  ensureDb();
  const colName = MASTER_COLLECTION[category];
  const colRef = collection(db, "users", userId, colName);
  const snapshot = await getDocs(colRef);
  
  return snapshot.docs
    .map((d) => d.data() as MasterItem)
    .map((x) => ({
      ...x,
      code: normCode(x.code),
      name: tidyName(x.name),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export async function saveMasterItem(
  userId: string,
  category: MasterCategory,
  arg3: string | MasterItem, 
  arg4?: MasterItem          
): Promise<void> {
  ensureDb();
  let item: MasterItem;
  if (typeof arg3 === 'string') {
    if (!arg4) throw new Error("saveMasterItem: missing item argument");
    item = arg4;
    item.code = arg3; 
  } else {
    item = arg3;
  }

  const colName = MASTER_COLLECTION[category];
  const code = normCode(item.code);
  if (!code) throw new Error("saveMasterItem: item.code is required");

  const ref = doc(db, "users", userId, colName, code);
  
  const dataToSave = {
    ...item,
    code,
    name: tidyName(item.name),
    updatedAt: Date.now(),
  };

  await setDoc(ref, dataToSave, { merge: true });
  // Background Sync
  syncItemToMemory(userId, category, dataToSave).catch(e => console.error("Background sync error", e));
}

export async function deleteMasterItem(
  userId: string,
  category: MasterCategory,
  code: string
): Promise<void> {
  ensureDb();
  const colName = MASTER_COLLECTION[category];
  const upper = normCode(code);
  if (!upper) return;
  await deleteDoc(doc(db, "users", userId, colName, upper));
}