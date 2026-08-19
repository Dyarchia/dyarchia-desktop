import { describe, expect, it } from "vitest";
import { readBlock } from "./css";

const LIGHT = readBlock(":root");

const REQUIRED = [
    "--dya-radius",
    "--dya-radius-media",
    "--dya-radius-full",
    "--dya-bg",
    "--dya-surface-1",
    "--dya-surface-2",
    "--dya-surface-inverse",
    "--dya-text",
    "--dya-text-2",
    "--dya-text-3",
    "--dya-text-4",
    "--dya-border",
    "--dya-border-control",
    "--dya-border-card",
    "--dya-accent",
    "--dya-accent-soft",
    "--dya-relief-light",
    "--dya-relief-ring",
    "--dya-relief-ring-strong",
    "--dya-relief-shade",
    "--dya-relief-drop",
    "--dya-focus",
];

describe("light theme tokens", () => {
    it("declares every required token", () => {
        const missing = REQUIRED.filter((token) => !LIGHT.has(token));
        expect(missing).toEqual([]);
    });

    it("uses a single orange", () => {
        expect(LIGHT.get("--dya-accent")).toBe("#ee6018");
        expect(LIGHT.get("--dya-accent-soft")).toBe("#ee601826");
    });

    it("declares exactly three radii", () => {
        const radii = [...LIGHT.keys()].filter((token) =>
            token.startsWith("--dya-radius"),
        );
        expect(radii.sort()).toEqual([
            "--dya-radius",
            "--dya-radius-full",
            "--dya-radius-media",
        ]);
    });

    it("keeps glass switched off", () => {
        expect(LIGHT.get("--dya-glass")).toBe("none");
    });
});

const DARK = readBlock(':root[data-dya-theme="dark"]');

const THEMED = [
    "--dya-bg",
    "--dya-surface-1",
    "--dya-surface-2",
    "--dya-surface-inverse",
    "--dya-surface-inverse-hover",
    "--dya-on-inverse",
    "--dya-text",
    "--dya-text-2",
    "--dya-text-3",
    "--dya-text-4",
    "--dya-border",
    "--dya-border-control",
    "--dya-border-card",
    "--dya-line",
    "--dya-faint",
    "--dya-relief-light",
    "--dya-relief-ring",
    "--dya-relief-ring-strong",
    "--dya-relief-shade",
    "--dya-relief-drop",
    "--dya-focus",
];

describe("theme parity", () => {
    it("the dark theme redefines exactly the themed tokens", () => {
        expect([...DARK.keys()].sort()).toEqual([...THEMED].sort());
    });

    it("every dark theme token also exists in the light theme", () => {
        const orphans = [...DARK.keys()].filter((token) => !LIGHT.has(token));
        expect(orphans).toEqual([]);
    });

    it("the accent is not redefined per theme", () => {
        expect(DARK.has("--dya-accent")).toBe(false);
        expect(DARK.has("--dya-accent-soft")).toBe(false);
    });

    it("shape is not redefined per theme", () => {
        const shape = [...DARK.keys()].filter(
            (token) =>
                token.startsWith("--dya-radius") ||
                token.startsWith("--dya-space") ||
                token.startsWith("--dya-size"),
        );
        expect(shape).toEqual([]);
    });
});

describe("elevation", () => {
    const RUNGS = [
        "--dya-elev-flat",
        "--dya-elev-raised",
        "--dya-elev-raised-hover",
        "--dya-elev-key",
        "--dya-elev-key-pressed",
        "--dya-elev-overlay",
    ];

    it("declares the six rungs", () => {
        const missing = RUNGS.filter((rung) => !LIGHT.has(rung));
        expect(missing).toEqual([]);
    });

    it("recipes carry no literal color, only relief parameters", () => {
        for (const rung of RUNGS) {
            const recipe = LIGHT.get(rung)!;
            if (recipe === "none") {
                continue;
            }
            expect(recipe, `${rung} carries a literal color`).not.toMatch(
                /#(?!0{4}(?:[^0-9a-fA-F]|$))[0-9a-fA-F]{3,8}(?![\w-])/,
            );
        }
    });

    it("no raised rung is a lone diffuse shadow", () => {
        for (const rung of ["--dya-elev-raised", "--dya-elev-key", "--dya-elev-overlay"]) {
            const layers = LIGHT.get(rung)!.split(",");
            expect(layers.length, `${rung} has fewer than three layers`).toBeGreaterThanOrEqual(3);
            expect(LIGHT.get(rung)!, `${rung} has no inner light`).toContain("inset");
        }
    });

    it("the flat rung paints nothing", () => {
        expect(LIGHT.get("--dya-elev-flat")).toBe("none");
    });
});

describe("motion", () => {
    const MOTION = [
        "--dya-ease",
        "--dya-ease-out",
        "--dya-ease-press",
        "--dya-ease-enter",
        "--dya-dur-press",
        "--dya-dur-fast",
        "--dya-dur",
        "--dya-dur-slow",
    ];

    it("declares the four curves and the four durations", () => {
        const missing = MOTION.filter((name) => !LIGHT.has(name));
        expect(missing).toEqual([]);
    });
});
