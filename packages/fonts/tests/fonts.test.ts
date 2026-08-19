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
        file: "../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
    },
    {
        family: "Geist Mono",
        file: "../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
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
        for (const face of FACES) {
            const resolved = fileURLToPath(new URL(face.file, import.meta.url));
            expect(existsSync(resolved), `missing: ${face.file}`).toBe(true);
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
