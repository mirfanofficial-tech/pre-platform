import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

afterEach(() => vi.unstubAllGlobals());

const respond = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
  );

describe("api client", () => {
  it("returns parsed JSON and sends cookies", async () => {
    respond(200, { status: "ok" });
    await expect(api("/healthz")).resolves.toEqual({ status: "ok" });
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.credentials).toBe("include");
  });

  it("adds the CSRF header on writes only", async () => {
    respond(200, {});
    await api("/x", { method: "POST", body: { a: 1 } });
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers["X-CSRF"]).toBe("1");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("turns a problem response into an ApiError", async () => {
    respond(429, { type: "about:blank", title: "Monthly limit reached", status: 429, code: "limit_reached" });
    const err = (await api("/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(err.code).toBe("limit_reached");
  });

  it("copes with a non-JSON error body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502, statusText: "Bad Gateway" })));
    const err = (await api("/x").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(502);
  });
});
