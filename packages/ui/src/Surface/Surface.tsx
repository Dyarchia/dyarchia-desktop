import type { HTMLAttributes } from "react";
import styles from "./Surface.module.css";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
    level?: 1 | 2;
}

export function Surface({ level = 1, className, ...rest }: SurfaceProps) {
    return (
        <div
            data-level={level}
            className={[styles.surface, className].filter(Boolean).join(" ")}
            {...rest}
        />
    );
}
