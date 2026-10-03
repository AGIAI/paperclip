// @vitest-environment jsdom

import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { McpConnectPage } from "./McpConnect";

const route = vi.hoisted(() => ({ id: "request-one", companyId: null as string | null, unavailable: false }));
vi.mock("@/lib/router", () => ({
  useParams: () => ({ id: route.id }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("../api/client", () => ({ api: { get: vi.fn(async () => ({
  id: route.id, clientName: "Assistant", redirectOrigin: "https://assistant.example.test",
  requestedWrite: true, offlineAccess: true, requiresSignIn: false, requestedCompanyId: route.companyId,
  companies: route.unavailable ? [] : [{ id: route.companyId ?? "company-one", name: "Acme Research", canWrite: true }], setupUrl: null,
})) } }));

it("requires a new organization selection and write consent when the request changes", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = () => flushSync(() => root.render(<QueryClientProvider client={client}><McpConnectPage /></QueryClientProvider>));
  const button = () => Array.from(container.querySelectorAll("button")).find((item) => item.textContent === "Connect organization")!;
  try {
    render();
    await vi.waitFor(() => expect(container.querySelector('input[type="radio"]')).not.toBeNull());
    expect(button().disabled).toBe(true);
    flushSync(() => (container.querySelector('input[type="radio"]') as HTMLInputElement).click());
    flushSync(() => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(button().disabled).toBe(false);
    route.id = "request-two";
    render();
    await vi.waitFor(() => expect(container.querySelector('input[type="radio"]')).not.toBeNull());
    expect((container.querySelector('input[type="radio"]') as HTMLInputElement).checked).toBe(false);
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    expect(button().disabled).toBe(true);
  } finally {
    flushSync(() => root.unmount());
    container.remove();
    client.clear();
  }
});

it("keeps a hosted organization fixed and resets write consent for another request", async () => {
  route.id = "hosted-one";
  route.companyId = "company-one";
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = () => flushSync(() => root.render(<QueryClientProvider client={client}><McpConnectPage /></QueryClientProvider>));
  const button = () => Array.from(container.querySelectorAll("button")).find(item => item.textContent === "Connect organization")!;
  try {
    render();
    await vi.waitFor(() => expect(container.textContent).toContain("Acme Research"));
    expect(container.querySelector('input[type="radio"]')).toBeNull();
    expect(button().disabled).toBe(false);
    flushSync(() => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    route.id = "hosted-two";
    route.companyId = "company-two";
    render();
    await vi.waitFor(() => expect(container.textContent).toContain("Acme Research"));
    expect(container.querySelector('input[type="radio"]')).toBeNull();
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
    // If current membership disappears, the fixed organization cannot become a picker.
    route.unavailable = true;
    await client.invalidateQueries({ queryKey: ["mcp-request", route.id] });
    await vi.waitFor(() => expect(container.textContent).toContain("selected organization is no longer available"));
    expect(container.querySelector('input[type="radio"]')).toBeNull();
    expect(button().disabled).toBe(true);
    expect(Array.from(container.querySelectorAll("button")).find(item => item.textContent === "Cancel")!.disabled).toBe(false);
  } finally {
    route.companyId = null;
    route.unavailable = false;
    flushSync(() => root.unmount());
    container.remove();
    client.clear();
  }
});
