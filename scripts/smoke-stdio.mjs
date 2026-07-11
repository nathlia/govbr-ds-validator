// Boots dist/index.js over real stdio and exercises one tool + the prompt.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = new Client({ name: "smoke", version: "1.0.0" });
const transport = new StdioClientTransport({ command: "node", args: [join(root, "dist/index.js")] });

await client.connect(transport);
const { tools } = await client.listTools();
console.log("tools:", tools.length);

const res = await client.callTool({ name: "get_emag_rules", arguments: { id: "4.4" } });
const rule = JSON.parse(res.content.map((c) => c.text).join(""));
console.log("emag 4.4:", rule.title);

const prompt = await client.getPrompt({ name: "validate_page", arguments: { url: "http://example.com" } });
console.log("prompt chars:", prompt.messages[0].content.text.length);

await client.close();
console.log("smoke OK");
