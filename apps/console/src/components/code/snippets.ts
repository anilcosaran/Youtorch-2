import { site } from "@/config/site";

export type Lang = "curl" | "python" | "node";

export type Snippets = Record<Lang, string>;

/** Environment variable the examples read the secret key from. */
export const apiKeyEnv = "MODELVEND_API_KEY";

export type TaskInput = Record<string, string | number | boolean>;

const defaultModel = "modelvend/lumen-1";
const defaultInput: TaskInput = { prompt: "A paper boat drifting through a neon-lit canal at night", aspect_ratio: "16:9" };

const json = (value: unknown) => JSON.stringify(value);
const pyValue = (value: string | number | boolean) => (typeof value === "boolean" ? (value ? "True" : "False") : json(value));

/**
 * Creates a task with plain HTTP and follows it until it finishes. `Prefer: wait` lets short jobs answer in the
 * same request; longer ones come back queued or running and are polled. There are no SDKs yet.
 */
export function snippetsFor(model = defaultModel, input: TaskInput = defaultInput): Snippets {
  const entries = Object.entries(input);
  // Indented under -d, with single quotes escaped for the shell.
  const body = JSON.stringify({ model, input }, null, 2).replace(/\n/g, "\n  ").replace(/'/g, "'\\''");
  return {
    curl: `# Create the task; waits up to 30 s for a result
curl ${site.apiBase}/tasks \\
  -H "Authorization: Bearer $${apiKeyEnv}" \\
  -H "Content-Type: application/json" \\
  -H "Prefer: wait=30" \\
  -d '${body}'

# Still queued or running? Poll it by ID until it succeeds or fails
curl ${site.apiBase}/tasks/TASK_ID \\
  -H "Authorization: Bearer $${apiKeyEnv}"`,
    python: `import os, time
import requests

API = "${site.apiBase}"
headers = {"Authorization": f"Bearer {os.environ['${apiKeyEnv}']}"}

res = requests.post(f"{API}/tasks", headers={**headers, "Prefer": "wait=30"}, json={
    "model": ${json(model)},
    "input": {
${entries.map(([k, v]) => `        ${json(k)}: ${pyValue(v)},`).join("\n")}
    },
})
res.raise_for_status()
task = res.json()

while task["status"] in ("queued", "running"):
    time.sleep(5)
    task = requests.get(f"{API}/tasks/{task['id']}", headers=headers).json()

print(task["status"], task["output"] or task["error"])`,
    node: `const API = "${site.apiBase}";
const headers = { Authorization: \`Bearer \${process.env.${apiKeyEnv}}\` };

const res = await fetch(\`\${API}/tasks\`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json", Prefer: "wait=30" },
  body: JSON.stringify({
    model: ${json(model)},
    input: {
${entries.map(([k, v]) => `      ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : json(k)}: ${json(v)},`).join("\n")}
    },
  }),
});
if (!res.ok) throw new Error(\`\${res.status} \${await res.text()}\`);
let task = await res.json();

while (task.status === "queued" || task.status === "running") {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  task = await (await fetch(\`\${API}/tasks/\${task.id}\`, { headers })).json();
}

console.log(task.status, task.output ?? task.error);`,
  };
}
