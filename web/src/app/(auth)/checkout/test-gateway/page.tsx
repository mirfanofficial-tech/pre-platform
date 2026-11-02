import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { TestGateway } from "@/components/checkout/test-gateway";

export const metadata = { title: "Test gateway — PrepMaster" };

export default function TestGatewayPage() {
  return (
    <AuthShell headline="Test payment" lead="This page stands in for JazzCash while the site runs in development.">
      <Suspense fallback={null}>
        <TestGateway />
      </Suspense>
    </AuthShell>
  );
}
