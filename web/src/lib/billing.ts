import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { components } from "./api-types";

type S = components["schemas"];
export type Plan = S["PlanOut"];
export type Subscription = S["SubscriptionOut"];
export type Payment = S["PaymentOut"];
export type Checkout = S["CheckoutOut"];

const base = "/api/v1";

export const listPlans = () => api<Plan[]>(`${base}/plans`);
export const getSubscription = () => api<Subscription>(`${base}/me/subscription`);
export const listPayments = () => api<Payment[]>(`${base}/me/payments`);
export const getPayment = (id: string) => api<Payment>(`${base}/me/payments/${id}`);

export const startCheckout = (planCode: string) =>
  api<Checkout>(`${base}/billing/checkout`, { method: "POST", body: { plan_code: planCode } });

/** Development only: pays or fails a pending payment through the test gateway. */
export const completeTestPayment = (ref: string, outcome: "success" | "failure") =>
  api<Payment>(`${base}/billing/test-gateway/complete`, { method: "POST", body: { ref, outcome } });

export const SUBSCRIPTION_KEY = ["subscription"] as const;

export function useSubscription() {
  return useQuery({ queryKey: SUBSCRIPTION_KEY, queryFn: getSubscription, retry: false });
}

export const useVisiblePlans = () => useQuery({ queryKey: ["plans"], queryFn: listPlans });

/** Prices come from the API in paisa. */
export const formatPKR = (paisa: number) => `Rs ${(paisa / 100).toLocaleString("en-PK")}`;

export function periodLabel(days: number) {
  if (days === 0) return "forever";
  if (days === 30) return "month";
  if (days === 365) return "year";
  return `${days} days`;
}

/** Submits the gateway form (JazzCash) or follows the link (test gateway). */
export function goToGateway(checkout: Checkout) {
  if (checkout.method === "GET") {
    const url = new URL(checkout.action_url);
    Object.entries(checkout.fields).forEach(([k, v]) => url.searchParams.set(k, v));
    window.location.assign(url.toString());
    return;
  }
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkout.action_url;
  Object.entries(checkout.fields).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}
