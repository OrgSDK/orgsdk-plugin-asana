import { z } from "zod";
import type { parseConfig } from "./config";
import { type Fetch, object, pick, token, transport } from "./transport";

const reference = z.object({ gid: z.string() });
const projectSchema = z
	.object({ gid: z.string(), workspace: reference })
	.passthrough();
const taskSchema = z
	.object({
		gid: z.string(),
		workspace: reference,
		projects: z.array(reference),
	})
	.passthrough();
const projectFields = [
	"gid",
	"name",
	"notes",
	"archived",
	"created_at",
	"modified_at",
	"due_on",
	"start_on",
	"completed",
	"completed_at",
	"custom_fields",
	"permalink_url",
];
const taskFields = [
	"gid",
	"name",
	"notes",
	"completed",
	"completed_at",
	"created_at",
	"modified_at",
	"due_on",
	"due_at",
	"start_on",
	"start_at",
	"custom_fields",
	"permalink_url",
	"assignee",
	"projects",
];
export function createClient(
	config: ReturnType<typeof parseConfig>,
	credentials: unknown,
	fetcher?: Fetch,
) {
	const api = transport(
		"https://app.asana.com/api/1.0/",
		{ Authorization: `Bearer ${token(credentials, "asana")}` },
		fetcher,
	);
	async function get(path: string, query: Record<string, string> = {}) {
		return object.parse((await api.json(path, query)).data);
	}
	async function project(projectId: string) {
		if (!config.projectIds.includes(projectId))
			throw new Error("Project is outside configured boundary.");
		const row = projectSchema.parse(
			(
				await get(`projects/${projectId}`, {
					opt_fields: [...projectFields, "workspace.gid"].join(","),
				})
			).data,
		);
		if (row.gid !== projectId || row.workspace.gid !== config.workspaceId)
			throw new Error("Project is outside configured workspace.");
		return pick(row, projectFields);
	}
	function task(row: unknown) {
		const parsed = taskSchema.parse(row);
		if (
			parsed.workspace.gid !== config.workspaceId ||
			!parsed.projects.some((item) => config.projectIds.includes(item.gid))
		)
			throw new Error("Task is outside configured boundary.");
		return pick(parsed, taskFields);
	}
	return {
		async identity() {
			return pick(
				object.parse((await get("users/me", { opt_fields: "gid,name" })).data),
				["gid", "name"],
			);
		},
		project,
		async projects() {
			return Promise.all(config.projectIds.map(project));
		},
		async tasks(projectId: string, limit: number, offset?: string) {
			await project(projectId);
			const result = await get(`projects/${projectId}/tasks`, {
				limit: String(limit),
				opt_fields: [
					...taskFields,
					"workspace.gid",
					"projects.gid",
					"assignee.name",
				].join(","),
				...(offset ? { offset } : {}),
			});
			const tasks = z.array(z.unknown()).max(100).parse(result.data).map(task);
			const page = z
				.object({ offset: z.string().max(2048) })
				.nullable()
				.optional()
				.parse(result.next_page);
			return { tasks, nextOffset: page?.offset ?? null };
		},
		async task(taskId: string) {
			const row = task(
				(
					await get(`tasks/${taskId}`, {
						opt_fields: [
							...taskFields,
							"workspace.gid",
							"projects.gid",
							"assignee.name",
						].join(","),
					})
				).data,
			);
			if (row.gid !== taskId)
				throw new Error("Provider returned unexpected task.");
			return row;
		},
	};
}
