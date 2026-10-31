import type { PluginContext, SafeFunction } from "@orgsdk/plugins";
import { z } from "zod";
import { createClient } from "./client";
import { id, parseConfig } from "./config";
import type { Fetch } from "./transport";
export function createFunctions(
	store: PluginContext["stores"]["config"],
	fetcher?: Fetch,
): SafeFunction[] {
	function tool<T>(
		name: string,
		description: string,
		schema: z.ZodType<T>,
		parameters: NonNullable<SafeFunction["parameters"]>,
		result: string,
		run: (
			client: ReturnType<typeof createClient>,
			input: T,
		) => Promise<unknown>,
	): SafeFunction {
		return {
			name,
			description,
			parameters,
			returnType: `Promise<${result}>`,
			requiredCredentials: ["asana"],
			metadata: { readonly: true, category: "asana", tags: ["readonly"] },
			handler: async (credentials: unknown, input: unknown = {}) => {
				const parsed = schema.parse(input);
				const config = parseConfig(
					(await store.get("plugin:asana"))?.value ?? {},
				);
				return run(createClient(config, credentials, fetcher), parsed);
			},
		};
	}
	return [
		tool(
			"getIdentity",
			"Verify the connected Asana user without listing their workspaces.",
			z.strictObject({}),
			[],
			"{ gid: string; name?: string }",
			(client) => client.identity(),
		),
		tool(
			"listProjects",
			"Read only configured projects for approved-scope comparisons.",
			z.strictObject({}),
			[],
			"Record<string, unknown>[]",
			(client) => client.projects(),
		),
		tool(
			"getProject",
			"Read an allowed project's notes, dates and custom fields.",
			z.strictObject({ projectId: id }),
			[{ name: "projectId", type: "string" }],
			"Record<string, unknown>",
			(client, input) => client.project(input.projectId),
		),
		tool(
			"listTasks",
			"Read one page of tasks with notes, completion, dates and custom fields.",
			z.strictObject({
				projectId: id,
				limit: z.number().int().min(1).max(100).default(50),
				offset: z.string().min(1).max(2048).optional(),
			}),
			[
				{ name: "projectId", type: "string" },
				{ name: "limit", type: "number", optional: true },
				{ name: "offset", type: "string", optional: true },
			],
			"{ tasks: Record<string, unknown>[]; nextOffset: string | null }",
			(client, input) =>
				client.tasks(input.projectId, input.limit, input.offset),
		),
		tool(
			"getTask",
			"Read a task only when it belongs to the configured workspace and an allowed project.",
			z.strictObject({ taskId: id }),
			[{ name: "taskId", type: "string" }],
			"Record<string, unknown>",
			(client, input) => client.task(input.taskId),
		),
	];
}
