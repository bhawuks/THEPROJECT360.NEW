// Firestore.ts
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebaseService";
import { DailyReport, User, ResourceMemory, ActivityEntry } from "../types";

// Firestore returns untyped data sometimes; keep TS stable.
const coerceActivities = (v: unknown): ActivityEntry[] =>
  Array.isArray(v) ? (v as ActivityEntry[]) : [];

const emptyResourceMemory = (): ResourceMemory => ({
  manpower: {},
  material: {},
  equipment: {},
  subcontractor: {},
  risk: {},
});

// ------------------------------------------------------------------
// USERS
// ------------------------------------------------------------------
export const addUser = async (user: User) => {
  if (!db) {
    console.error("Firestore is not initialized.");
    return;
  }
  try {
    const userRef = doc(db, "users", user.id);
    const docSnap = await getDoc(userRef);

    if (!docSnap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        createdAt: Date.now(),
      });
      console.log("User added to Firestore");
    }
    
  } catch (e) {
    console.error("Error adding user: ", e);
  }
};

// ------------------------------------------------------------------
// REPORTS (Schema: users/{userId}/reports/{date})
// - IMPORTANT: doc id is the date string (YYYY-MM-DD)
// ------------------------------------------------------------------
export const saveReport = async (userId: string, report: DailyReport) => {
  if (!db) {
    console.error("Firestore is not initialized.");
    return;
  }
  try {
    const reportRef = doc(db, "users", userId, "reports", report.date);
    await setDoc(
      reportRef,
      {
        ...report,
        userId,
        date: report.date,
        activities: coerceActivities((report as any).activities),
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    console.log("Report saved successfully");
  } catch (e) {
    console.error("Error saving report: ", e);
  }
};

export const getReports = async (userId: string): Promise<DailyReport[]> => {
  if (!db) {
    console.error("Firestore is not initialized.");
    return [];
  }
  try {
    const reportsRef = collection(db, "users", userId, "reports");
    const querySnapshot = await getDocs(reportsRef);

    const reports: DailyReport[] = querySnapshot.docs.map((d) => {
      const data = d.data() as DailyReport;
      return {
        ...data,
        userId,
        activities: coerceActivities((data as any).activities),
      };
    });

    return reports;
  } catch (e) {
    console.error("Error getting reports: ", e);
    return [];
  }
};

export const deleteReport = async (userId: string, date: string) => {
  if (!db) {
    console.error("Firestore is not initialized.");
    return;
  }
  try {
    const reportRef = doc(db, "users", userId, "reports", date);
    await deleteDoc(reportRef);
    console.log("Report deleted successfully");
  } catch (e) {
    console.error("Error deleting report: ", e);
  }
};

export const getReportByDate = async (
  userId: string,
  date: string
): Promise<DailyReport | null> => {
  if (!db) {
    console.error("Firestore is not initialized.");
    return null;
  }
  try {
    // since doc id = date, direct read is best
    const reportRef = doc(db, "users", userId, "reports", date);
    const snap = await getDoc(reportRef);
    if (!snap.exists()) return null;

    const data = snap.data() as DailyReport;
    return {
      ...data,
      userId,
      date,
      activities: coerceActivities((data as any).activities),
    };
  } catch (e) {
    console.error("Error getting report by date: ", e);
    return null;
  }
};

export const getReportsInRange = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<DailyReport[]> => {
  if (!db) {
    console.error("Firestore is not initialized.");
    return [];
  }
  try {
    const reportsRef = collection(db, "users", userId, "reports");
    const qRef = query(
      reportsRef,
      where("date", ">=", startDate),
      where("date", "<=", endDate)
    );
    const snaps = await getDocs(qRef);

    return snaps.docs.map((d) => {
      const data = d.data() as DailyReport;
      return {
        ...data,
        userId,
        activities: coerceActivities((data as any).activities),
      };
    });
  } catch (e) {
    console.error("Error getting reports in range: ", e);
    return [];
  }
};

// ------------------------------------------------------------------
// RESOURCE MEMORY (Schema: users/{userId}/resourceMemory/main)
// ------------------------------------------------------------------
export const getResourceMemory = async (
  userId: string
): Promise<ResourceMemory> => {
  if (!db) {
    console.error("Firestore is not initialized.");
    return emptyResourceMemory();
  }
  try {
    const memoryRef = doc(db, "users", userId, "resourceMemory", "main");
    const snap = await getDoc(memoryRef);
    if (snap.exists()) {
      return snap.data() as ResourceMemory;
    }
    return emptyResourceMemory();
  } catch (e) {
    console.error("Error getting resource memory: ", e);
    return emptyResourceMemory();
  }
};

export const saveResourceMemory = async (
  userId: string,
  memory: ResourceMemory
) => {
  if (!db) {
    console.error("Firestore is not initialized.");
    return;
  }
  try {
    const memoryRef = doc(db, "users", userId, "resourceMemory", "main");
    await setDoc(memoryRef, { ...memory, updatedAt: Date.now() } as any, {
      merge: true,
    });
    console.log("Resource memory saved successfully");
  } catch (e) {
    console.error("Error saving resource memory: ", e);
  }
};

// ------------------------------------------------------------------
// HISTORY HELPERS
// ------------------------------------------------------------------
export const findActivityInHistory = async (
  userId: string,
  activityId: string
): Promise<boolean> => {
  if (!db) {
    console.error("Firestore is not initialized.");
    return false;
  }

  try {
    const reportsRef = collection(db, "users", userId, "reports");
    const snaps = await getDocs(reportsRef);

    const target = String(activityId || "").toUpperCase();
    for (const s of snaps.docs) {
      const rep = s.data() as DailyReport;
      const acts = coerceActivities((rep as any).activities);
      if (acts.some((a) => String(a.activityId || "").toUpperCase() === target)) {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("Error finding activity in history: ", e);
    return false;
  }
};

// ------------------------------------------------------------------
// RIPPLE SHIFT (used by EntryForm when activityId conflicts)
// Shifts ALL activities with numeric part >= conflict upward by 1
// across ALL reports for the user.
// ------------------------------------------------------------------
export const rippleShiftActivityIds = async (
  userId: string,
  activityId: string
): Promise<void> => {
  if (!db) {
    console.error("Firestore is not initialized.");
    return;
  }

  const match = String(activityId || "").match(/(.*?)(\d+)/);
  if (!match) return;

  const prefix = match[1] || "ACT-";
  const conflictNum = parseInt(match[2], 10) || 0;

  const getNum = (idStr: string) =>
    parseInt(String(idStr).match(/\d+/)?.[0] || "0", 10);

  try {
    const reportsRef = collection(db, "users", userId, "reports");
    const snaps = await getDocs(reportsRef);

    const batch = writeBatch(db);
    let touched = 0;

    snaps.docs.forEach((docSnap) => {
      const rep = docSnap.data() as DailyReport;
      const acts = coerceActivities((rep as any).activities);
      if (!acts.length) return;

      let changed = false;

      const newActs = acts.map((a) => {
        const aId = String(a.activityId || "");
        const n = getNum(aId);
        const p = aId.match(/^[^\d]+/)?.[0] || prefix;

        if (p.toUpperCase() === prefix.toUpperCase() && n >= conflictNum) {
          changed = true;
          const next = `${p}${String(n + 1).padStart(5, "0")}`;
          return { ...a, activityId: next };
        }
        return a;
      });

      if (changed) {
        const ref = doc(db, "users", userId, "reports", rep.date);
        batch.set(
          ref,
          { ...rep, activities: newActs, updatedAt: Date.now() },
          { merge: true }
        );
        touched += 1;
      }
    });

    if (touched > 0) await batch.commit();
  } catch (e) {
    console.error("Error ripple shifting activity IDs: ", e);
  }
};
