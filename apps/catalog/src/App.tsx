import { useEffect, useState } from "react";
import { Badge, Button, Card, Eyebrow, Input, Kbd, Separator, Surface } from "@dyarchia/ui";
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
                    <Eyebrow>Button</Eyebrow>
                    <div className={styles.row}>
                        <Button variant="primary">Primary</Button>
                        <Button variant="secondary">Secondary</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="secondary" disabled>
                            Disabled
                        </Button>
                    </div>
                </section>
                <section className={styles.section}>
                    <Eyebrow>Kbd</Eyebrow>
                    <div className={styles.row}>
                        <Kbd>Ctrl</Kbd>
                        <Kbd>Shift</Kbd>
                        <Kbd>K</Kbd>
                        <Kbd pressed>K</Kbd>
                    </div>
                </section>

                <section className={styles.section}>
                    <Eyebrow>Input</Eyebrow>
                    <div className={styles.row}>
                        <Input placeholder="origin/main" />
                        <Input defaultValue="dyarchia" />
                        <Input placeholder="disabled" disabled />
                    </div>
                </section>

                <section className={styles.section}>
                    <Eyebrow>Surfaces</Eyebrow>
                    <div className={styles.row}>
                        <Card>Card on surface 1</Card>
                        <Surface level={1}>Surface 1</Surface>
                        <Surface level={2}>Surface 2</Surface>
                    </div>
                </section>

                <section className={styles.section}>
                    <Eyebrow>Badge and Separator</Eyebrow>
                    <div className={styles.row}>
                        <Badge>beta</Badge>
                        <Badge tone="accent">new</Badge>
                        <Separator orientation="vertical" />
                        <Badge>v0.1.0</Badge>
                    </div>
                    <Separator dashed />
                </section>
            </main>
        </div>
    );
}
