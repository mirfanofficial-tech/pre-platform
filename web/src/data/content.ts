export const exams = [
  { slug: "lat", name: "LAT", full: "Law Admission Test", mcqs: 7400, mocks: 62, subjects: 9, badge: "Most prepared" },
  { slug: "mdcat", name: "MDCAT", full: "Medical & Dental College Admission Test", mcqs: 9200, mocks: 80, subjects: 4 },
  { slug: "ecat", name: "ECAT", full: "Engineering College Admission Test", mcqs: 5100, mocks: 48, subjects: 4 },
  { slug: "css", name: "CSS / PMS", full: "Civil Services Examination", mcqs: 3800, mocks: 30, subjects: 12 },
  { slug: "nts", name: "NTS", full: "University & Job Tests", mcqs: 2500, mocks: 20, subjects: 6 },
];

export const features = [
  { title: "Timed mock examinations", body: "Full-length papers with a live countdown, question palette and the same section pattern as the real test." },
  { title: "Topic-wise MCQ practice", body: "Drill one topic at a time — from Logical Reasoning to Pakistan Studies — in sets you can finish in a study break." },
  { title: "Explanations for every answer", body: "Each question comes with the correct option, a short worked explanation and a link to the related topic." },
  { title: "Progress tracking and streaks", body: "Daily goals, study streaks and a countdown to your target exam keep preparation consistent, not last-minute." },
];

export const steps = [
  { n: "01", title: "Choose your exam", body: "Select LAT, MDCAT, ECAT, CSS/PMS or NTS and set your target exam date." },
  { n: "02", title: "Practice important topics", body: "Work through topic-wise MCQ sets with instant explanations in practice mode." },
  { n: "03", title: "Attempt mock tests", body: "Sit full-length timed papers that mirror the real question pattern and pacing." },
  { n: "04", title: "Analyse your results", body: "Review subject-wise accuracy, fix weak topics and watch your score trend climb." },
];

export const testimonials = [
  { initials: "AH", name: "Ayesha Hameed", role: "LAT aspirant · Lahore", quote: "The timed mocks felt exactly like the real paper. By my fourth attempt I was finishing the English section with ten minutes to spare instead of running out of time." },
  { initials: "BK", name: "Bilal Khan", role: "MDCAT 2026 · Peshawar", quote: "Topic-wise practice is what changed things for me. I could see Chemistry accuracy sitting at 52% and drill only that until it moved." },
  { initials: "SF", name: "Sana Fatima", role: "CSS aspirant · Karachi", quote: "Explanations after every question meant I understood why I was wrong, instead of memorising answers. That is the part most apps skip." },
];

export const subjectAccuracy = [
  { subject: "English", value: 84 },
  { subject: "Logical Reasoning", value: 71 },
  { subject: "Pakistan Studies", value: 58 },
  { subject: "Mathematics", value: 46 },
];

export const comparison: [string, string, string, string][] = [
  ["Practice MCQs per month", "300", "Unlimited", "Unlimited"],
  ["Full-length mock tests per month", "2", "Unlimited", "Unlimited"],
  ["Saved questions", "25", "Unlimited", "Unlimited"],
  ["Premium mock tests", "—", "Included", "Included"],
  ["Auto-renewal", "—", "No", "No"],
  ["Access period", "Always", "30 days", "365 days"],
];

export const pricingFaqs = [
  { q: "Can I switch plans later?", a: "Yes. Premium starts as soon as your payment is confirmed. If you pay again while Premium is active, the new period is added after the current one, so you never lose days." },
  { q: "What happens when my plan ends?", a: "Your account reverts to the Free plan. Your history, saved questions and analytics stay intact." },
  { q: "Do you offer student discounts?", a: "Verified students at partner institutions get an additional reduction on the annual plan. Contact support with your student ID." },
];

export const faqs = [
  { q: "Are the questions real past papers?", a: "Our question bank is written by subject teachers and modelled on the official exam pattern. Where a genuine past paper is publicly and legally available, it is clearly labelled as such — everything else is original practice material, not official past-paper content." },
  { q: "Can I prepare for LAT for free?", a: "Yes. The free plan includes 300 practice MCQs and 2 mock tests every month, so you can try the full experience before upgrading." },
  { q: "How close are mock tests to the real exam?", a: "Mocks follow the published section pattern, question count and time limit of each exam, with a live countdown and question palette." },
  { q: "Does PrepMaster work on mobile data?", a: "Yes. Pages are lightweight and question sets load in small batches, so practice works comfortably on mobile data." },
  { q: "Can I switch my target exam later?", a: "Anytime. Your subscription covers every exam, and your progress for each exam is kept separately." },
  { q: "How do I cancel a Premium subscription?", a: "There is nothing to cancel: Premium never renews by itself. It simply ends when the period you paid for is over, and you can extend it whenever you like." },
];

export const formatPKR = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;

export const catalog = [
  { slug: "lat", name: "LAT", full: "Law Admission Test", blurb: "9 sections · 7,400 practice MCQs · 62 mock tests · essay and personal statement guides.", mcqs: 7400, mocks: 62, tags: ["English", "Pakistan Studies", "Logical Reasoning", "+4"], access: "Free + Premium", category: "Law" },
  { slug: "mdcat", name: "MDCAT", full: "Medical & Dental College Admission Test", blurb: "Medical and dental college admission test for public and private sector institutions across Pakistan.", mcqs: 6200, mocks: 48, tags: ["Biology", "Chemistry", "Physics", "+2"], access: "Free + Premium", category: "Medical" },
  { slug: "ecat", name: "ECAT", full: "Engineering College Admission Test", blurb: "Engineering college admission test practice aligned with UET and provincial entry test patterns.", mcqs: 4850, mocks: 36, tags: ["Maths", "Physics", "Chemistry", "+2"], access: "Free + Premium", category: "Engineering" },
  { slug: "css", name: "CSS / PMS", full: "Civil Services Examination", blurb: "Competitive examination preparation for compulsory papers, current affairs and essay writing.", mcqs: 3900, mocks: 27, tags: ["Essay", "Current Affairs", "Pak Affairs", "+3"], access: "Premium", category: "Civil service" },
  { slug: "nts", name: "NTS NAT", full: "National Aptitude Test", blurb: "National aptitude test practice for undergraduate admissions across participating universities.", mcqs: 2100, mocks: 31, tags: ["Verbal", "Quantitative", "Analytical", "+1"], access: "Free", category: "University entry" },
  { slug: "gat", name: "GAT General", full: "Graduate Assessment Test", blurb: "Graduate assessment test preparation for MS and MPhil admissions.", mcqs: 1750, mocks: 19, tags: ["Verbal", "Quantitative", "Analytical"], access: "Premium", category: "University entry" },
  { slug: "mpt", name: "CSS Screening (MPT)", full: "Screening Test", blurb: "Screening test preparation covering English, general ability and Islamiat.", mcqs: 1420, mocks: 14, tags: ["English", "General Ability", "Islamiat"], access: "Premium", category: "Civil service" },
  { slug: "uni-entry", name: "University Entry (LUMS, IBA)", full: "Private University Admission", blurb: "Aptitude style practice modelled on private university admission tests.", mcqs: 1980, mocks: 22, tags: ["English", "Maths", "Reasoning"], access: "Free + Premium", category: "University entry" },
  { slug: "ppsc", name: "PPSC / FPSC", full: "Public Service Commission", blurb: "Public service commission general recruitment test practice sets.", mcqs: 2640, mocks: 25, tags: ["GK", "Pak Studies", "Islamiat", "+2"], access: "Premium", category: "Civil service" },
  { slug: "army", name: "Army / CAA Entry Tests", full: "Armed Forces & Aviation Entry", blurb: "Initial test preparation for armed forces and aviation authority entry examinations.", mcqs: 1180, mocks: 11, tags: ["Verbal", "Non-verbal", "Maths"], access: "Free", category: "Aptitude" },
];

export const latSections = [
  { type: "Written", name: "Essay Writing", meta: "6 prompts · 2 submitted", progress: 33 },
  { type: "Written", name: "Personal Statement", meta: "4 guides · 1 draft saved", progress: 25 },
  { type: "MCQs", name: "English", meta: "1,240 MCQs · 8 of 14 sets", progress: 57, accuracy: 84 },
  { type: "MCQs", name: "General Knowledge", meta: "980 MCQs · 5 of 12 sets", progress: 42, accuracy: 69 },
  { type: "MCQs", name: "Pakistan Studies", meta: "1,100 MCQs · 4 of 12 sets", progress: 33, accuracy: 58 },
  { type: "MCQs", name: "Islamiat", meta: "860 MCQs · 7 of 10 sets", progress: 70, accuracy: 79 },
  { type: "MCQs", name: "Urdu", meta: "720 MCQs · 5 of 10 sets", progress: 50, accuracy: 66 },
  { type: "MCQs", name: "Mathematics", meta: "1,300 MCQs · 3 of 14 sets", progress: 21, accuracy: 46 },
  { type: "MCQs", name: "Logical Reasoning", meta: "1,200 MCQs · 9 of 14 sets", progress: 64, accuracy: 71 },
];

export const mockTests = [
  { id: "10", title: "LAT Full Mock Test 10", meta: "100 questions · 110 minutes", status: "Not attempted" },
  { id: "09", title: "LAT Full Mock Test 09", meta: "100 questions · 110 minutes", status: "Scored 78 / 100" },
  { id: "s05", title: "LAT English Sectional 05", meta: "50 questions · 45 minutes", status: "Not attempted" },
  { id: "r03", title: "LAT Reasoning Sectional 03", meta: "40 questions · 35 minutes", status: "Scored 29 / 40" },
];

export const materials = [
  { title: "LAT English Grammar Notes", meta: "PDF · 42 pages" },
  { title: "Pakistan Studies Timeline", meta: "PDF · 18 pages" },
  { title: "Essay Writing Framework", meta: "Guide · 12 min read" },
  { title: "Maths Formula Sheet", meta: "PDF · 6 pages" },
];

export const recommended = [
  { topic: "Averages and Ratios", tag: "Weakest", meta: "Mathematics · 46% accuracy" },
  { topic: "Constitution of 1973", tag: "Weak", meta: "Pakistan Studies · 54% accuracy" },
  { topic: "Assumption Questions", tag: "Improving", meta: "Logical Reasoning · 61% accuracy" },
];
