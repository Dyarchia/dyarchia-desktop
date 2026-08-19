// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, Card, Input, Kbd, Surface } from "../src";

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
        const { unmount } = render(
            <Button type="submit" disabled>
                Deploy
            </Button>,
        );
        const disabledButton = screen.getByRole("button") as HTMLButtonElement;
        expect(disabledButton.type).toBe("submit");
        expect(disabledButton.disabled).toBe(true);
        unmount();

        const handleClick = vi.fn();
        render(<Button onClick={handleClick}>Deploy</Button>);
        fireEvent.click(screen.getByRole("button"));
        expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("keeps the classes passed to it", () => {
        render(<Button className="extra">Deploy</Button>);
        expect(screen.getByRole("button").className).toContain("extra");
    });
});

describe("Kbd", () => {
    it("renders a kbd element", () => {
        const { container } = render(<Kbd>K</Kbd>);
        expect(container.querySelector("kbd")).not.toBeNull();
    });

    it("is not pressed by default", () => {
        const { container } = render(<Kbd>K</Kbd>);
        expect(container.querySelector("kbd")!.dataset.pressed).toBe("false");
    });

    it("exposes the pressed state", () => {
        const { container } = render(<Kbd pressed>K</Kbd>);
        expect(container.querySelector("kbd")!.dataset.pressed).toBe("true");
    });

    it("shows its content", () => {
        render(<Kbd>Ctrl</Kbd>);
        expect(screen.getByText("Ctrl")).toBeDefined();
    });
});

describe("Input", () => {
    it("renders a text field associable with its label", () => {
        render(
            <>
                <label htmlFor="repo">Repo</label>
                <Input id="repo" />
            </>,
        );
        expect(screen.getByLabelText("Repo")).toBeDefined();
    });

    it("forwards placeholder, value and disabled", () => {
        render(<Input placeholder="origin/main" defaultValue="dyarchia" disabled />);
        const input = screen.getByPlaceholderText("origin/main") as HTMLInputElement;
        expect(input.value).toBe("dyarchia");
        expect(input.disabled).toBe(true);
    });
});

describe("Card", () => {
    it("renders its content", () => {
        render(<Card>Plan</Card>);
        expect(screen.getByText("Plan")).toBeDefined();
    });
});

describe("Surface", () => {
    it("defaults to level 1", () => {
        const { container } = render(<Surface>panel</Surface>);
        expect((container.firstElementChild as HTMLElement).dataset.level).toBe("1");
    });

    it("accepts level 2", () => {
        const { container } = render(<Surface level={2}>panel</Surface>);
        expect((container.firstElementChild as HTMLElement).dataset.level).toBe("2");
    });
});
