import { z } from "zod";
export const id = z.string().regex(/^\d{1,40}$/);
export const configSchema = z.strictObject({
	workspaceId: id.describe("Only this Asana workspace may be read."),
	projectIds: z
		.string()
		.min(1)
		.describe("Comma-separated permitted Asana project IDs, maximum 20."),
});
export function parseConfig(input: unknown) {
	const config = configSchema.parse(input);
	const projectIds = z
		.array(id)
		.min(1)
		.max(20)
		.parse(config.projectIds.split(",").map((value) => value.trim()));
	return { ...config, projectIds };
}
