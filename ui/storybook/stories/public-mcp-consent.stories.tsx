import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Route, Routes } from "@/lib/router";
import { McpConnectPage, AssistantConnectionsPage } from "@/pages/McpConnect";
import { consentSubmission, installPublicMcpFixture, request } from "../fixtures/publicMcp";

const meta = {
  title: "Assistant connections/Consent",
  component: McpConnectPage,
  parameters: { layout: "padded", initialEntries: [`/mcp-connect/${request.id}`], docs: { description: { component: "Production consent page at /mcp-connect/:id. API fixtures are isolated. Successful consent stays in this preview; no OAuth credentials are issued." } } },
  beforeEach: ({ parameters }) => installPublicMcpFixture(parameters.fixture),
  render: () => <Routes><Route path="/mcp-connect/:id" element={<McpConnectPage />} /><Route path="/assistant-connections" element={<AssistantConnectionsPage />} /></Routes>,
} satisfies Meta<typeof McpConnectPage>;
export default meta;
type Story = StoryObj<typeof meta>;
const chooseTeam: NonNullable<Story["play"]> = async ({ canvasElement }) => {
  const c = within(canvasElement);
  await userEvent.click(await c.findByRole("radio", { name: "Acme Research" }));
};
export const ChooseTeam: Story = {};
export const AllowDelegation: Story = { play: async context => {
  await chooseTeam(context);
  const c = within(context.canvasElement);
  await userEvent.click(c.getByRole("checkbox"));
  await expect(c.getByRole("checkbox")).toBeChecked();
  await expect(c.getByRole("button", { name: "Connect team" })).toBeEnabled();
} };
export const SwitchingTeamsResetsConsent: Story = { play: async context => {
  await AllowDelegation.play!(context);
  const c = within(context.canvasElement);
  await userEvent.click(c.getByRole("radio", { name: "Design Partners" }));
  await expect(c.getByRole("checkbox")).not.toBeChecked();
  await expect(c.getByRole("checkbox")).toBeDisabled();
  await expect(c.getByText("Your role in this team is read-only.")).toBeVisible();
} };
export const ReadOnlyRequest: Story = { parameters: { fixture: { request: { clientName: "Claude", redirectOrigin: "https://claude.ai", requestedWrite: false, offlineAccess: false } } } };
export const SignInRequired: Story = { parameters: { fixture: { request: { requiresSignIn: true, companies: [] } } } };
export const NoTeams: Story = { parameters: { fixture: { request: { companies: [] } } } };
export const CreateHostedTeam: Story = { parameters: { fixture: { request: { companies: [], setupUrl: "https://my.paperclip.app/orgs/new" } } } };
export const Loading: Story = { parameters: { fixture: { loading: true } } };
export const UnavailableOrExpired: Story = { parameters: { fixture: { unavailable: true } } };
export const Connecting: Story = { parameters: { fixture: { pending: true } }, play: async context => {
  await chooseTeam(context);
  const c = within(context.canvasElement);
  await userEvent.click(c.getByRole("button", { name: "Connect team" }));
  await expect(await c.findByRole("button", { name: "Connecting…" })).toBeDisabled();
} };
export const SaveFailed: Story = { parameters: { fixture: { mutationError: true } }, play: async context => {
  await chooseTeam(context);
  const c = within(context.canvasElement);
  await userEvent.click(c.getByRole("button", { name: "Connect team" }));
  await c.findByText("Could not save this change. Please try again.");
  await expect(c.getByRole("radio", { name: "Acme Research" })).toBeChecked();
} };
export const SubmitReadOnlyConsent: Story = { play: async context => {
  await chooseTeam(context);
  await userEvent.click(within(context.canvasElement).getByRole("button", { name: "Connect team" }));
  await expect(consentSubmission).toHaveBeenCalledWith({ decision: "approve", companyId: request.companies[0].id, allowWrites: false });
} };
export const Cancel: Story = { play: async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "Cancel" }));
  await expect(consentSubmission).toHaveBeenCalledWith({ decision: "deny", allowWrites: false });
} };
export const Mobile: Story = { globals: { viewport: { value: "mobile1", isRotated: false } }, parameters: { waitForViewport: true } };
