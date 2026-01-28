import { GoogleGenAI } from "@google/genai";
import { DailyReport } from "../types";

type ChatTurn = { role: string; text: string };

const getAI = () => new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export const GeminiService = {
  analyzeReport: async (report: DailyReport): Promise<string> => {
    const ai = getAI();

    try {
      const prompt = `
You are a senior construction project manager. Analyze the following daily site report and provide a brief, professional executive summary (max 200 words).
Focus on:
1. Total manpower deployment and key activities implied by resources.
2. Critical risks that are Open or High impact.
3. A brief safety recommendation based on the entries.

Data:
Date: ${report.date}
Activities: ${JSON.stringify(report.activities)}
      `.trim();

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      return response.text || "No analysis generated.";
    } catch (error) {
      console.error("Gemini Analysis Error:", error);
      return "Unable to generate analysis at this time.";
    }
  },

  identifyRiskTrends: async (reports: DailyReport[]): Promise<string> => {
    if (reports.length === 0) return "Not enough data for trend analysis.";

    const ai = getAI();
    const recentReports = reports.slice(-5);

    try {
      const reportData = recentReports.map((r) => ({
        date: r.date,
        risks: r.activities ? r.activities.flatMap((a: any) => (a?.risks ?? [])) : [],
      }));

      const prompt = `
Analyze these daily construction reports for risk trends.
Identify recurring issues or escalating risks across the provided timeline.

Reports: ${JSON.stringify(reportData)}
      `.trim();

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });

      return response.text || "No trends identified.";
    } catch (error) {
      console.error("Gemini Trend Analysis Error:", error);
      return "Error analyzing trends.";
    }
  },

  chatWithProjectData: async (
    message: string,
    reports: DailyReport[],
    history: ChatTurn[]
  ): Promise<string> => {
    const ai = getAI();

    try {
      const recentReports = reports
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10);

      const contextData = JSON.stringify(recentReports, (key, value) => {
        if (key === "id" || key === "userId" || key === "createdAt" || key === "updatedAt") return undefined;
        return value;
      });

      const systemInstruction = `
You are "SiteLog Assistant", an AI expert for a construction site management app called THEPROJECT 360.

Your Capabilities:
1. You have access to the last 10 daily site reports provided in the context.
2. You can answer questions about manpower, materials, equipment, risks, and progress.
3. Keep answers concise, professional, and data-driven.
4. If the user asks about data not in the context (like reports older than 10 days), politely explain you only have access to recent data.

Context (Recent Project Data):
${contextData}
      `.trim();

      const contents = [
        ...history.map((h) => ({
          role: h.role === "user" ? "user" : "model",
          parts: [{ text: h.text }],
        })),
        { role: "user", parts: [{ text: message }] },
      ];

      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents,
        config: { systemInstruction },
      });

      return response.text || "I couldn't generate a response.";
    } catch (error) {
      console.error("Gemini Chat Error:", error);
      return "Sorry, I encountered an error connecting to the AI service.";
    }
  },
};
