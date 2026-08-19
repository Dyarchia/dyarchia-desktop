import { useEffect, useState } from "react";
import styles from "./App.module.css";

type Theme = "light" | "dark";

export function App() {
    const [theme, setTheme] = useState<Theme>("light");

    useEffect(() => {
        document.documentElement.dataset.dyaTheme = theme;
    }, [theme]);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <span className={styles.wordmark}>dyarchia-ui</span>
                <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                >
                    {theme === "light" ? "dark" : "light"}
                </button>
            </header>
            <main className={styles.main} />
        </div>
    );
}
