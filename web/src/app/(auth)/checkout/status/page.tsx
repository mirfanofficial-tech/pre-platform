import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PaymentStatus } from "@/components/checkout/payment-status";

export const metadata = { title: "Payment status — PrepMaster" };

export default function PaymentStatusPage() {
  return (
    <AuthShell
      headline="Prepare Smarter. Score Higher."
      lead="Unlimited MCQs, every mock test and full analytics for LAT, MDCAT, ECAT, CSS and NTS."
    >
      <Suspense fallback={null}>
        <PaymentStatus />
      </Suspense>
    </AuthShell>
  );
}
