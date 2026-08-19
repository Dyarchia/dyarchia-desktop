import { useEffect, useState } from "react";
import { Button } from "@dyarchia/ui";
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
            <main className={styles.main}>
                <section className={styles.section}>
                    <h2 className={styles.eyebrow}>Button</h2>
                    <div className={styles.row}>
                        <Button variant="primary">Primary</Button>
                        <Button variant="secondary">Secondary</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="secondary" disabled>
                            Disabled
                        </Button>
                    </div>
                </section>
            </main>
        </div>
    );
}
