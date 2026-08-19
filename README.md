# dyarchia-ui

CSS compartido de los productos dyarchia. Dos temas, una tipografía y una
gramática de relieve. Sin dependencias, sin build, sin JavaScript.

## Qué hay

```text
css/dyarchia.css     unico punto de entrada, importa los cuatro de abajo
css/fonts.css        los dos @font-face de Geist
css/tokens.css       los dos temas: 85 custom properties
css/reset.css        normalizacion, foco, scrollbars, movimiento reducido
css/motion.css       cuatro keyframes
fonts/               Geist Sans y Geist Mono variables, 140 KB los dos
demo/relieve.html    referencia visual, abrir en el navegador
docs/specs/          el mandato: por que cada valor es el que es
```

## Uso

Copiar `css/` y `fonts/` al proyecto y enlazar una hoja:

```html
<link rel="stylesheet" href="css/dyarchia.css">
```

El tema claro es el de por defecto. El oscuro se activa con un atributo en la
raíz:

```js
document.documentElement.dataset.dyaTheme = "dark";
```

La elección es del producto, no del sistema operativo: el CSS no consulta
`prefers-color-scheme`.

## Los tokens que más se usan

```text
Superficie      --dya-bg  --dya-surface-1  --dya-surface-2  --dya-surface-inverse
Texto           --dya-text  --dya-text-2  --dya-text-3  --dya-text-4
Relieve         --dya-elev-raised  --dya-elev-raised-hover
                --dya-elev-pressed  --dya-elev-overlay  --dya-elev-flat
Acento          --dya-accent  --dya-accent-soft
Forma           --dya-radius  --dya-radius-media  --dya-radius-full
Tipografia      --dya-font-sans  --dya-font-mono  --dya-size-*  --dya-tracking-*
Espaciado       --dya-space-1 .. --dya-space-24
Movimiento      --dya-dur-*  --dya-ease-*
```

Un botón mínimo con todo el sistema puesto:

```css
.boton {
    height: 32px;
    padding: 0 14px;
    border: none;
    border-radius: var(--dya-radius);
    color: var(--dya-text);
    background: var(--dya-surface-1);
    box-shadow: var(--dya-elev-raised);
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-label-sm);
    letter-spacing: var(--dya-tracking-mono);
    text-transform: uppercase;
    transition: transform var(--dya-dur-press) var(--dya-ease-press);
}

.boton:hover  { box-shadow: var(--dya-elev-raised-hover); }
.boton:active { box-shadow: var(--dya-elev-pressed); transform: translateY(1px); }
```

## Las cuatro reglas que hay que respetar

- **Sobresale lo que se puede pulsar.** Se hunde solo lo que recibe entrada: los
  campos de texto y cualquier control mientras está pulsado. Superficies y filas
  son planas y expresan su estado con fondo.
- **Un contenedor que agrupa controles no lleva relieve propio.** Si lo lleva,
  los controles de dentro se leen hundidos en un hueco.
- **Nunca poner `box-shadow` en una `transition`.** Congela la sombra frente al
  cambio de tema: el navegador deja de reevaluar el `var()` y el relieve conserva
  los parámetros del tema anterior. Se anima `transform`, `opacity` y
  `background-color`.
- **El naranja aparece con cuentagotas.** Nunca como fondo de botón ni como texto
  sobre un fondo: a 3.05:1 vale como objeto gráfico pero no como texto.

El razonamiento completo, con los contrastes medidos y la procedencia de cada
valor, está en `docs/specs/2026-08-19-dyarchia-ui-design.md`.

## Procedencia

El tema claro viene de la extracción de factory.ai; el oscuro, de la de
raycast.com. El relieve y el acento son de dyarchia y se aplican a los dos.
