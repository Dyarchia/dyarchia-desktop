import type { ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
}

export function Button({
    variant = "secondary",
    className,
    type = "button",
    ...rest
}: ButtonProps) {
    return (
        <button
            type={type}
            data-variant={variant}
            className={[styles.button, className].filter(Boolean).join(" ")}
            {...rest}
        />
    );
}
