import type { InputHTMLAttributes } from "react";
import styles from "./Input.module.css";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, type = "text", ...rest }: InputProps) {
    return (
        <input
            type={type}
            className={[styles.input, className].filter(Boolean).join(" ")}
            {...rest}
        />
    );
}
