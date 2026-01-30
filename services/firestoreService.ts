// services/firestoreService.ts

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  getDoc,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "./firebaseService";

// --- 0. HELPERS ---

const normCode = (v: any) => String(v ?? "").trim().toUpperCase();
const tidyName = (v: any) => String(v ?? "").trim();
const normalizeKey = (s: string) =>
  String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

function ensureDb() {
  if (!db) throw new Error("Firestore db is not initialized.");
}

// --- 1. CORE APP FUNCTIONS ---

export const addUser = async (user: any) => {
  if (!db) return;
  try {
    const userId = user?.uid || user?.id;
    if (!userId) return;

    const userRef = doc(db, "users", userId);
    const docSnap = await getDoc(userRef);

    if (!docSnap.exists()) {
      await setDoc(userRef, {
        username: user?.displayName || user?.email?.split("@")[0] || "User",
        email: user?.email || "",
        createdAt: Date.now(),
      });
    }
  } catch (error) {
    console.error("Error adding user:", error);
  }
};

export const saveReport = async (userId: string, report: any) => {
  if (!db) return;
  try {
    if (!userId) throw new Error("Missing userId");
    if (!report?.id) throw new Error("Report missing ID");

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
    if (!userId) return [];

    const reportsRef = collection(db, "users", userId, "reports");
    const q = query(reportsRef, orderBy("date", "desc"), limit(50));
    const snapshot = await getDocs(q);

    // IMPORTANT: include doc.id so edit/delete works reliably even if report.id missing
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error getting reports:", error);
    return [];
  }
};

export const deleteReport = async (userId: string, reportId: string) => {
  if (!db) return;
  try {
    if (!userId || !reportId) return;
    await deleteDoc(doc(db, "users", userId, "reports", reportId));
  } catch (error) {
    console.error("Error deleting report:", error);
    throw error;
  }
};

// --- 2. MASTER DATA LOGIC ---

export type MasterCategory =
  | "manpower"
  | "material"
  | "equipment"
  | "subcontractor"
  | "risk";

// (If you want the lite type you wrote)
export type MasterCategoryLite = "manpower" | "material" | "equipment" | "subcontractor";

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

// ✅ MasterData ➜ EntryForm resourceMemory sync
// EntryForm must lookup memory by CODE (uppercase). We store at `${category}.${CODE}`.
async function syncItemToMemory(userId: string, category: MasterCategory, item: MasterItem) {
  if (!db) return;
  if (!userId) return;
  if (category === "risk") return;

  const code = normCode(item.code);
  if (!code) return;

  const memoryRef = doc(db, "users", userId, "resourceMemory", "main");
  const nameKey = normalizeKey(item.name);

  // Base template
  let template: any = {
    code,
    nameKey,
    name: tidyName(item.name),
    unit: item.unit || "",
    cost: item.cost ?? 0,
    comments: item.comments || "",
    updatedAt: Date.now(),
  };

  if (category === "manpower") {
    // In your design, MasterData.quantity = Regular Hours
    const hrs = item.quantity ?? 8;
    template = {
      ...template,
      trade: item.trade || "",
      quantity: hrs, // EntryForm uses quantity for regular hours
      overtime: item.overtime ?? 0,
    };
  } else if (category === "subcontractor") {
    template = {
      ...template,
      company: item.company || "",
    };
    if (item.quantity !== undefined) template.quantity = item.quantity;
  } else {
    // material / equipment
    if (item.quantity !== undefined) template.quantity = item.quantity;
  }

  try {
    await setDoc(
      memoryRef,
      {
        [`${category}.${code}`]: template,
      },
      { merge: true }
    );
  } catch (err) {
    console.error("Error syncing to EntryForm memory:", err);
  }
}

// ✅ SYNC ALL (button trigger)
export async function syncAllMasterItemsToMemory(userId: string) {
  ensureDb();
  if (!userId) throw new Error("Missing userId");

  const categories: MasterCategoryLite[] = ["manpower", "material", "equipment", "subcontractor"];
  const allData: Record<string, any> = {};

  for (const cat of categories) {
    const items = await listMasterItems(userId, cat as MasterCategory);
    allData[cat] = {};

    items.forEach((item) => {
      const code = normCode(item.code);
      if (!code) return;

      const nameKey = normalizeKey(item.name);

      let template: any = {
        code,
        nameKey,
        name: tidyName(item.name),
        unit: item.unit || "",
        cost: item.cost ?? 0,
        comments: item.comments || "",
        updatedAt: Date.now(),
      };

      if (cat === "manpower") {
        const hrs = item.quantity ?? 8;
        template.trade = item.trade || "";
        template.quantity = hrs;
        template.overtime = item.overtime ?? 0;
      } else if (cat === "subcontractor") {
        template.company = item.company || "";
        if (item.quantity !== undefined) template.quantity = item.quantity;
      } else {
        if (item.quantity !== undefined) template.quantity = item.quantity;
      }

      allData[cat][code] = template;
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
  if (!userId) return [];

  const colName = MASTER_COLLECTION[category];
  const colRef = collection(db, "users", userId, colName);
  const snapshot = await getDocs(colRef);

  return snapshot.docs
    .map((d) => ({ id: d.id, ...d.data() } as any))
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
  if (!userId) throw new Error("Missing userId");

  let item: MasterItem;
  if (typeof arg3 === "string") {
    if (!arg4) throw new Error("saveMasterItem: missing item argument");
    item = { ...arg4, code: arg3 };
  } else {
    item = arg3;
  }

  const colName = MASTER_COLLECTION[category];
  const code = normCode(item.code);
  if (!code) throw new Error("saveMasterItem: item.code is required");

  const ref = doc(db, "users", userId, colName, code);

  const dataToSave: MasterItem = {
    ...item,
    code,
    name: tidyName(item.name),
    updatedAt: Date.now(),
  };

  await setDoc(ref, dataToSave, { merge: true });

  // Background sync to EntryForm memory
  syncItemToMemory(userId, category, dataToSave).catch((e) =>
    console.error("Background sync error", e)
  );
}

export async function deleteMasterItem(
  userId: string,
  category: MasterCategory,
  code: string
): Promise<void> {
  ensureDb();
  if (!userId) return;

  const colName = MASTER_COLLECTION[category];
  const upper = normCode(code);
  if (!upper) return;

  await deleteDoc(doc(db, "users", userId, colName, upper));
}
