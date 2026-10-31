import assert from "node:assert/strict";

const project = {
	gid: "2",
	name: "Synthetic project",
	workspace: { gid: "1" },
};
const task = {
	gid: "3",
	name: "Synthetic task",
	workspace: { gid: "1" },
	projects: [{ gid: "2" }],
};
export default async function createFixture() {
	return {
		configuration: { workspaceId: "1", projectIds: "2" },
		provider: "asana",
		secret: { secret_apiKey: "synthetic-asana" },
		async fetch(request) {
			const url = new URL(request.url);
			assert.equal(url.origin, "https://app.asana.com");
			assert.equal(request.method, "GET");
			assert.equal(
				request.headers.get("authorization"),
				"Bearer synthetic-asana",
			);
			const responses = {
				"/api/1.0/users/me": { data: { gid: "4", name: "Synthetic user" } },
				"/api/1.0/projects/2": { data: project },
				"/api/1.0/projects/2/tasks": { data: [task], next_page: null },
				"/api/1.0/tasks/3": { data: task },
			};
			assert(Object.hasOwn(responses, url.pathname), url.pathname);
			return Response.json(responses[url.pathname]);
		},
		async run(call) {
			assert.equal((await call("getIdentity")).gid, "4");
			assert.equal((await call("listProjects"))[0].gid, "2");
			assert.equal((await call("getProject", { projectId: "2" })).gid, "2");
			assert.equal(
				(await call("listTasks", { projectId: "2" })).tasks[0].gid,
				"3",
			);
			assert.equal((await call("getTask", { taskId: "3" })).gid, "3");
		},
	};
}
