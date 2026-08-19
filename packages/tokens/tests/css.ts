import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
    fileURLToPath(new URL("../src/tokens.css", import.meta.url)),
    "utf8",
);

export function readBlock(selector: string): Map<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(SOURCE);
    if (block === null) {
        throw new Error(`Block not found in tokens.css: ${selector}`);
    }
    const declarations = new Map<string, string>();
    for (const match of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        declarations.set(match[1]!, match[2]!.trim().replace(/\s+/g, " "));
    }
    return declarations;
}
