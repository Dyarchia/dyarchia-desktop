import type { HTMLAttributes } from "react";
import styles from "./Kbd.module.css";

export interface KbdProps extends HTMLAttributes<HTMLElement> {
    pressed?: boolean;
}

export function Kbd({ pressed = false, className, ...rest }: KbdProps) {
    return (
        <kbd
            data-pressed={pressed}
            className={[styles.kbd, className].filter(Boolean).join(" ")}
            {...rest}
        />
    );
}
