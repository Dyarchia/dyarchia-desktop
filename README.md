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
