import Link from "next/link";
import { Logo } from "./site-header";

const columns = [
  { title: "Exams", links: ["LAT Test", "MDCAT", "ECAT", "CSS / PMS", "NTS & University Tests"] },
  { title: "Platform", links: ["Practice MCQs", "Mock Tests", "Study Materials", "Performance Analytics", "Leaderboard"] },
  { title: "Company", links: ["About PrepMaster", "Pricing", "Become a Contributor", "Blog", "Careers"] },
  { title: "Support", links: ["Help Centre", "Contact Us", "Terms of Service", "Privacy Policy", "Refund Policy"] },
];

export function SiteFooter() {
  return (
    <footer className="bg-brand-900 text-brand-100">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-16 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-4">
          <Logo inverse />
          <p className="font-semibold text-white">Prepare Smarter. Score Higher.</p>
          <p className="text-sm leading-relaxed text-brand-100/80">
            Exam preparation built for students in Pakistan — practice MCQs, timed mocks and analytics for LAT, MDCAT,
            ECAT, CSS/PMS and NTS.
          </p>
        </div>
        {columns.map((c) => (
          <div key={c.title}>
            <h4 className="mb-4 text-sm font-semibold text-white">{c.title}</h4>
            <ul className="flex flex-col gap-2.5 text-sm">
              {c.links.map((l) => (
                <li key={l}>
                  <Link href="#" className="text-brand-100/80 hover:text-white">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-3 px-5 py-5 text-[13px] text-brand-100/70">
          <span>© 2026 PrepMaster. All rights reserved.</span>
          <span>support@prepmaster.pk · +92 300 1234567 · Lahore, Pakistan</span>
        </div>
      </div>
    </footer>
  );
}
