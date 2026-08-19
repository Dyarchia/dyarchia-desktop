import type { HTMLAttributes } from "react";
import styles from "./Eyebrow.module.css";

export type EyebrowProps = HTMLAttributes<HTMLParagraphElement>;

export function Eyebrow({ className, ...rest }: EyebrowProps) {
    return (
        <p className={[styles.eyebrow, className].filter(Boolean).join(" ")} {...rest} />
    );
}
