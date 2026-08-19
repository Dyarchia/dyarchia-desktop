import type { HTMLAttributes } from "react";
import styles from "./Separator.module.css";

export type SeparatorOrientation = "horizontal" | "vertical";

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
    orientation?: SeparatorOrientation;
    dashed?: boolean;
}

export function Separator({
    orientation = "horizontal",
    dashed = false,
    className,
    ...rest
}: SeparatorProps) {
    return (
        <div
            role="separator"
            aria-orientation={orientation}
            data-dashed={dashed}
            className={[styles.separator, className].filter(Boolean).join(" ")}
            {...rest}
        />
    );
}
