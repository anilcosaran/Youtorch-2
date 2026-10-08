import { site } from "@/config/site";

export type Lang = "curl" | "python" | "node";

export type Snippets = Record<Lang, string>;

/** Environment variable the SDKs read the secret key from. */
export const apiKeyEnv = "YOUTORCH_API_KEY";

export function snippetsFor(model = "lumen-1", prompt = "A paper boat drifting through a neon-lit canal at night"): Snippets {
  return {
    curl: `curl ${site.apiBase}/generations \\
  -H "Authorization: Bearer $${apiKeyEnv}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "prompt": "${prompt}",
    "duration": 8,
    "aspect_ratio": "16:9"
  }'`,
    python: `from youtorch import Youtorch

client = Youtorch()  # reads ${apiKeyEnv}

job = client.generations.create(
    model="${model}",
    prompt="${prompt}",
    duration=8,
    aspect_ratio="16:9",
)

result = job.wait()  # polls until the asset is ready
print(result.output.url)`,
    node: `import Youtorch from "@youtorch/sdk";

const youtorch = new Youtorch(); // reads ${apiKeyEnv}

const job = await youtorch.generations.create({
  model: "${model}",
  prompt: "${prompt}",
  duration: 8,
  aspectRatio: "16:9",
});

const { output } = await job.wait();
console.log(output.url);`,
  };
}
