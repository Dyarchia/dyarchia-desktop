# dyarchia-ui Fase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir `@dyarchia/tokens`, `@dyarchia/fonts` y las ocho primitivas de `@dyarchia/ui`, con un catálogo Vite que las muestra en los dos temas y una suite de tests que convierte el mandato del spec en aserciones ejecutables.

**Architecture:** Workspace pnpm con tres paquetes publicables y una app de catálogo. Los tokens son CSS puro sin JavaScript; los tests los leen parseando el propio `tokens.css`, de modo que los contrastes WCAG y la theme parity quedan verificados en CI y no en revisión visual. Los componentes son React con CSS Modules y no llevan ni un valor de color, radio o sombra literal: todo pasa por token, y un test lo comprueba mecánicamente.

**Tech Stack:** pnpm 10.23.0, Node 24, TypeScript 5.9, React 19, Vite 7, Vitest 4, @testing-library/react 16, jsdom 30, geist 1.7.2.

**Spec:** `docs/specs/2026-08-19-dyarchia-ui-design.md`

**Alcance:** Solo la fase 1 del spec (§11). Las fases 2 a 5 —migración de dyarchia-desktop, tier de Base UI, composites y landing— tendrán sus propios planes. `@base-ui-components/react` no se instala aquí: su última versión publicada es `1.0.0-rc.0` y la decisión se toma al abrir la fase 3.

## Global Constraints

- Prefijo de token obligatorio: `--dya-`. Sin excepciones.
- Un solo naranja en todo el repositorio: `#ee6018`. Ningún otro valor naranja puede aparecer en ningún archivo.
- Tres radios y solo tres: `--dya-radius` 3px, `--dya-radius-media` 4px, `--dya-radius-full` 999px.
- Ningún componente declara un color, radio, sombra, duración o curva literal. Todo va por `var(--dya-*)`.
- Texto de interfaz: `--dya-font-mono`, `text-transform: uppercase`, `letter-spacing: var(--dya-tracking-mono)`.
- Peso tipográfico 400 salvo el display, que es 500.
- `--dya-glass` vale `none`. Ningún archivo de la fase 1 emite `backdrop-filter`.
- Prohibido `transition` sobre `box-shadow` en componentes que se repiten en listas.
- Todo el contenido de archivo en inglés salvo la documentación, que va en castellano.
- Indentación de 4 espacios en todos los lenguajes.
- Sin comentarios en el código salvo que el paso los muestre explícitamente.

---

## File Structure

```text
dyarchia-ui/
├─ package.json                          raiz privada del workspace
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ vitest.config.ts                      config unica, entorno node por defecto
├─ .gitignore
├─ packages/
│  ├─ tokens/
│  │  ├─ package.json
│  │  ├─ src/tokens.css                  color, forma, tipografia, elevacion
│  │  ├─ src/reset.css                   normalizacion y movimiento reducido
│  │  ├─ src/motion.css                  curvas y duraciones
│  │  ├─ src/index.css                   importa los tres
│  │  └─ tests/
│  │     ├─ css.ts                       parser de custom properties
│  │     ├─ contrast.ts                  luminancia y ratio WCAG
│  │     ├─ tokens.test.ts               presencia y theme parity
│  │     └─ contrast.test.ts             los ratios del spec, como asercion
│  ├─ fonts/
│  │  ├─ package.json
│  │  └─ src/fonts.css                   @font-face de Geist Sans y Mono
│  └─ ui/
│     ├─ package.json
│     ├─ src/index.ts                     barrel publico
│     ├─ src/Button/{Button.tsx,Button.module.css}
│     ├─ src/Kbd/{Kbd.tsx,Kbd.module.css}
│     ├─ src/Input/{Input.tsx,Input.module.css}
│     ├─ src/Card/{Card.tsx,Card.module.css}
│     ├─ src/Surface/{Surface.tsx,Surface.module.css}
│     ├─ src/Badge/{Badge.tsx,Badge.module.css}
│     ├─ src/Separator/{Separator.tsx,Separator.module.css}
│     ├─ src/Eyebrow/{Eyebrow.tsx,Eyebrow.module.css}
│     └─ tests/
│        ├─ components.test.tsx           render y contrato de cada primitiva
│        └─ mandate.test.ts               el mandato como lint mecanico
└─ apps/catalog/
   ├─ package.json
   ├─ index.html
   ├─ vite.config.ts
   └─ src/{main.tsx,App.tsx,App.module.css}
```

Cada componente vive en su propia carpeta con su CSS al lado. Los archivos que cambian juntos viven juntos.

---

### Task 1: Andamiaje del workspace

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Test: `packages/tokens/tests/smoke.test.ts` (temporal, se borra en la Task 2)

**Interfaces:**
- Consumes: nada
- Produces: `pnpm test` ejecutable desde la raíz; workspaces `packages/*` y `apps/*` resueltos por pnpm.

- [ ] **Step 1: Verificar el repositorio git**

El repositorio ya fue inicializado en `main` antes de arrancar el plan. Confirmar:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected: `main`. Si el comando falla con `not a git repository`, ejecutar
`git init -b main` y continuar.

- [ ] **Step 2: Crear los archivos de configuración**

`package.json`:

```json
{
    "name": "dyarchia-ui",
    "private": true,
    "type": "module",
    "packageManager": "pnpm@10.23.0",
    "engines": {
        "node": ">=24"
    },
    "scripts": {
        "test": "vitest run",
        "test:watch": "vitest",
        "typecheck": "tsc -b",
        "catalog": "pnpm --filter @dyarchia/catalog dev"
    },
    "devDependencies": {
        "@types/node": "^26.2.0",
        "typescript": "^5.9.0",
        "vitest": "^4.1.0"
    }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
    - packages/*
    - apps/*
```

`tsconfig.base.json`:

```json
{
    "compilerOptions": {
        "target": "ES2023",
        "lib": ["ES2023", "DOM", "DOM.Iterable"],
        "module": "ESNext",
        "moduleResolution": "bundler",
        "jsx": "react-jsx",
        "strict": true,
        "noUncheckedIndexedAccess": true,
        "noEmit": true,
        "skipLibCheck": true,
        "verbatimModuleSyntax": true,
        "isolatedModules": true
    }
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        include: ["packages/*/tests/**/*.test.{ts,tsx}"],
    },
});
```

`.gitignore`:

```text
node_modules/
dist/
out/
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 3: Escribir un test de humo que falle**

`packages/tokens/tests/smoke.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("workspace", () => {
    it("runs the suite from the repo root", () => {
        expect(1 + 1).toBe(2);
    });
});
```

- [ ] **Step 4: Instalar y ejecutar**

```bash
pnpm install
```

```bash
pnpm test
```

Expected: 1 test, PASS. Si `pnpm test` no encuentra ningún archivo, el `include` de `vitest.config.ts` está mal.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace with vitest"
```

---

### Task 2: Parser de CSS y light theme tokens

**Files:**
- Create: `packages/tokens/package.json`, `packages/tokens/src/tokens.css`, `packages/tokens/tests/css.ts`, `packages/tokens/tests/tokens.test.ts`
- Delete: `packages/tokens/tests/smoke.test.ts`

**Interfaces:**
- Consumes: el workspace de la Task 1.
- Produces: `readBlock(selector: string): Map<string, string>` exportada desde `packages/tokens/tests/css.ts`, que devuelve las custom properties declaradas en ese bloque de `src/tokens.css`. Las Tasks 3, 4 y 12 la consumen.

- [ ] **Step 1: Escribir el test que falla**

Borrar `packages/tokens/tests/smoke.test.ts` y crear `packages/tokens/tests/tokens.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readBlock } from "./css";

const LIGHT = readBlock(":root");

const REQUIRED = [
    "--dya-radius",
    "--dya-radius-media",
    "--dya-radius-full",
    "--dya-bg",
    "--dya-surface-1",
    "--dya-surface-2",
    "--dya-surface-inverse",
    "--dya-text",
    "--dya-text-2",
    "--dya-text-3",
    "--dya-text-4",
    "--dya-border",
    "--dya-border-control",
    "--dya-border-card",
    "--dya-accent",
    "--dya-accent-soft",
    "--dya-relief-light",
    "--dya-relief-ring",
    "--dya-relief-ring-strong",
    "--dya-relief-shade",
    "--dya-relief-drop",
    "--dya-focus",
];

describe("light theme tokens", () => {
    it("declares every required token", () => {
        const missing = REQUIRED.filter((token) => !LIGHT.has(token));
        expect(missing).toEqual([]);
    });

    it("uses a single orange", () => {
        expect(LIGHT.get("--dya-accent")).toBe("#ee6018");
        expect(LIGHT.get("--dya-accent-soft")).toBe("#ee601826");
    });

    it("declares exactly three radii", () => {
        const radii = [...LIGHT.keys()].filter((token) =>
            token.startsWith("--dya-radius"),
        );
        expect(radii.sort()).toEqual([
            "--dya-radius",
            "--dya-radius-full",
            "--dya-radius-media",
        ]);
    });

    it("keeps glass switched off", () => {
        expect(LIGHT.get("--dya-glass")).toBe("none");
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
pnpm test
```

Expected: FAIL con `Cannot find module './css'`.

- [ ] **Step 3: Escribir el parser**

`packages/tokens/tests/css.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
    fileURLToPath(new URL("../src/tokens.css", import.meta.url)),
    "utf8",
);

export function readBlock(selector: string): Map<string, string> {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(SOURCE);
    if (block === null) {
        throw new Error(`Block not found in tokens.css: ${selector}`);
    }
    const declarations = new Map<string, string>();
    for (const match of block[1]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
        declarations.set(match[1]!, match[2]!.trim().replace(/\s+/g, " "));
    }
    return declarations;
}
```

- [ ] **Step 4: Escribir el paquete y los light theme tokens**

`packages/tokens/package.json`:

```json
{
    "name": "@dyarchia/tokens",
    "version": "0.1.0",
    "type": "module",
    "sideEffects": ["*.css"],
    "exports": {
        ".": "./src/index.css",
        "./tokens.css": "./src/tokens.css",
        "./reset.css": "./src/reset.css",
        "./motion.css": "./src/motion.css"
    },
    "files": ["src"]
}
```

`packages/tokens/src/tokens.css`:

```css
:root {
    --dya-radius: 3px;
    --dya-radius-media: 4px;
    --dya-radius-full: 999px;
    --dya-border-width: 1px;

    --dya-space-1: 4px;
    --dya-space-2: 8px;
    --dya-space-3: 12px;
    --dya-space-4: 16px;
    --dya-space-5: 24px;
    --dya-space-6: 32px;
    --dya-space-8: 48px;
    --dya-space-12: 64px;
    --dya-space-16: 96px;
    --dya-space-24: 160px;

    --dya-font-sans: "Geist", system-ui, -apple-system, "Segoe UI", sans-serif;
    --dya-font-mono: "Geist Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

    --dya-size-display: 64px;
    --dya-size-h1: 48px;
    --dya-size-h2: 36px;
    --dya-size-h3: 24px;
    --dya-size-body: 18px;
    --dya-size-body-sm: 16px;
    --dya-size-label: 14px;
    --dya-size-label-sm: 12px;

    --dya-tracking-display: -0.04em;
    --dya-tracking-h1: -0.035em;
    --dya-tracking-h2: -0.031em;
    --dya-tracking-h3: -0.02em;
    --dya-tracking-mono: -0.02em;

    --dya-leading-tight: 100%;
    --dya-leading-heading: 110%;
    --dya-leading-body: 120%;

    --dya-accent: #ee6018;
    --dya-accent-soft: #ee601826;

    --dya-glass: none;
    --dya-glass-bg: transparent;

    --dya-bg: #f5f5f5;
    --dya-surface-1: #ffffff;
    --dya-surface-2: #ebebeb;
    --dya-surface-inverse: #101010;
    --dya-surface-inverse-hover: #2e2c2b;
    --dya-on-inverse: #f5f5f5;
    --dya-text: #020202;
    --dya-text-2: #3d3a39;
    --dya-text-3: #5c5855;
    --dya-text-4: #8a8380;
    --dya-border: #b8b3b0;
    --dya-border-control: #a49d9a;
    --dya-border-card: #e0dedc;
    --dya-line: #0000000f;
    --dya-faint: #201e1e3b;

    --dya-relief-light: #ffffffe6;
    --dya-relief-ring: #0000001f;
    --dya-relief-ring-strong: #00000038;
    --dya-relief-shade: #0000000d;
    --dya-relief-drop: #0000001a;
    --dya-focus: #00000066;
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

```bash
pnpm test
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tokens): add light theme tokens and css parser for tests"
```

---

### Task 3: Tema oscuro y test de paridad

**Files:**
- Modify: `packages/tokens/src/tokens.css` (añadir el bloque `:root[data-dya-theme="dark"]`)
- Modify: `packages/tokens/tests/tokens.test.ts` (añadir el bloque de paridad)

**Interfaces:**
- Consumes: `readBlock` de la Task 2.
- Produces: el selector `:root[data-dya-theme="dark"]` como contrato de tema. Las Tasks 7 y 12 dependen de él.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `packages/tokens/tests/tokens.test.ts`:

```ts
const DARK = readBlock(':root[data-dya-theme="dark"]');

const THEMED = [
    "--dya-bg",
    "--dya-surface-1",
    "--dya-surface-2",
    "--dya-surface-inverse",
    "--dya-surface-inverse-hover",
    "--dya-on-inverse",
    "--dya-text",
    "--dya-text-2",
    "--dya-text-3",
    "--dya-text-4",
    "--dya-border",
    "--dya-border-control",
    "--dya-border-card",
    "--dya-line",
    "--dya-faint",
    "--dya-relief-light",
    "--dya-relief-ring",
    "--dya-relief-ring-strong",
    "--dya-relief-shade",
    "--dya-relief-drop",
    "--dya-focus",
];

describe("theme parity", () => {
    it("the dark theme redefines exactly the themed tokens", () => {
        expect([...DARK.keys()].sort()).toEqual([...THEMED].sort());
    });

    it("every dark theme token also exists in the light theme", () => {
        const orphans = [...DARK.keys()].filter((token) => !LIGHT.has(token));
        expect(orphans).toEqual([]);
    });

    it("the accent is not redefined per theme", () => {
        expect(DARK.has("--dya-accent")).toBe(false);
        expect(DARK.has("--dya-accent-soft")).toBe(false);
    });

    it("shape is not redefined per theme", () => {
        const shape = [...DARK.keys()].filter(
            (token) =>
                token.startsWith("--dya-radius") ||
                token.startsWith("--dya-space") ||
                token.startsWith("--dya-size"),
        );
        expect(shape).toEqual([]);
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
pnpm test
```

Expected: FAIL con `Bloque no encontrado en tokens.css: :root[data-dya-theme="dark"]`.

- [ ] **Step 3: Añadir el bloque oscuro**

Añadir al final de `packages/tokens/src/tokens.css`:

```css
:root[data-dya-theme="dark"] {
    --dya-bg: #07080a;
    --dya-surface-1: #0e0f11;
    --dya-surface-2: #16171a;
    --dya-surface-inverse: #e6e6e6;
    --dya-surface-inverse-hover: #ffffff;
    --dya-on-inverse: #07080a;
    --dya-text: #f4f4f6;
    --dya-text-2: #a0a3a8;
    --dya-text-3: #6a6b6c;
    --dya-text-4: #4a4b4e;
    --dya-border: #ffffff0f;
    --dya-border-control: #ffffff26;
    --dya-border-card: #ffffff1a;
    --dya-line: #ffffff0f;
    --dya-faint: #ffffff3b;

    --dya-relief-light: #ffffff33;
    --dya-relief-ring: #ffffff26;
    --dya-relief-ring-strong: #ffffff59;
    --dya-relief-shade: #00000040;
    --dya-relief-drop: #00000066;
    --dya-focus: #ffffff80;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
pnpm test
```

Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tokens): add dark theme block with parity tests"
```

---

### Task 4: Suite de contraste WCAG

Convierte los ratios declarados en el spec §4, §5 y §6 en aserciones. Si alguien cambia un token de color y rompe la accesibilidad, la suite lo detecta.

**Files:**
- Create: `packages/tokens/tests/contrast.ts`, `packages/tokens/tests/contrast.test.ts`

**Interfaces:**
- Consumes: `readBlock` de la Task 2.
- Produces: `contrast(a: string, b: string): number` y `luminance(hex: string): number` exportadas desde `packages/tokens/tests/contrast.ts`. Ambas aceptan hex opaco de 6 dígitos.

- [ ] **Step 1: Escribir el test que falla**

`packages/tokens/tests/contrast.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contrast } from "./contrast";
import { readBlock } from "./css";

const LIGHT = readBlock(":root");
const DARK = readBlock(':root[data-dya-theme="dark"]');

function token(theme: Map<string, string>, name: string): string {
    const value = theme.get(name);
    if (value === undefined) {
        throw new Error(`Missing token: ${name}`);
    }
    return value;
}

function ratio(theme: Map<string, string>, fg: string, bg: string): number {
    return contrast(token(theme, fg), token(theme, bg));
}

describe("light theme contrast", () => {
    it("primary and secondary text reach AA on the canvas", () => {
        expect(ratio(LIGHT, "--dya-text", "--dya-bg")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(LIGHT, "--dya-text-2", "--dya-bg")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(LIGHT, "--dya-text-3", "--dya-bg")).toBeGreaterThanOrEqual(4.5);
    });

    it("primary text reaches AA on the raised surface too", () => {
        expect(ratio(LIGHT, "--dya-text", "--dya-surface-1")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(LIGHT, "--dya-text-3", "--dya-surface-1")).toBeGreaterThanOrEqual(4.5);
    });

    it("tertiary text reaches the large-text minimum", () => {
        expect(ratio(LIGHT, "--dya-text-4", "--dya-bg")).toBeGreaterThanOrEqual(3);
    });

    it("the primary button reaches AA", () => {
        expect(ratio(LIGHT, "--dya-on-inverse", "--dya-surface-inverse")).toBeGreaterThanOrEqual(4.5);
    });
});

describe("dark theme contrast", () => {
    it("primary and secondary text reach AA on the background", () => {
        expect(ratio(DARK, "--dya-text", "--dya-bg")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(DARK, "--dya-text-2", "--dya-bg")).toBeGreaterThanOrEqual(4.5);
    });

    it("primary text reaches AA on the raised surface", () => {
        expect(ratio(DARK, "--dya-text", "--dya-surface-1")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(DARK, "--dya-text-2", "--dya-surface-1")).toBeGreaterThanOrEqual(4.5);
    });

    it("tertiary text reaches the large-text minimum", () => {
        expect(ratio(DARK, "--dya-text-3", "--dya-bg")).toBeGreaterThanOrEqual(3);
    });

    it("the primary button reaches AA", () => {
        expect(ratio(DARK, "--dya-on-inverse", "--dya-surface-inverse")).toBeGreaterThanOrEqual(4.5);
    });
});

describe("the accent as a graphical object", () => {
    it("reaches the 3:1 minimum of WCAG 1.4.11 in both themes", () => {
        expect(contrast(token(LIGHT, "--dya-accent"), token(LIGHT, "--dya-bg")))
            .toBeGreaterThanOrEqual(3);
        expect(contrast(token(LIGHT, "--dya-accent"), token(DARK, "--dya-bg")))
            .toBeGreaterThanOrEqual(3);
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
pnpm test
```

Expected: FAIL con `Cannot find module './contrast'`.

- [ ] **Step 3: Escribir el módulo de contraste**

`packages/tokens/tests/contrast.ts`:

```ts
export function luminance(hex: string): number {
    const match = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
    if (match === null) {
        throw new Error(`Expected an opaque 6-digit hex, got: ${hex}`);
    }
    const digits = match[1]!;
    const channels = [0, 2, 4].map(
        (offset) => Number.parseInt(digits.slice(offset, offset + 2), 16) / 255,
    );
    const linear = channels.map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

export function contrast(a: string, b: string): number {
    const first = luminance(a);
    const second = luminance(b);
    return (
        (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
    );
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
pnpm test
```

Expected: 17 tests PASS. Los valores esperados según el spec: claro `--dya-text` 19.03:1, `--dya-text-3` 6.46:1, `--dya-text-4` 3.42:1, primario 17.45:1; oscuro `--dya-text` 18.24:1, `--dya-text-2` 7.92:1, `--dya-text-3` 3.75:1; acento 3.05:1 sobre claro y 6.03:1 sobre oscuro.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(tokens): assert WCAG contrast ratios for both themes"
```

---

### Task 5: Elevación, movimiento y reset

**Files:**
- Modify: `packages/tokens/src/tokens.css` (bloque de elevación dentro de `:root`)
- Create: `packages/tokens/src/motion.css`, `packages/tokens/src/reset.css`, `packages/tokens/src/index.css`
- Modify: `packages/tokens/tests/tokens.test.ts`

**Interfaces:**
- Consumes: `readBlock` de la Task 2, los parámetros de relieve de las Tasks 2 y 3.
- Produces: `--dya-elev-flat`, `--dya-elev-raised`, `--dya-elev-raised-hover`, `--dya-elev-key`, `--dya-elev-key-pressed`, `--dya-elev-overlay`, `--dya-ease`, `--dya-ease-out`, `--dya-ease-press`, `--dya-ease-enter`, `--dya-dur-press`, `--dya-dur-fast`, `--dya-dur`, `--dya-dur-slow`. Las Tasks 8 a 11 los consumen.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `packages/tokens/tests/tokens.test.ts`:

```ts
describe("elevation", () => {
    const RUNGS = [
        "--dya-elev-flat",
        "--dya-elev-raised",
        "--dya-elev-raised-hover",
        "--dya-elev-key",
        "--dya-elev-key-pressed",
        "--dya-elev-overlay",
    ];

    it("declares the six rungs", () => {
        const missing = RUNGS.filter((rung) => !LIGHT.has(rung));
        expect(missing).toEqual([]);
    });

    it("recipes carry no literal color, only relief parameters", () => {
        for (const rung of RUNGS) {
            const recipe = LIGHT.get(rung)!;
            if (recipe === "none") {
                continue;
            }
            expect(recipe, `${rung} carries a literal color`).not.toMatch(
                /#[0-9a-fA-F]{3,8}(?![\w-])/,
            );
        }
    });

    it("no raised rung is a lone diffuse shadow", () => {
        for (const rung of ["--dya-elev-raised", "--dya-elev-key", "--dya-elev-overlay"]) {
            const layers = LIGHT.get(rung)!.split(",");
            expect(layers.length, `${rung} has fewer than three layers`).toBeGreaterThanOrEqual(3);
            expect(LIGHT.get(rung)!, `${rung} has no inner light`).toContain("inset");
        }
    });

    it("the flat rung paints nothing", () => {
        expect(LIGHT.get("--dya-elev-flat")).toBe("none");
    });
});

describe("motion", () => {
    const MOTION = [
        "--dya-ease",
        "--dya-ease-out",
        "--dya-ease-press",
        "--dya-ease-enter",
        "--dya-dur-press",
        "--dya-dur-fast",
        "--dya-dur",
        "--dya-dur-slow",
    ];

    it("declares the four curves and the four durations", () => {
        const missing = MOTION.filter((name) => !LIGHT.has(name));
        expect(missing).toEqual([]);
    });
});
```

Nota: el test de movimiento lee `:root` de `tokens.css`, así que las curvas y duraciones van en `tokens.css`, no en `motion.css`. `motion.css` contendrá solo keyframes.

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
pnpm test
```

Expected: FAIL, `missing` no está vacío.

- [ ] **Step 3: Añadir elevación y movimiento a tokens.css**

Añadir dentro del bloque `:root` de `packages/tokens/src/tokens.css`, justo antes del cierre:

```css
    --dya-ease: ease-in-out;
    --dya-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --dya-ease-press: cubic-bezier(0.34, 1.56, 0.64, 1);
    --dya-ease-enter: cubic-bezier(0.215, 0.61, 0.355, 1);

    --dya-dur-press: 120ms;
    --dya-dur-fast: 160ms;
    --dya-dur: 220ms;
    --dya-dur-slow: 320ms;

    --dya-elev-flat: none;

    --dya-elev-raised:
        inset 0 1px 0 var(--dya-relief-light),
        0 0 0 1px var(--dya-relief-ring),
        inset 0 -1px 0 var(--dya-relief-shade);

    --dya-elev-raised-hover:
        inset 0 1px 0 var(--dya-relief-light),
        0 0 0 1px var(--dya-relief-ring-strong),
        inset 0 -1px 0 var(--dya-relief-shade);

    --dya-elev-key:
        0 1.5px 0.5px 2.5px var(--dya-relief-drop),
        0 0 0 1px var(--dya-relief-ring),
        inset 0 2px 1px 1px var(--dya-relief-shade),
        inset 0 1px 1px 1px var(--dya-relief-light);

    --dya-elev-key-pressed:
        0 0 #0000,
        0 0 0 1px var(--dya-relief-ring),
        inset 0 2px 1px 1px var(--dya-relief-shade),
        inset 0 1px 1px var(--dya-relief-light);

    --dya-elev-overlay:
        0 4px 40px 8px var(--dya-relief-drop),
        0 0 0 1px var(--dya-relief-ring),
        inset 0 1px 0 var(--dya-relief-light);
```

- [ ] **Step 4: Crear reset.css, motion.css e index.css**

`packages/tokens/src/reset.css`:

```css
*,
*::before,
*::after {
    box-sizing: border-box;
}

* {
    margin: 0;
    padding: 0;
}

body {
    background: var(--dya-bg);
    color: var(--dya-text);
    font-family: var(--dya-font-sans);
    font-size: var(--dya-size-body-sm);
    font-weight: 400;
    line-height: var(--dya-leading-body);
    -webkit-font-smoothing: antialiased;
}

::selection {
    background: var(--dya-accent);
    color: var(--dya-on-inverse);
}

:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--dya-focus);
}

::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

::-webkit-scrollbar-thumb {
    background-color: var(--dya-border);
    border-radius: var(--dya-radius);
}

@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

`packages/tokens/src/motion.css`:

```css
@keyframes dya-fade-in {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes dya-slide-up-fade {
    from {
        opacity: 0;
        transform: translateY(2px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes dya-slide-down-fade {
    from {
        opacity: 0;
        transform: translateY(-2px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes dya-blink {
    50% {
        opacity: 0;
    }
}
```

`packages/tokens/src/index.css`:

```css
@import "./tokens.css";
@import "./reset.css";
@import "./motion.css";
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

```bash
pnpm test
```

Expected: 22 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(tokens): add elevation ladder, motion tokens, reset and keyframes"
```

---

### Task 6: @dyarchia/fonts

**Files:**
- Create: `packages/fonts/package.json`, `packages/fonts/src/fonts.css`
- Create: `packages/fonts/tests/fonts.test.ts`

**Interfaces:**
- Consumes: el paquete `geist` del registro.
- Produces: el import `@dyarchia/fonts` que declara las familias `Geist` y `Geist Mono`. La Task 7 lo consume.

- [ ] **Step 1: Crear el paquete e instalar geist**

Crear `packages/fonts/package.json`:

```json
{
    "name": "@dyarchia/fonts",
    "version": "0.1.0",
    "type": "module",
    "sideEffects": ["*.css"],
    "exports": {
        ".": "./src/fonts.css"
    },
    "files": ["src"],
    "dependencies": {
        "geist": "1.7.2"
    }
}
```

Luego:

```bash
pnpm install
```

- [ ] **Step 2: Escribir el test que falla**

`packages/fonts/tests/fonts.test.ts`:

```ts
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
    fileURLToPath(new URL("../src/fonts.css", import.meta.url)),
    "utf8",
);

const FACES = [
    {
        family: "Geist",
        file: "../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
    },
    {
        family: "Geist Mono",
        file: "../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
    },
];

describe("@dyarchia/fonts", () => {
    it("declares both variable families", () => {
        for (const face of FACES) {
            expect(CSS).toContain(`font-family: "${face.family}"`);
        }
        expect(CSS.match(/@font-face/g)).toHaveLength(2);
    });

    it("points at woff2 files that exist in geist", () => {
        for (const face of FACES) {
            const resolved = fileURLToPath(new URL(face.file, import.meta.url));
            expect(existsSync(resolved), `missing: ${face.file}`).toBe(true);
        }
    });

    it("covers the variable weight range and uses font-display swap", () => {
        expect(CSS.match(/font-weight: 100 900;/g)).toHaveLength(2);
        expect(CSS.match(/font-display: swap;/g)).toHaveLength(2);
    });

    it("loads no remote resource", () => {
        expect(CSS).not.toMatch(/https?:/);
    });
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

```bash
pnpm test
```

Expected: FAIL con `ENOENT` sobre `fonts.css`.

- [ ] **Step 4: Escribir fonts.css**

`packages/fonts/src/fonts.css`:

```css
@font-face {
    font-family: "Geist";
    src: url("geist/dist/fonts/geist-sans/Geist-Variable.woff2") format("woff2-variations");
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
}

@font-face {
    font-family: "Geist Mono";
    src: url("geist/dist/fonts/geist-mono/GeistMono-Variable.woff2") format("woff2-variations");
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
}
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

```bash
pnpm test
```

Expected: 26 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(fonts): declare Geist Sans and Mono variable faces"
```

---

### Task 7: App de catálogo con conmutador de tema

**Files:**
- Create: `apps/catalog/package.json`, `apps/catalog/index.html`, `apps/catalog/vite.config.ts`, `apps/catalog/tsconfig.json`, `apps/catalog/src/main.tsx`, `apps/catalog/src/App.tsx`, `apps/catalog/src/App.module.css`

**Interfaces:**
- Consumes: `@dyarchia/tokens` y `@dyarchia/fonts`.
- Produces: la app de catálogo. Las Tasks 8 a 11 añaden secciones a `App.tsx`. El conmutador escribe `data-dya-theme` en `document.documentElement`.

- [ ] **Step 1: Crear el paquete y sus dependencias**

`apps/catalog/package.json`:

```json
{
    "name": "@dyarchia/catalog",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "scripts": {
        "dev": "vite",
        "build": "vite build",
        "preview": "vite preview"
    },
    "dependencies": {
        "@dyarchia/fonts": "workspace:*",
        "@dyarchia/tokens": "workspace:*",
        "react": "^19.2.8",
        "react-dom": "^19.2.8"
    },
    "devDependencies": {
        "@types/react": "^19.2.18",
        "@types/react-dom": "^19.2.4",
        "@vitejs/plugin-react": "^5.2.0",
        "vite": "^7.3.6"
    }
}
```

`apps/catalog/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react()],
    server: { port: 5180 },
});
```

`apps/catalog/tsconfig.json`:

```json
{
    "extends": "../../tsconfig.base.json",
    "include": ["src"]
}
```

`apps/catalog/index.html`:

```html
<!doctype html>
<html lang="es">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>dyarchia-ui</title>
    </head>
    <body>
        <div id="root"></div>
        <script type="module" src="/src/main.tsx"></script>
    </body>
</html>
```

- [ ] **Step 2: Escribir el arranque y el conmutador**

`apps/catalog/src/main.tsx`:

```tsx
import "@dyarchia/fonts";
import "@dyarchia/tokens";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
```

`apps/catalog/src/App.tsx`:

```tsx
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
```

`apps/catalog/src/App.module.css`:

```css
.page {
    min-height: 100vh;
    background: var(--dya-bg);
    color: var(--dya-text);
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 72px;
    padding: 0 var(--dya-space-6);
    border-bottom: var(--dya-border-width) solid var(--dya-line);
}

.wordmark {
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label);
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
}

.toggle {
    height: 32px;
    padding: 0 14px;
    color: var(--dya-text);
    background: var(--dya-bg);
    border: none;
    border-radius: var(--dya-radius);
    box-shadow: var(--dya-elev-raised);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label);
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
    cursor: pointer;
}

.main {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-16);
    max-width: 1440px;
    margin: 0 auto;
    padding: var(--dya-space-16) var(--dya-space-8);
}
```

- [ ] **Step 3: Instalar y arrancar**

```bash
pnpm install
```

```bash
pnpm catalog
```

Expected: Vite sirve en `http://localhost:5180`. La página muestra la cabecera con
el wordmark en mono mayúsculas y el botón de tema. Al pulsarlo el fondo pasa de
`#f5f5f5` a `#07080a` y el texto invierte.

Comprobar además que la tipografía es Geist y no el fallback `system-ui`. La
Task 6 dejó los `@font-face` apuntando a `../node_modules/geist/...`, una ruta
relativa a `fonts.css`, precisamente porque `geist` declara un `exports` map que
no expone `./dist/*` y un especificador de paquete no resolvería. Si el texto se
ve con la fuente del sistema, el fallo está en esa resolución y no en el tema.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(catalog): add vite catalog app with theme toggle"
```

---

### Task 8: Button

**Files:**
- Create: `packages/ui/package.json`, `packages/ui/tsconfig.json`, `packages/ui/src/index.ts`, `packages/ui/src/Button/Button.tsx`, `packages/ui/src/Button/Button.module.css`
- Create: `packages/ui/tests/components.test.tsx`
- Modify: `vitest.config.ts`, `apps/catalog/src/App.tsx`

**Interfaces:**
- Consumes: los tokens de las Tasks 2, 3 y 5.
- Produces: `Button` con props `variant?: "primary" | "secondary" | "ghost"` sobre `ButtonHTMLAttributes<HTMLButtonElement>`, exportado desde `@dyarchia/ui`. Renderiza un `<button>` con `data-variant`.

- [ ] **Step 1: Crear el paquete ui y habilitar jsdom**

`packages/ui/package.json`:

```json
{
    "name": "@dyarchia/ui",
    "version": "0.1.0",
    "type": "module",
    "sideEffects": ["*.css"],
    "exports": {
        ".": "./src/index.ts"
    },
    "files": ["src"],
    "peerDependencies": {
        "react": "^19.0.0",
        "react-dom": "^19.0.0"
    },
    "dependencies": {
        "@dyarchia/tokens": "workspace:*"
    },
    "devDependencies": {
        "@testing-library/react": "^16.3.0",
        "@types/react": "^19.2.18",
        "@types/react-dom": "^19.2.4",
        "jsdom": "^30.0.0",
        "react": "^19.2.8",
        "react-dom": "^19.2.8"
    }
}
```

`packages/ui/tsconfig.json`:

```json
{
    "extends": "../../tsconfig.base.json",
    "include": ["src", "tests"]
}
```

Sustituir `vitest.config.ts` en la raíz por:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    test: {
        environment: "node",
        include: ["packages/*/tests/**/*.test.{ts,tsx}"],
    },
});
```

El entorno sigue siendo `node` para todo. Los tests que necesitan DOM lo declaran
por archivo con un docblock, que es estable entre versiones de Vitest; la opción
`environmentMatchGlobs` está deprecada y no se usa.

Instalar el plugin de React en la raíz:

```bash
pnpm add -D -w @vitejs/plugin-react
```

```bash
pnpm install
```

- [ ] **Step 2: Escribir el test que falla**

`packages/ui/tests/components.test.tsx`:

```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../src";

describe("Button", () => {
    it("renders an accessible button with its label", () => {
        render(<Button>Deploy</Button>);
        expect(screen.getByRole("button", { name: "Deploy" })).toBeDefined();
    });

    it("defaults to secondary", () => {
        render(<Button>Deploy</Button>);
        expect(screen.getByRole("button").dataset.variant).toBe("secondary");
    });

    it("exposes the variant as a data attribute", () => {
        render(<Button variant="primary">Deploy</Button>);
        expect(screen.getByRole("button").dataset.variant).toBe("primary");
    });

    it("forwards type, disabled and onClick", () => {
        render(
            <Button type="submit" disabled>
                Deploy
            </Button>,
        );
        const button = screen.getByRole("button") as HTMLButtonElement;
        expect(button.type).toBe("submit");
        expect(button.disabled).toBe(true);
    });

    it("keeps the classes passed to it", () => {
        render(<Button className="extra">Deploy</Button>);
        expect(screen.getByRole("button").className).toContain("extra");
    });
});
```

- [ ] **Step 3: Ejecutar y verificar que falla**

```bash
pnpm test
```

Expected: FAIL con `Cannot find module '../src'`.

- [ ] **Step 4: Implementar Button**

`packages/ui/src/Button/Button.tsx`:

```tsx
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
```

`packages/ui/src/Button/Button.module.css`:

```css
.button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--dya-space-2);
    height: 32px;
    padding: 0 14px;
    border: none;
    border-radius: var(--dya-radius);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label);
    font-weight: 400;
    line-height: var(--dya-leading-tight);
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
    cursor: pointer;
    transition:
        background-color var(--dya-dur-fast) var(--dya-ease),
        transform var(--dya-dur-press) var(--dya-ease-press);
}

.button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.button:not(:disabled):active {
    transform: scale(0.98);
}

.button:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--dya-focus);
}

.button[data-variant="secondary"] {
    color: var(--dya-text);
    background: var(--dya-bg);
    box-shadow: var(--dya-elev-raised);
}

.button[data-variant="secondary"]:not(:disabled):hover {
    box-shadow: var(--dya-elev-raised-hover);
}

.button[data-variant="primary"] {
    color: var(--dya-on-inverse);
    background: var(--dya-surface-inverse);
}

.button[data-variant="primary"]:not(:disabled):hover {
    background: var(--dya-surface-inverse-hover);
}

.button[data-variant="ghost"] {
    color: var(--dya-text);
    background: transparent;
}

.button[data-variant="ghost"]:not(:disabled):hover {
    background: var(--dya-surface-2);
}
```

`packages/ui/src/index.ts`:

```ts
export { Button } from "./Button/Button";
export type { ButtonProps, ButtonVariant } from "./Button/Button";
```

- [ ] **Step 5: Ejecutar y verificar que pasa**

```bash
pnpm test
```

Expected: 31 tests PASS.

- [ ] **Step 6: Añadir la sección al catálogo**

El catálogo aún no depende de `@dyarchia/ui` —la Task 7 no podía declararlo
porque el paquete no existía—. Añadirlo ahora a `apps/catalog/package.json`,
en `dependencies`, ordenado alfabéticamente junto a los otros dos:

```json
        "@dyarchia/ui": "workspace:*",
```

Y volver a instalar:

```bash
pnpm install
```

Después, en `apps/catalog/src/App.tsx`, importar `Button` desde `@dyarchia/ui` y sustituir `<main className={styles.main} />` por:

```tsx
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
```

Añadir a `App.module.css`:

```css
.section {
    display: flex;
    flex-direction: column;
    gap: var(--dya-space-5);
}

.eyebrow {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label);
    font-weight: 400;
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
    color: var(--dya-text-3);
}

.eyebrow::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: var(--dya-radius-full);
    background: var(--dya-accent);
}

.row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--dya-space-4);
}
```

Verificar en `pnpm catalog` que los cuatro botones se ven en ambos temas y que el relieve del secundario es visible en claro. Si en claro el relieve no se aprecia, subir `--dya-relief-drop` un paso (calibración prevista en el spec §12).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(ui): add Button primitive with three variants"
```

---

### Task 9: Kbd

La pieza que valida el peldaño `--dya-elev-key`, que es el rasgo diferencial del sistema.

**Files:**
- Create: `packages/ui/src/Kbd/Kbd.tsx`, `packages/ui/src/Kbd/Kbd.module.css`
- Modify: `packages/ui/src/index.ts`, `packages/ui/tests/components.test.tsx`, `apps/catalog/src/App.tsx`

**Interfaces:**
- Consumes: `--dya-elev-key` y `--dya-elev-key-pressed` de la Task 5.
- Produces: `Kbd` con props `{ children: ReactNode; pressed?: boolean }` sobre `HTMLAttributes<HTMLElement>`, exportado desde `@dyarchia/ui`. Renderiza un `<kbd>` con `data-pressed`.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `packages/ui/tests/components.test.tsx`:

```tsx
import { Kbd } from "../src";

describe("Kbd", () => {
    it("renders a kbd element", () => {
        const { container } = render(<Kbd>K</Kbd>);
        expect(container.querySelector("kbd")).not.toBeNull();
    });

    it("is not pressed by default", () => {
        const { container } = render(<Kbd>K</Kbd>);
        expect(container.querySelector("kbd")!.dataset.pressed).toBe("false");
    });

    it("exposes the pressed state", () => {
        const { container } = render(<Kbd pressed>K</Kbd>);
        expect(container.querySelector("kbd")!.dataset.pressed).toBe("true");
    });

    it("shows its content", () => {
        render(<Kbd>Ctrl</Kbd>);
        expect(screen.getByText("Ctrl")).toBeDefined();
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
pnpm test
```

Expected: FAIL, `Kbd` no está exportado.

- [ ] **Step 3: Implementar Kbd**

`packages/ui/src/Kbd/Kbd.tsx`:

```tsx
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
```

`packages/ui/src/Kbd/Kbd.module.css`:

```css
.kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 21px;
    padding: 0 var(--dya-space-2);
    color: var(--dya-text-2);
    background: var(--dya-surface-2);
    border-radius: var(--dya-radius);
    box-shadow: var(--dya-elev-key);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
    font-weight: 400;
    line-height: var(--dya-leading-tight);
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
    user-select: none;
    transition: transform var(--dya-dur-fast) var(--dya-ease-out);
}

.kbd[data-pressed="true"] {
    transform: translateY(2px);
    box-shadow: var(--dya-elev-key-pressed);
}
```

Añadir a `packages/ui/src/index.ts`:

```ts
export { Kbd } from "./Kbd/Kbd";
export type { KbdProps } from "./Kbd/Kbd";
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
pnpm test
```

Expected: 35 tests PASS.

- [ ] **Step 5: Añadir la sección al catálogo y calibrar**

En `App.tsx`, añadir tras la sección de Button:

```tsx
                <section className={styles.section}>
                    <h2 className={styles.eyebrow}>Kbd</h2>
                    <div className={styles.row}>
                        <Kbd>Ctrl</Kbd>
                        <Kbd>Shift</Kbd>
                        <Kbd>K</Kbd>
                        <Kbd pressed>K</Kbd>
                    </div>
                </section>
```

Verificar en `pnpm catalog`, en los dos temas, que la tecla se lee como objeto físico: línea de luz arriba, canto definido, sombra corta abajo, y que la pulsada se hunde. Esta es la calibración principal del spec §12. Si en tema claro la tecla se ve plana, subir `--dya-relief-drop` y `--dya-relief-ring` un paso en el bloque `:root` y volver a mirar. Anotar el valor final.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): add Kbd primitive with physical key elevation"
```

---

### Task 10: Input, Card y Surface

**Files:**
- Create: `packages/ui/src/Input/{Input.tsx,Input.module.css}`, `packages/ui/src/Card/{Card.tsx,Card.module.css}`, `packages/ui/src/Surface/{Surface.tsx,Surface.module.css}`
- Modify: `packages/ui/src/index.ts`, `packages/ui/tests/components.test.tsx`, `apps/catalog/src/App.tsx`

**Interfaces:**
- Consumes: los tokens de superficie y borde de las Tasks 2, 3 y 5.
- Produces: `Input` sobre `InputHTMLAttributes<HTMLInputElement>`; `Card` sobre `HTMLAttributes<HTMLDivElement>`; `Surface` con `level?: 1 | 2` sobre `HTMLAttributes<HTMLDivElement>`, que renderiza `data-level`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `packages/ui/tests/components.test.tsx`:

```tsx
import { Card, Input, Surface } from "../src";

describe("Input", () => {
    it("renders a text field associable with its label", () => {
        render(
            <>
                <label htmlFor="repo">Repo</label>
                <Input id="repo" />
            </>,
        );
        expect(screen.getByLabelText("Repo")).toBeDefined();
    });

    it("forwards placeholder, value and disabled", () => {
        render(<Input placeholder="origin/main" defaultValue="dyarchia" disabled />);
        const input = screen.getByPlaceholderText("origin/main") as HTMLInputElement;
        expect(input.value).toBe("dyarchia");
        expect(input.disabled).toBe(true);
    });
});

describe("Card", () => {
    it("renders its content", () => {
        render(<Card>Plan</Card>);
        expect(screen.getByText("Plan")).toBeDefined();
    });
});

describe("Surface", () => {
    it("defaults to level 1", () => {
        const { container } = render(<Surface>panel</Surface>);
        expect((container.firstElementChild as HTMLElement).dataset.level).toBe("1");
    });

    it("accepts level 2", () => {
        const { container } = render(<Surface level={2}>panel</Surface>);
        expect((container.firstElementChild as HTMLElement).dataset.level).toBe("2");
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
pnpm test
```

Expected: FAIL, los tres componentes no están exportados.

- [ ] **Step 3: Implementar los tres componentes**

`packages/ui/src/Input/Input.tsx`:

```tsx
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
```

`packages/ui/src/Input/Input.module.css`:

```css
.input {
    height: 32px;
    padding: 0 var(--dya-space-3);
    color: var(--dya-text);
    background: var(--dya-surface-1);
    border: var(--dya-border-width) solid var(--dya-border-control);
    border-radius: var(--dya-radius);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label);
    letter-spacing: var(--dya-tracking-mono);
    transition: border-color var(--dya-dur-fast) var(--dya-ease);
}

.input::placeholder {
    color: var(--dya-text-4);
}

.input:hover:not(:disabled) {
    border-color: var(--dya-text-3);
}

.input:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--dya-focus);
}

.input:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
```

`packages/ui/src/Card/Card.tsx`:

```tsx
import type { HTMLAttributes } from "react";
import styles from "./Card.module.css";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...rest }: CardProps) {
    return (
        <div className={[styles.card, className].filter(Boolean).join(" ")} {...rest} />
    );
}
```

`packages/ui/src/Card/Card.module.css`:

```css
.card {
    padding: var(--dya-space-6) var(--dya-space-5);
    background: var(--dya-surface-1);
    border: var(--dya-border-width) solid var(--dya-border-card);
    border-radius: var(--dya-radius);
}
```

`packages/ui/src/Surface/Surface.tsx`:

```tsx
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
```

`packages/ui/src/Surface/Surface.module.css`:

```css
.surface {
    padding: var(--dya-space-5);
    border-radius: var(--dya-radius);
}

.surface[data-level="1"] {
    background: var(--dya-surface-1);
}

.surface[data-level="2"] {
    background: var(--dya-surface-2);
}
```

Añadir a `packages/ui/src/index.ts`:

```ts
export { Card } from "./Card/Card";
export type { CardProps } from "./Card/Card";
export { Input } from "./Input/Input";
export type { InputProps } from "./Input/Input";
export { Surface } from "./Surface/Surface";
export type { SurfaceProps } from "./Surface/Surface";
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
pnpm test
```

Expected: 40 tests PASS.

- [ ] **Step 5: Añadir las secciones al catálogo**

Añadir a `App.tsx` tras la sección de Kbd:

```tsx
                <section className={styles.section}>
                    <h2 className={styles.eyebrow}>Input</h2>
                    <div className={styles.row}>
                        <Input placeholder="origin/main" />
                        <Input defaultValue="dyarchia" />
                        <Input placeholder="disabled" disabled />
                    </div>
                </section>

                <section className={styles.section}>
                    <h2 className={styles.eyebrow}>Surfaces</h2>
                    <div className={styles.row}>
                        <Card>Card on surface 1</Card>
                        <Surface level={1}>Surface 1</Surface>
                        <Surface level={2}>Surface 2</Surface>
                    </div>
                </section>
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): add Input, Card and Surface primitives"
```

---

### Task 11: Badge, Separator y Eyebrow

**Files:**
- Create: `packages/ui/src/Badge/{Badge.tsx,Badge.module.css}`, `packages/ui/src/Separator/{Separator.tsx,Separator.module.css}`, `packages/ui/src/Eyebrow/{Eyebrow.tsx,Eyebrow.module.css}`
- Modify: `packages/ui/src/index.ts`, `packages/ui/tests/components.test.tsx`, `apps/catalog/src/App.tsx`

**Interfaces:**
- Consumes: `--dya-accent`, `--dya-accent-soft`, `--dya-line`, `--dya-radius-full`.
- Produces: `Badge` con `tone?: "neutral" | "accent"`; `Separator` con `orientation?: "horizontal" | "vertical"` y `dashed?: boolean`, que renderiza `role="separator"` y `aria-orientation`; `Eyebrow` sobre `HTMLAttributes<HTMLParagraphElement>` con el punto de acento en `::before`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `packages/ui/tests/components.test.tsx`:

```tsx
import { Badge, Eyebrow, Separator } from "../src";

describe("Badge", () => {
    it("defaults to neutral", () => {
        render(<Badge>beta</Badge>);
        expect(screen.getByText("beta").dataset.tone).toBe("neutral");
    });

    it("accepts the accent tone", () => {
        render(<Badge tone="accent">new</Badge>);
        expect(screen.getByText("new").dataset.tone).toBe("accent");
    });
});

describe("Separator", () => {
    it("is a horizontal separator by default", () => {
        render(<Separator />);
        const separator = screen.getByRole("separator");
        expect(separator.getAttribute("aria-orientation")).toBe("horizontal");
    });

    it("accepts vertical orientation", () => {
        render(<Separator orientation="vertical" />);
        expect(screen.getByRole("separator").getAttribute("aria-orientation")).toBe(
            "vertical",
        );
    });

    it("exposes the dashed variant", () => {
        render(<Separator dashed />);
        expect(screen.getByRole("separator").dataset.dashed).toBe("true");
    });
});

describe("Eyebrow", () => {
    it("renders its label", () => {
        render(<Eyebrow>Pricing</Eyebrow>);
        expect(screen.getByText("Pricing")).toBeDefined();
    });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

```bash
pnpm test
```

Expected: FAIL, los tres componentes no están exportados.

- [ ] **Step 3: Implementar los tres componentes**

`packages/ui/src/Badge/Badge.tsx`:

```tsx
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
```

`packages/ui/src/Badge/Badge.module.css`:

```css
.badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--dya-space-2);
    border-radius: var(--dya-radius);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
    font-weight: 400;
    line-height: var(--dya-leading-tight);
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
}

.badge[data-tone="neutral"] {
    color: var(--dya-text-2);
    background: var(--dya-surface-2);
}

.badge[data-tone="accent"] {
    color: var(--dya-text);
    background: var(--dya-accent-soft);
}
```

`packages/ui/src/Separator/Separator.tsx`:

```tsx
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
```

`packages/ui/src/Separator/Separator.module.css`:

```css
.separator {
    border: 0 solid var(--dya-border);
}

.separator[aria-orientation="horizontal"] {
    width: 100%;
    border-top-width: var(--dya-border-width);
}

.separator[aria-orientation="vertical"] {
    align-self: stretch;
    border-left-width: var(--dya-border-width);
}

.separator[data-dashed="true"] {
    border-style: dashed;
}
```

`packages/ui/src/Eyebrow/Eyebrow.tsx`:

```tsx
import type { HTMLAttributes } from "react";
import styles from "./Eyebrow.module.css";

export type EyebrowProps = HTMLAttributes<HTMLParagraphElement>;

export function Eyebrow({ className, ...rest }: EyebrowProps) {
    return (
        <p className={[styles.eyebrow, className].filter(Boolean).join(" ")} {...rest} />
    );
}
```

`packages/ui/src/Eyebrow/Eyebrow.module.css`:

```css
.eyebrow {
    display: flex;
    align-items: center;
    gap: var(--dya-space-2);
    color: var(--dya-text-3);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label);
    font-weight: 400;
    line-height: var(--dya-leading-tight);
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
}

.eyebrow::before {
    content: "";
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: var(--dya-radius-full);
    background: var(--dya-accent);
}
```

Añadir a `packages/ui/src/index.ts`:

```ts
export { Badge } from "./Badge/Badge";
export type { BadgeProps, BadgeTone } from "./Badge/Badge";
export { Eyebrow } from "./Eyebrow/Eyebrow";
export type { EyebrowProps } from "./Eyebrow/Eyebrow";
export { Separator } from "./Separator/Separator";
export type { SeparatorOrientation, SeparatorProps } from "./Separator/Separator";
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

```bash
pnpm test
```

Expected: 46 tests PASS.

- [ ] **Step 5: Añadir la sección al catálogo y sustituir el eyebrow local**

En `App.tsx`, sustituir cada `<h2 className={styles.eyebrow}>` por `<Eyebrow>`, borrar las reglas `.eyebrow` y `.eyebrow::before` de `App.module.css`, y añadir:

```tsx
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
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ui): add Badge, Separator and Eyebrow primitives"
```

---

### Task 12: El mandato como lint mecánico

Convierte las reglas del spec §1 en tests que fallan si alguien las incumple. Es el cierre de la fase.

**Files:**
- Create: `packages/ui/tests/mandate.test.ts`

**Interfaces:**
- Consumes: los archivos `*.module.css` de `packages/ui/src` y `packages/tokens/src/tokens.css`.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Escribir el test**

`packages/ui/tests/mandate.test.ts`:

```ts
import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const UI_ROOT = fileURLToPath(new URL("../src", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

const MODULES = globSync("**/*.module.css", { cwd: UI_ROOT }).map((file) => ({
    file,
    source: readFileSync(`${UI_ROOT}/${file}`, "utf8"),
}));

function offenders(pattern: RegExp): string[] {
    return MODULES.filter((module) => pattern.test(module.source)).map(
        (module) => module.file,
    );
}

describe("the mandate", () => {
    it("finds the component css modules", () => {
        expect(MODULES.length).toBeGreaterThanOrEqual(8);
    });

    it("rule 3: no literal color lives outside tokens.css", () => {
        const sources = [
            ...globSync("packages/**/*.css", { cwd: REPO_ROOT }),
            ...globSync("apps/**/*.css", { cwd: REPO_ROOT }),
        ].filter(
            (file) => !file.includes("node_modules") && !file.endsWith("tokens.css"),
        );
        expect(sources.length).toBeGreaterThanOrEqual(9);
        const bad: string[] = [];
        for (const file of sources) {
            const source = readFileSync(`${REPO_ROOT}/${file}`, "utf8");
            for (const match of source.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
                bad.push(`${file}: ${match[0]}`);
            }
        }
        expect(bad).toEqual([]);
    });

    it("rule 5: no component declares a literal radius", () => {
        expect(offenders(/border-radius:\s*(?!var\(--dya-radius)/)).toEqual([]);
    });

    it("no literal colors in the components", () => {
        expect(offenders(/(?:color|background)[^:]*:\s*(?![^;]*var\(--dya-)[^;]*#/)).toEqual(
            [],
        );
    });

    it("rule 6: interface chrome uses mono in uppercase", () => {
        const EXEMPT = ["Input/Input.module.css"];
        const mono = MODULES.filter(
            (module) =>
                module.source.includes("var(--dya-font-mono)") &&
                !EXEMPT.includes(module.file.replaceAll("\\", "/")),
        );
        for (const module of mono) {
            expect(module.source, `${module.file} uses mono without uppercase`).toContain(
                "text-transform: uppercase",
            );
        }
        expect(mono.length).toBeGreaterThanOrEqual(4);
    });

    it("rule 7: no component exceeds weight 500", () => {
        const weights = MODULES.flatMap((module) =>
            [...module.source.matchAll(/font-weight:\s*(\d+)/g)].map((match) =>
                Number(match[1]),
            ),
        );
        expect(Math.max(0, ...weights)).toBeLessThanOrEqual(500);
    });

    it("rule 9: no component emits backdrop-filter", () => {
        expect(offenders(/backdrop-filter/)).toEqual([]);
    });

    it("rule 9: durations and curves go through tokens", () => {
        expect(offenders(/transition:[^;]*\b\d+m?s\b/)).toEqual([]);
    });

    it("box-shadow is never transitioned", () => {
        expect(offenders(/transition:[^;]*box-shadow/)).toEqual([]);
    });
});
```

- [ ] **Step 2: Ejecutar**

```bash
pnpm test
```

Expected: PASS si las Tasks 8 a 11 respetaron el mandato. Si algún test falla, **arreglar el componente, no el test** — salvo en el caso del hex literal `#0000` de `--dya-elev-key-pressed`, que vive en `tokens.css` y está excluido.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test(ui): enforce the design mandate mechanically"
```

---

### Task 13: Documentación de uso y cierre de fase

**Files:**
- Create: `README.md`
- Modify: `docs/specs/2026-08-19-dyarchia-ui-design.md` (§12, anotar las calibraciones resueltas)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada.

- [ ] **Step 1: Escribir el README**

`README.md`:

```markdown
# dyarchia-ui

Sistema de diseño compartido de los productos dyarchia. Dos temas, una forma y
una tipografía.

- Mandato y tokens: `docs/specs/2026-08-19-dyarchia-ui-design.md`
- Plan de la fase 1: `docs/plans/2026-08-19-dyarchia-ui-fase-1.md`

## Paquetes

- `@dyarchia/tokens` — CSS puro, sin JavaScript ni dependencias
- `@dyarchia/fonts` — `@font-face` de Geist Sans y Geist Mono
- `@dyarchia/ui` — primitivas React con CSS Modules

## Uso

```ts
import "@dyarchia/fonts";
import "@dyarchia/tokens";
import { Button, Kbd } from "@dyarchia/ui";
```

El tema se selecciona con un atributo en la raiz. El claro es el valor por
defecto.

```ts
document.documentElement.dataset.dyaTheme = "dark";
```

## Desarrollo

    pnpm install
    pnpm catalog     abre el catalogo visual en localhost:5180
    pnpm test        tokens, contraste WCAG, componentes y mandato
    pnpm typecheck
```

- [ ] **Step 2: Anotar las calibraciones resueltas en el spec**

En `docs/specs/2026-08-19-dyarchia-ui-design.md` §12, sustituir la viñeta **Relieve en claro** por los valores finales a los que se llegó en las Tasks 8 y 9, y la viñeta **Radio de la tecla** por la decisión tomada. Dejar las otras dos viñetas como están.

- [ ] **Step 3: Verificación final**

```bash
pnpm install && pnpm typecheck && pnpm test
```

Expected: typecheck sin errores, 54 tests PASS.

```bash
pnpm catalog
```

Expected: las seis secciones se ven correctamente en los dos temas. Comprobar con el conmutador que ningún componente pierde legibilidad al cambiar.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add README and record phase 1 calibrations"
```

---

## Cobertura del spec

```text
Seccion del spec                       Tareas
------------------------------------   ----------------------------
1  El mandato                          12
2  Forma                               2, 12
3  Tipografia                          2, 6, 12
4  Tema claro                          2, 4
5  Tema oscuro                         3, 4, 7
6  Acento                              2, 3, 4, 11, 12
7  Elevacion                           5, 8, 9
8  Movimiento                          5, 12
9  Rendimiento                         5, 6, 12
10 Arquitectura                        1, 2, 6, 7, 8
11 Catalogo y fases, fase 1            7, 8, 9, 10, 11
12 Calibraciones abiertas              8, 9, 13
```

Las secciones 10 y 11 quedan cubiertas solo en la parte que corresponde a la
fase 1. El tier de Base UI, los composites, la migracion de dyarchia-desktop y
la landing tienen sus propios planes.
