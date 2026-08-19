import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const UI_ROOT = fileURLToPath(new URL("../src", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const MODULES = globSync("**/*.module.css", { cwd: UI_ROOT }).map((file) => ({
    file,
    source: readFileSync(`${UI_ROOT}/${file}`, "utf8"),
}));

function offenders(pattern: RegExp): string[] {
    return MODULES.filter((module) => pattern.test(module.source)).map(
        (module) => module.file,
    );
}

describe("the mandate", () => {
    it("finds the component css modules", () => {
        expect(MODULES.length).toBeGreaterThanOrEqual(8);
    });

    it("rule 3: no literal color lives outside tokens.css", () => {
        const GENERATED = /(^|[\\/])(node_modules|dist|out|coverage)([\\/]|$)/;
        const sources = [
            ...globSync("packages/**/*.css", { cwd: REPO_ROOT }),
            ...globSync("apps/**/*.css", { cwd: REPO_ROOT }),
        ].filter((file) => !GENERATED.test(file) && !file.endsWith("tokens.css"));
        expect(sources.length).toBeGreaterThanOrEqual(9);
        const bad: string[] = [];
        for (const file of sources) {
            const source = readFileSync(`${REPO_ROOT}/${file}`, "utf8");
            for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
                bad.push(`${file}: ${match[0]}`);
            }
        }
        expect(bad).toEqual([]);
    });

    it("rule 5: no component declares a literal radius", () => {
        expect(offenders(/border-radius:(?!\s*var\(--dya-radius)/)).toEqual([]);
    });

    it("no literal colors in the components", () => {
        expect(offenders(/(?:color|background)[^:]*:\s*(?![^;]*var\(--dya-)[^;]*#/)).toEqual(
            [],
        );
    });

    it("rule 6: interface chrome uses mono in uppercase", () => {
        const EXEMPT = ["Input/Input.module.css"];
        const mono = MODULES.filter(
            (module) =>
                module.source.includes("var(--dya-font-mono)") &&
                !EXEMPT.includes(module.file.replaceAll("\\", "/")),
        );
        for (const module of mono) {
            expect(module.source, `${module.file} uses mono without uppercase`).toContain(
                "text-transform: uppercase",
            );
        }
        expect(mono.length).toBeGreaterThanOrEqual(4);
    });

    it("rule 7: no component exceeds weight 500", () => {
        const weights = MODULES.flatMap((module) =>
            [...module.source.matchAll(/font-weight:\s*(\d+)/g)].map((match) =>
                Number(match[1]),
            ),
        );
        expect(weights.length).toBeGreaterThan(0);
        expect(Math.max(...weights)).toBeLessThanOrEqual(500);
    });

    it("rule 9: no component emits backdrop-filter", () => {
        expect(offenders(/backdrop-filter/)).toEqual([]);
    });

    it("rule 9: durations and curves go through tokens", () => {
        expect(offenders(/transition:[^;]*\b\d+m?s\b/)).toEqual([]);
    });

    it("box-shadow is never transitioned", () => {
        expect(offenders(/transition:[^;]*box-shadow/)).toEqual([]);
    });
});
