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
