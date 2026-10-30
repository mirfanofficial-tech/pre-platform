import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
  {
    variants: {
      tone: {
        brand: "bg-brand-50 text-brand-700",
        neutral: "bg-surface-neutral text-ink-2",
        warning: "bg-warning-bg text-amber-700",
        danger: "bg-danger-bg text-danger",
        info: "bg-info-bg text-info",
      },
    },
    defaultVariants: { tone: "brand" },
  },
);

export function Badge({
  tone,
  className,
  ...props
}: VariantProps<typeof badgeVariants> & React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
