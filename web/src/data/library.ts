export type Resource = {
  id: string;
  format: "PDF" | "Guide" | "List";
  kind: "Subject notes" | "Study guides" | "Formula sheets" | "Vocabulary lists" | "Past papers";
  title: string;
  blurb: string;
  subject: string;
  meta: string;
  saved?: boolean;
};

export const resources: Resource[] = [
  { id: "r1", format: "PDF", kind: "Subject notes", title: "LAT English Grammar Notes", blurb: "Tenses, prepositions, sentence correction and the error patterns examiners repeat most often.", subject: "English", meta: "42 pages · 3.1 MB", saved: true },
  { id: "r2", format: "PDF", kind: "Subject notes", title: "Pakistan Studies Timeline 1857–2023", blurb: "Every constitutional milestone, movement and treaty in one printable chronology.", subject: "Pakistan Studies", meta: "18 pages · 1.4 MB", saved: true },
  { id: "r3", format: "Guide", kind: "Study guides", title: "Essay Writing Framework", blurb: "Structure, thesis building and paragraph planning for the LAT essay section.", subject: "Essay Writing", meta: "12 min read" },
  { id: "r4", format: "PDF", kind: "Formula sheets", title: "Mathematics Formula Sheet", blurb: "Ratios, averages, percentages, algebra and geometry formulas on six pages.", subject: "Mathematics", meta: "6 pages · 0.9 MB", saved: true },
  { id: "r5", format: "List", kind: "Vocabulary lists", title: "LAT Vocabulary List — 800 Words", blurb: "High-frequency words with meanings, synonyms and example sentences.", subject: "English", meta: "24 pages · 2.2 MB" },
  { id: "r6", format: "PDF", kind: "Subject notes", title: "Islamiat Key Concepts", blurb: "Core beliefs, Seerah milestones and Quranic references summarised for revision.", subject: "Islamiat", meta: "16 pages · 1.1 MB" },
  { id: "r7", format: "Guide", kind: "Study guides", title: "Logical Reasoning Question Types", blurb: "Nine reasoning patterns with solved examples and common traps.", subject: "Logical Reasoning", meta: "20 min read", saved: true },
  { id: "r8", format: "PDF", kind: "Subject notes", title: "Urdu Idioms and Muhavray", blurb: "Frequently tested idioms with usage notes and translations.", subject: "Urdu", meta: "14 pages · 1.0 MB" },
  { id: "r9", format: "Guide", kind: "Study guides", title: "Personal Statement Examples", blurb: "Three annotated statements showing structure, tone and what to avoid.", subject: "Personal Statement", meta: "9 pages · 0.7 MB" },
];

export const recentResults = [
  { name: "LAT Full Mock Test 09", date: "18 Oct 2026", score: "78 / 100", acc: "78%", result: "Passed" },
  { name: "LAT English Sectional 04", date: "14 Oct 2026", score: "41 / 50", acc: "82%", result: "Passed" },
  { name: "LAT Full Mock Test 08", date: "09 Oct 2026", score: "64 / 100", acc: "64%", result: "Review" },
  { name: "Pakistan Studies Set 12", date: "05 Oct 2026", score: "22 / 40", acc: "55%", result: "Review" },
];

export const dashboardAccuracy = [
  ["English", 84],
  ["Islamiat", 79],
  ["Logical Reasoning", 71],
  ["Urdu", 66],
  ["Pakistan Studies", 58],
  ["Mathematics", 46],
] as const;

export const dashboardRecs = [
  ["Quantitative Word Problems", "Mathematics · 42 MCQs"],
  ["Constitutional Amendments", "Pakistan Studies · 28 MCQs"],
  ["Critical Reasoning: Flaws", "Logical Reasoning · 35 MCQs"],
];

export const weeklyActivity: [string, number][] = [
  ["Mon", 42],
  ["Tue", 68],
  ["Wed", 35],
  ["Thu", 84],
  ["Fri", 57],
  ["Sat", 96],
  ["Sun", 48],
];
