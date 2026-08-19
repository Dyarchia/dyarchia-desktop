import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
    fileURLToPath(new URL("../src/fonts.css", import.meta.url)),
    "utf8",
);

const FACES = [
    {
        family: "Geist",
    },
    {
        family: "Geist Mono",
    },
];

describe("@dyarchia/fonts", () => {
    it("declares both variable families", () => {
        for (const face of FACES) {
            expect(CSS).toContain(`font-family: "${face.family}"`);
        }
        expect(CSS.match(/@font-face/g)).toHaveLength(2);
    });

    it("points at woff2 files that exist in geist", () => {
        const urlMatches = CSS.match(/url\("([^"]+)"\)/g);
        expect(urlMatches).not.toBeNull();
        expect(urlMatches).toHaveLength(2);

        for (const match of urlMatches!) {
            const url = match.match(/url\("([^"]+)"\)/)![1];
            const resolved = fileURLToPath(new URL(url, import.meta.url));
            expect(existsSync(resolved), `missing: ${url}`).toBe(true);
        }
    });

    it("covers the variable weight range and uses font-display swap", () => {
        expect(CSS.match(/font-weight: 100 900;/g)).toHaveLength(2);
        expect(CSS.match(/font-display: swap;/g)).toHaveLength(2);
    });

    it("loads no remote resource", () => {
        expect(CSS).not.toMatch(/https?:/);
    });
});
