import { ArrowRight, BarChart3, BookOpenCheck, Flame, Star, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, ProgressBar } from "@/components/ui/card";
import { Section } from "@/components/marketing/section";
import { PlanCards } from "@/components/marketing/plan-cards";
import { Faq } from "@/components/marketing/faq";
import { exams, features, steps, subjectAccuracy, testimonials } from "@/data/content";

const featureIcons = [Timer, BookOpenCheck, Star, Flame];
const weekly = [40, 65, 52, 80, 70, 35, 58];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Hero() {
  return (
    <section className="bg-gradient-to-b from-brand-50 to-white">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 py-20 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Badge className="mb-5 border border-brand-100 bg-white px-3 py-1.5">
            <span className="size-1.5 rounded-full bg-brand-500" />
            LAT 2027 question bank now live
          </Badge>
          <h1 className="text-[40px] font-extrabold leading-[1.08] tracking-tight text-brand-900 md:text-[58px]">
            Your Next Success Story Starts Here.
          </h1>
          <p className="mt-5 max-w-[560px] text-[17px] leading-relaxed text-ink-2">
            Practice real exam-style MCQs, sit full-length timed mock tests, and track your progress subject by subject —
            built for students preparing for LAT, MDCAT, ECAT, CSS and NTS in Pakistan.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/register" size="lg" className="w-full sm:w-auto">
              Start practising free <ArrowRight size={18} />
            </ButtonLink>
            <ButtonLink href="/#exams" variant="secondary" size="lg" className="w-full sm:w-auto">
              Explore Exams
            </ButtonLink>
          </div>
          <dl className="mt-10 grid grid-cols-3 gap-4 sm:flex sm:gap-10">
            {[
              ["24,000+", "Practice MCQs"],
              ["380+", "Mock tests"],
              ["9", "Subjects covered"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="text-2xl font-extrabold text-brand-800">{v}</dt>
                <dd className="text-[13px] text-ink-3">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Card className="p-6 shadow-[0_20px_60px_rgba(6,78,59,0.12)]">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-bold">Welcome back, Ahmed</p>
              <p className="text-[13px] text-ink-3">LAT 2027 · 118 days left</p>
            </div>
            <Badge tone="warning">
              <Flame size={12} /> 12 day streak
            </Badge>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              ["Questions attempted", "1,480", "+86 this week"],
              ["Accuracy", "72%", "+4% vs last week"],
              ["Mock tests", "9", "2 this month"],
            ].map(([l, v, d]) => (
              <div key={l} className="rounded-md bg-surface-subtle p-3">
                <p className="text-[11px] text-ink-3">{l}</p>
                <p className="text-xl font-extrabold">{v}</p>
                <p className="text-[11px] font-medium text-brand-700">{d}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm font-semibold">Weekly study activity</p>
          <p className="text-xs text-ink-3">Questions per day</p>
          <div className="mt-3 flex h-28 items-end gap-3">
            {weekly.map((h, i) => (
              <div key={days[i]} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <div
                  className={`w-full rounded-sm ${h === Math.max(...weekly) ? "bg-brand-700" : "bg-brand-500"}`}
                  style={{ height: `${h}%` }}
                />
                <span className="text-[11px] text-ink-3">{days[i]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [lat, ...otherExams] = exams;
  return (
    <>
      <Hero />

      <Section id="exams" eyebrow="Popular exams" title="Pick your exam and start today">
        <Card className="mb-6 flex flex-col gap-6 border-brand-100 bg-brand-50 p-8 md:flex-row md:items-center md:justify-between">
          <div className="max-w-[620px]">
            <Badge className="mb-3 bg-white">{lat.badge}</Badge>
            <h3 className="text-2xl font-bold">LAT — {lat.full}</h3>
            <p className="mt-2 text-ink-2">
              Complete preparation for the HEC Law Admission Test — essay writing, personal statement and seven MCQ
              subjects, with timed mocks modelled on the real paper pattern.
            </p>
            <div className="mt-5 flex gap-8">
              {[
                [lat.mcqs.toLocaleString(), "MCQs"],
                [lat.mocks, "Mock tests"],
                [lat.subjects, "Subjects"],
              ].map(([v, l]) => (
                <div key={l}>
                  <p className="text-xl font-extrabold text-brand-800">{v}</p>
                  <p className="text-xs text-ink-3">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <ButtonLink href="/exams/lat" size="lg">
            Start LAT Preparation
          </ButtonLink>
        </Card>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {otherExams.map((e) => (
            <Card key={e.slug} className="flex flex-col gap-2 p-5">
              <h3 className="text-lg font-bold">{e.name}</h3>
              <p className="text-[13px] text-ink-3">{e.full}</p>
              <p className="mt-2 text-[13px] text-ink-2">
                {e.mcqs.toLocaleString()} MCQs · {e.mocks} mocks
              </p>
              <ButtonLink href={`/exams/${e.slug}`} variant="secondary" size="sm" className="mt-3">
                Explore
              </ButtonLink>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="features"
        subtle
        eyebrow="Why PrepMaster"
        title="Everything you need between today and exam day"
        lead="One place to practice, test yourself under real conditions, and see exactly which topics are holding your score back."
      >
        <div className="grid gap-5 md:grid-cols-2">
          {features.map((f, i) => {
            const Icon = featureIcons[i];
            return (
              <Card key={f.title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-600">
                  <Icon size={22} />
                </span>
                <div>
                  <h3 className="font-bold">{f.title}</h3>
                  <p className="mt-1 text-sm text-ink-2">{f.body}</p>
                </div>
              </Card>
            );
          })}
          <Card className="md:col-span-2">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-md bg-brand-50 text-brand-600">
                <BarChart3 size={22} />
              </span>
              <div>
                <h3 className="font-bold">Detailed performance analytics</h3>
                <p className="text-sm text-ink-2">
                  Accuracy by subject, score trends across attempts and time spent per topic — so revision time goes
                  where it actually moves your score.
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {subjectAccuracy.map((s) => (
                <div key={s.subject}>
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="font-medium">{s.subject}</span>
                    <span className="text-ink-3">{s.value}%</span>
                  </div>
                  <ProgressBar value={s.value} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      <Section eyebrow="How it works" title="Four steps from first login to exam-ready">
        <ol className="grid gap-6 md:grid-cols-4">
          {steps.map((s) => (
            <li key={s.n}>
              <span className="text-3xl font-extrabold text-brand-500">{s.n}</span>
              <h3 className="mt-2 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-ink-2">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        subtle
        eyebrow="Student stories"
        title="Students who stopped guessing and started scoring"
        lead="4.8 average from 2,140 student reviews"
      >
        <div className="grid gap-5 md:grid-cols-3">
          {testimonials.map((t) => (
            <Card key={t.name} className="flex flex-col gap-5">
              <p className="leading-relaxed text-ink-2">“{t.quote}”</p>
              <div className="mt-auto flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-full bg-brand-100 text-[13px] font-bold text-brand-800">
                  {t.initials}
                </span>
                <div>
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-ink-3">{t.role}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        id="pricing"
        eyebrow="Pricing"
        title="Start free. Upgrade when you are serious."
        lead="Prices shown are suggestions while plans are finalised. Every plan includes access on mobile and desktop."
      >
        <PlanCards />
      </Section>

      <Section
        id="faq"
        subtle
        eyebrow="FAQ"
        title="Questions students ask before signing up"
        lead="Still unsure about something? Our team replies to student questions within one working day."
      >
        <Faq />
      </Section>

      <section className="bg-brand-800 py-16 text-center text-white">
        <div className="mx-auto max-w-[680px] px-5">
          <h2 className="text-[32px] font-bold leading-tight">Your exam date is already set. Start preparing today.</h2>
          <p className="mt-3 text-brand-100">
            Create a free account, choose your exam and attempt your first practice set in under two minutes.
          </p>
          <ButtonLink href="/register" variant="inverse" size="lg" className="mt-7">
            Create free account
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
