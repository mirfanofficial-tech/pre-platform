import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { CheckoutForm } from "@/components/checkout/checkout-form";

export const metadata = { title: "Checkout — PrepMaster" };

export default function CheckoutPage() {
  return (
    <AuthShell
      headline="Prepare Smarter. Score Higher."
      lead="Unlimited MCQs, every mock test and full analytics for LAT, MDCAT, ECAT, CSS and NTS."
    >
      <Suspense fallback={null}>
        <CheckoutForm />
      </Suspense>
    </AuthShell>
  );
}
