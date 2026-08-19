import { describe, expect, it } from "vitest";
import { contrast } from "./contrast";
import { readBlock } from "./css";

const LIGHT = readBlock(":root");
const DARK = readBlock(':root[data-dya-theme="dark"]');

function token(theme: Map<string, string>, name: string): string {
    const value = theme.get(name);
    if (value === undefined) {
        throw new Error(`Missing token: ${name}`);
    }
    return value;
}

function ratio(theme: Map<string, string>, fg: string, bg: string): number {
    return contrast(token(theme, fg), token(theme, bg));
}

describe("light theme contrast", () => {
    it("primary and secondary text reach AA on the canvas", () => {
        expect(ratio(LIGHT, "--dya-text", "--dya-bg")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(LIGHT, "--dya-text-2", "--dya-bg")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(LIGHT, "--dya-text-3", "--dya-bg")).toBeGreaterThanOrEqual(4.5);
    });

    it("primary text reaches AA on the raised surface too", () => {
        expect(ratio(LIGHT, "--dya-text", "--dya-surface-1")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(LIGHT, "--dya-text-3", "--dya-surface-1")).toBeGreaterThanOrEqual(4.5);
    });

    it("tertiary text reaches the large-text minimum", () => {
        expect(ratio(LIGHT, "--dya-text-4", "--dya-bg")).toBeGreaterThanOrEqual(3);
    });

    it("the primary button reaches AA", () => {
        expect(ratio(LIGHT, "--dya-on-inverse", "--dya-surface-inverse")).toBeGreaterThanOrEqual(4.5);
    });
});

describe("dark theme contrast", () => {
    it("primary and secondary text reach AA on the background", () => {
        expect(ratio(DARK, "--dya-text", "--dya-bg")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(DARK, "--dya-text-2", "--dya-bg")).toBeGreaterThanOrEqual(4.5);
    });

    it("primary text reaches AA on the raised surface", () => {
        expect(ratio(DARK, "--dya-text", "--dya-surface-1")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(DARK, "--dya-text-2", "--dya-surface-1")).toBeGreaterThanOrEqual(4.5);
    });

    it("tertiary text reaches the large-text minimum", () => {
        expect(ratio(DARK, "--dya-text-3", "--dya-bg")).toBeGreaterThanOrEqual(3);
    });

    it("the primary button reaches AA", () => {
        expect(ratio(DARK, "--dya-on-inverse", "--dya-surface-inverse")).toBeGreaterThanOrEqual(4.5);
    });
});

describe("the accent as a graphical object", () => {
    it("reaches the 3:1 minimum of WCAG 1.4.11 in both themes", () => {
        expect(contrast(token(LIGHT, "--dya-accent"), token(LIGHT, "--dya-bg")))
            .toBeGreaterThanOrEqual(3);
        expect(contrast(token(LIGHT, "--dya-accent"), token(DARK, "--dya-bg")))
            .toBeGreaterThanOrEqual(3);
    });
});
