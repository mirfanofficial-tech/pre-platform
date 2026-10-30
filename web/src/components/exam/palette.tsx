import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaletteStatus = "current" | "correct" | "incorrect" | "answered" | "marked" | "visited" | "unvisited";

const styles: Record<PaletteStatus, string> = {
  current: "border-brand-600 bg-white text-brand-800 ring-2 ring-brand-600",
  correct: "border-brand-600 bg-brand-600 text-white",
  incorrect: "border-danger bg-danger text-white",
  answered: "border-brand-600 bg-brand-600 text-white",
  marked: "border-warning bg-warning text-white",
  visited: "border-line-strong bg-white text-ink-2",
  unvisited: "border-line bg-surface-neutral text-ink-3",
};

export function Palette({
  count,
  status,
  onSelect,
}: {
  count: number;
  status: (i: number) => PaletteStatus;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          aria-label={`Question ${i + 1}`}
          className={cn("grid h-10 place-items-center rounded-md border text-[13px] font-semibold", styles[status(i)])}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: [PaletteStatus, string, number?][] }) {
  return (
    <ul className="grid gap-2 text-xs text-ink-2">
      {items.map(([s, label, n]) => (
        <li key={label} className="flex items-center gap-2">
          <span className={cn("size-3.5 rounded-sm border", styles[s])} />
          <span className="flex-1">{label}</span>
          {n !== undefined && <span className="font-semibold text-ink">{n}</span>}
        </li>
      ))}
    </ul>
  );
}

export function OptionButton({
  letter,
  text,
  state,
  onClick,
  disabled,
}: {
  letter: string;
  text: string;
  state: "idle" | "selected" | "correct" | "incorrect";
  onClick: () => void;
  disabled?: boolean;
}) {
  const box = {
    idle: "border-line bg-white hover:border-brand-600",
    selected: "border-brand-600 bg-brand-50",
    correct: "border-brand-600 bg-brand-50",
    incorrect: "border-danger bg-danger-bg",
  }[state];
  const chip = {
    idle: "bg-surface-neutral text-ink-2",
    selected: "bg-brand-600 text-white",
    correct: "bg-brand-600 text-white",
    incorrect: "bg-danger text-white",
  }[state];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-pressed={state === "selected"}
      data-option={letter}
      className={cn("flex w-full items-center gap-4 rounded-md border-2 px-4 py-3.5 text-left", box)}
    >
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-bold", chip)}>
        {letter}
      </span>
      <span className="flex-1 text-[15px]">{text}</span>
      {state === "correct" && <Check size={18} className="shrink-0 text-brand-600" aria-label="Correct answer" />}
      {state === "incorrect" && <X size={18} className="shrink-0 text-danger" aria-label="Your answer, incorrect" />}
    </button>
  );
}

export const letters = ["A", "B", "C", "D"];

export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export { styles as paletteStyles };
