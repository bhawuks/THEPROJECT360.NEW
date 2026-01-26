import {
    collection,
    doc,
    setDoc,
    getDocs,
    deleteDoc,
    query,
    where,
    getDoc,
  } from "firebase/firestore";
  import { db } from "./firebaseService";
  import { DailyReport, ResourceMemory, ActivityEntry } from "../types";
  
  /**
   * NOTE:
   * - This file is named Firestore.ts so imports like:
   *     import { addUser, saveReport } from "../services/Firestore";
   *   will work.
   * - We keep the `user` type as `any` because different parts of your app
   *   use different `User` shapes (username vs name vs displayName).
   */
  export const addUser = async (user: any) => {
    if (!db) {
      console.error("Firestore is not initialized.");
      return;
    }
    try {
      const userId: string | undefined =
        user?.id ?? user?.uid ?? user?.user?.uid ?? undefined;
  
      if (!userId) {
        console.error("addUser: missing user id/uid");
        return;
      }
  
      const userRef = doc(db, "users", userId);
      const docSnap = await getDoc(userRef);
  
      if (!docSnap.exists()) {
        const username =
          user?.username ??
          user?.name ??
          user?.displayName ??
          user?.user?.displayName ??
          "";
  
        const email = user?.email ?? user?.user?.email ?? "";
  
        await setDoc(userRef, {
          username,
          email,
          createdAt: Date.now(),
        });
        console.log("User added to Firestore");
      }
    } catch (e) {
      console.error("Error adding user: ", e);
    }
  };
  
  // Save a report to the 'reports' subcollection of a user
  export const saveReport = async (userId: string, report: DailyReport) => {
    if (!db) {
      console.error("Firestore is not initialized.");
      return;
    }
    try {
      const reportRef = doc(db, `users/${userId}/reports`, report.id);
      await setDoc(reportRef, report, { merge: true });
      console.log("Report saved successfully");
    } catch (e) {
      console.error("Error saving report: ", e);
    }
  };
  
  // Get all reports for a user
  export const getReports = async (userId: string): Promise<DailyReport[]> => {
    if (!db) {
      console.error("Firestore is not initialized.");
      return [];
    }
    try {
      const reportsRef = collection(db, `users/${userId}/reports`);
      const querySnapshot = await getDocs(reportsRef);
      const reports: DailyReport[] = [];
      querySnapshot.forEach((d) => {
        reports.push(d.data() as DailyReport);
      });
      return reports;
    } catch (e) {
      console.error("Error getting reports: ", e);
      return [];
    }
  };
  
  // Delete a report
  export const deleteReport = async (userId: string, reportId: string) => {
    if (!db) {
      console.error("Firestore is not initialized.");
      return;
    }
    try {
      const reportRef = doc(db, `users/${userId}/reports`, reportId);
      await deleteDoc(reportRef);
      console.log("Report deleted successfully");
    } catch (e) {
      console.error("Error deleting report: ", e);
    }
  };
  
  // Get a report by date
  export const getReportByDate = async (
    userId: string,
    date: string
  ): Promise<DailyReport | undefined> => {
    if (!db) {
      console.error("Firestore is not initialized.");
      return undefined;
    }
    try {
      const reportsRef = collection(db, `users/${userId}/reports`);
      const q = query(reportsRef, where("date", "==", date));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) return undefined;
      return querySnapshot.docs[0].data() as DailyReport;
    } catch (e) {
      console.error("Error getting report by date: ", e);
      return undefined;
    }
  };
  
  // Get resource memory for a user
  export const getResourceMemory = async (
    userId: string
  ): Promise<ResourceMemory> => {
    if (!db) {
      console.error("Firestore is not initialized.");
      return {} as ResourceMemory;
    }
    try {
      const memoryRef = doc(db, `users/${userId}/memory`, "resourceMemory");
      const docSnap = await getDoc(memoryRef);
      if (docSnap.exists()) return docSnap.data() as ResourceMemory;
      return {} as ResourceMemory;
    } catch (e) {
      console.error("Error getting resource memory: ", e);
      return {} as ResourceMemory;
    }
  };
  
  // Save resource memory for a user
  export const saveResourceMemory = async (
    userId: string,
    memory: ResourceMemory
  ) => {
    if (!db) {
      console.error("Firestore is not initialized.");
      return;
    }
    try {
      const memoryRef = doc(db, `users/${userId}/memory`, "resourceMemory");
      await setDoc(memoryRef, memory);
      console.log("Resource memory saved successfully");
    } catch (e) {
      console.error("Error saving resource memory: ", e);
    }
  };
  
  // Find an activity in a user's reports history
  export const findActivityInHistory = async (
    userId: string,
    activityId: string
  ): Promise<ActivityEntry | undefined> => {
    if (!db) {
      console.error("Firestore is not initialized.");
      return undefined;
    }
    const reports = await getReports(userId);
    for (const report of reports) {
      const activity = report.activities?.find((a) => a.activityId === activityId);
      if (activity) return activity;
    }
    return undefined;
  };
  