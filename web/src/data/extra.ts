export const savedQuestions = [
  { text: "Which article of the Constitution of Pakistan deals with the right to fair trial?", subject: "Pakistan Studies" },
  { text: "If 3x + 7 = 2x + 15, what is the value of x squared?", subject: "Mathematics" },
  { text: "Choose the word most nearly opposite in meaning to ‘candid’.", subject: "English" },
  { text: "The Simla Agreement was signed between which two countries?", subject: "General Knowledge" },
  { text: "Find the odd one out: deciduous, perennial, annual, evergreen.", subject: "Logical Reasoning" },
];

export const leaderboard = [
  { name: "Ayesha Hameed", city: "Lahore", score: 91, tests: 14 },
  { name: "Bilal Khan", city: "Peshawar", score: 88, tests: 12 },
  { name: "Sana Fatima", city: "Karachi", score: 86, tests: 15 },
  { name: "Usman Tariq", city: "Islamabad", score: 83, tests: 11 },
  { name: "Hira Malik", city: "Multan", score: 81, tests: 10 },
  { name: "Ahmed Raza", city: "Lahore", score: 78, tests: 9, me: true },
  { name: "Zainab Ali", city: "Faisalabad", score: 76, tests: 8 },
];

export const paymentMethods = [
  { id: "jazzcash", label: "JazzCash", hint: "Pay with your JazzCash mobile account" },
  { id: "easypaisa", label: "Easypaisa", hint: "Pay with your Easypaisa mobile account" },
  { id: "card", label: "Debit / credit card", hint: "Visa or Mastercard" },
];

export const adminStats = [
  ["Registered students", "18,420", "+486 this month"],
  ["Active this week", "6,180", "34% of all students"],
  ["MCQs in question bank", "24,160", "+1,240 this month"],
  ["Active subscriptions", "3,742", "20% conversion"],
];

export const adminCounts = [
  ["9", "Exams"],
  ["54", "Subjects"],
  ["268", "Mock tests"],
  ["412", "Study materials"],
  ["23", "Pending reviews"],
  ["7", "Reported questions"],
];

export const signups = [210, 240, 260, 255, 290, 320, 310, 350, 380, 410, 440, 486];

export const questionsByExam = [
  { name: "LAT", value: 7400 },
  { name: "MDCAT", value: 6200 },
  { name: "ECAT", value: 4850 },
  { name: "CSS / PMS", value: 3900 },
  { name: "NTS NAT", value: 1810 },
];

export const recentQuestions = [
  { text: "Which article guarantees the right to fair trial?", subject: "Pakistan Studies", difficulty: "Medium", status: "Published" },
  { text: "Find the odd one out: deciduous, perennial, annual…", subject: "Logical Reasoning", difficulty: "Hard", status: "Published" },
  { text: "If 5x − 3 = 2x + 12, what is x?", subject: "Mathematics", difficulty: "Easy", status: "Draft" },
  { text: "Choose the correct synonym for ‘meticulous’.", subject: "English", difficulty: "Easy", status: "Published" },
  { text: "The Simla Agreement was signed between…", subject: "General Knowledge", difficulty: "Medium", status: "In review" },
];

export const adminActions = [
  ["Create a new exam", "Add an exam with subjects and topics"],
  ["Bulk import questions", "Upload a CSV or XLSX question file"],
  ["Create a mock test", "Assemble a timed paper from the bank"],
  ["Upload study material", "Publish a PDF, guide or formula sheet"],
  ["Manage student accounts", "Search, suspend or reset accounts"],
];

export const students = [
  { name: "Ahmed Raza", email: "ahmed.raza@example.com", exam: "LAT", plan: "Free", joined: "12 Aug 2026" },
  { name: "Ayesha Hameed", email: "ayesha.h@example.com", exam: "LAT", plan: "Premium", joined: "03 Jun 2026" },
  { name: "Bilal Khan", email: "bilal.k@example.com", exam: "MDCAT", plan: "Premium", joined: "21 May 2026" },
  { name: "Sana Fatima", email: "sana.f@example.com", exam: "CSS / PMS", plan: "Bootcamp", joined: "09 Apr 2026" },
  { name: "Usman Tariq", email: "usman.t@example.com", exam: "ECAT", plan: "Free", joined: "30 Sep 2026" },
];

export const adminNav = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/students", label: "Students" },
  { href: "/admin/exams", label: "Exams & Subjects" },
  { href: "/admin/questions", label: "Question Bank" },
  { href: "/admin/mock-tests", label: "Mock Tests" },
  { href: "/admin/materials", label: "Study Materials" },
  { href: "/admin/subscriptions", label: "Subscriptions" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/settings", label: "Settings" },
];
