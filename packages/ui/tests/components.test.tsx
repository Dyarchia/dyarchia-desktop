// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../src";

describe("Button", () => {
    it("renders an accessible button with its label", () => {
        render(<Button>Deploy</Button>);
        expect(screen.getByRole("button", { name: "Deploy" })).toBeDefined();
    });

    it("defaults to secondary", () => {
        render(<Button>Deploy</Button>);
        expect(screen.getByRole("button").dataset.variant).toBe("secondary");
    });

    it("exposes the variant as a data attribute", () => {
        render(<Button variant="primary">Deploy</Button>);
        expect(screen.getByRole("button").dataset.variant).toBe("primary");
    });

    it("forwards type, disabled and onClick", () => {
        render(
            <Button type="submit" disabled>
                Deploy
            </Button>,
        );
        const button = screen.getByRole("button") as HTMLButtonElement;
        expect(button.type).toBe("submit");
        expect(button.disabled).toBe(true);
    });

    it("keeps the classes passed to it", () => {
        render(<Button className="extra">Deploy</Button>);
        expect(screen.getByRole("button").className).toContain("extra");
    });
});
