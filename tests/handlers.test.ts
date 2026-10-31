import { expect, test } from "bun:test";
import type { PluginContext } from "@orgsdk/plugins";
import createPlugin from "../plugin";
import { createFunctions } from "../plugin/functions";
import type { Fetch } from "../plugin/transport";

const config = { workspaceId: "1", projectIds: "2" };
const store = {
	get: async () => ({ value: config }),
} as unknown as PluginContext["stores"]["config"];
const credentials = { asana: { secret_apiKey: "sentinel" } };
function tool(name: string, fetcher: Fetch) {
	const fn = createFunctions(store, fetcher).find((fn) => fn.name === name);
	if (!fn) throw new Error("Missing test tool");
	return fn;
}
const project = {
	gid: "2",
	workspace: { gid: "1" },
	name: "Approved scope",
	notes: "Deliver report",
	custom_fields: [{ name: "Budget", number_value: 500 }],
};
test("factory has read-only tools, strict config and no auth flow", async () => {
	const module = await createPlugin({
		stores: { config: store },
	} as PluginContext);
	expect(module).not.toHaveProperty("authProvider");
	expect(module).not.toHaveProperty("httpEndpoints");
	for (const fn of module.safeFunctions ?? [])
		expect(fn.requiredCredentials).toEqual(["asana"]);
	expect(() =>
		module.config?.schema.parse({ ...config, baseUrl: "https://evil.example" }),
	).toThrow();
});
test("rejects unknown project and malformed input without a request", async () => {
	let requests = 0;
	const fn = tool("getProject", async () => {
		requests++;
		return Response.json({});
	});
	await expect(fn.handler(credentials, { projectId: "3" })).rejects.toThrow(
		"outside configured",
	);
	await expect(
		fn.handler(credentials, { projectId: "2", approved: true }),
	).rejects.toThrow();
	expect(requests).toBe(0);
});
test("returns scope evidence and checks project workspace", async () => {
	const fn = tool("getProject", async (_url, init) => {
		expect(init.headers).toEqual({ Authorization: "Bearer sentinel" });
		return Response.json({ data: project });
	});
	expect(await fn.handler(credentials, { projectId: "2" })).toMatchObject({
		notes: "Deliver report",
		custom_fields: project.custom_fields,
	});
	await expect(
		tool("getProject", async () =>
			Response.json({ data: { ...project, workspace: { gid: "9" } } }),
		).handler(credentials, { projectId: "2" }),
	).rejects.toThrow("workspace");
});
test("task data includes completion/dates and cannot escape project membership", async () => {
	const task = {
		gid: "4",
		workspace: { gid: "1" },
		projects: [{ gid: "2" }],
		name: "Extra request",
		notes: "New work",
		completed: false,
		due_on: "2026-10-31",
		custom_fields: [{ name: "Approved", text_value: "no" }],
	};
	const fn = tool("getTask", async () => Response.json({ data: task }));
	expect(await fn.handler(credentials, { taskId: "4" })).toMatchObject({
		notes: "New work",
		completed: false,
		due_on: "2026-10-31",
	});
	await expect(
		tool("getTask", async () =>
			Response.json({ data: { ...task, projects: [{ gid: "8" }] } }),
		).handler(credentials, { taskId: "4" }),
	).rejects.toThrow("outside configured");
});
test("pagination uses only returned offset data, ignoring hostile next-page URLs", async () => {
	const seen: URL[] = [];
	const fn = tool("listTasks", async (url) => {
		seen.push(url);
		return Response.json(
			url.pathname.endsWith("/tasks")
				? {
						data: [
							{
								gid: "4",
								workspace: { gid: "1" },
								projects: [{ gid: "2" }],
								notes: "Evidence",
							},
						],
						next_page: { offset: "next", uri: "https://evil.example" },
					}
				: { data: project },
		);
	});
	expect(
		await fn.handler(credentials, {
			projectId: "2",
			limit: 20,
			offset: "prior",
		}),
	).toMatchObject({ nextOffset: "next" });
	expect(seen[1].searchParams.get("offset")).toBe("prior");
	expect(seen.every((url) => url.hostname === "app.asana.com")).toBe(true);
});
