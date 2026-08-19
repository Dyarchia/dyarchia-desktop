import type { HTMLAttributes } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
    return (
        <span
            data-tone={tone}
            className={[styles.badge, className].filter(Boolean).join(" ")}
            {...rest}
        />
    );
}
