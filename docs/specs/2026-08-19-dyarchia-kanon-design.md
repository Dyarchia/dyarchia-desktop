# dyarchia-kanon — mandato del sistema visual

Reglas vinculantes del sistema de diseño de los productos dyarchia. Dos temas,
una sola forma y una sola tipografía.

Fecha: 2026-08-19
Consumidores: dyarchia-desktop (Electron + React 19 + Vite), web (Next.js)

## Índice

- [1. El mandato](#1-el-mandato)
- [2. Forma](#2-forma)
- [3. Tipografía](#3-tipografía)
- [4. Tema claro](#4-tema-claro)
- [5. Tema oscuro](#5-tema-oscuro)
- [6. Acento](#6-acento)
- [7. Elevación](#7-elevación)
- [8. Movimiento](#8-movimiento)
- [9. Rendimiento](#9-rendimiento)
- [10. Consumo](#10-consumo)
- [11. Calibraciones abiertas](#11-calibraciones-abiertas)
- [12. Amendments](#12-amendments)


## 1. El mandato

1. **Si no se puede pulsar, es plano.** El relieve queda para botones, controles
   y teclas. Filas, celdas y contenedores no llevan sombra.
2. **El estado se mueve en el anillo, no en el fondo.** El relleno cambia solo
   en el cambio de estado más fuerte. El texto casi nunca cambia de color.
3. **Un solo naranja: `#ee6018`.** Sin rampa, sin aclarados, sin oscurecidos.
4. **El naranja nunca es fondo de botón ni texto sobre fondo.** Es punto de
   acento, indicador de activo y selección. Nada más.
5. **Todo es rectangular.** 3px en controles y superficies, 4px en media, círculo
   solo en el punto de acento y el avatar. No hay más radios.
6. **Una sola tipografía en dos familias.** Geist para contenido, Geist Mono en
   mayúsculas para todo lo que sea botón, label, eyebrow, índice o metadato.
7. **La jerarquía se construye con tamaño y tracking, no con peso.** Pesos en uso:
   400 y 500. El 600 solo en display.
8. **Ningún fondo es blanco ni negro puro.** Aplanan la escala.
9. **Nada que cueste frames.** Ver sección 9. El presupuesto de rendimiento tiene
   precedencia sobre cualquier consideración estética.

Procedencia: el tema claro procede de la extracción de factory.ai; el oscuro, de
la de raycast.com. El relieve y el acento son de dyarchia y se aplican a ambos.
Factory no tiene ni una sombra: el relieve en claro es una adición declarada, no
un valor heredado.


## 2. Forma

```text
Token                Valor    Uso
------------------   ------   -----------------------------------
--dya-radius          3px     botones, inputs, cards, superficies
--dya-radius-media    4px     imagen, video, bloques de media
--dya-radius-full    999px    punto de acento, avatar
--dya-border-width    1px     todos los bordes, sin excepcion
```

No existen radios intermedios. Si algo pide 8px, la respuesta es 3px.

Espaciado, base 4:

```text
--dya-space-1     4px      --dya-space-6     32px
--dya-space-2     8px      --dya-space-8     48px
--dya-space-3    12px      --dya-space-12    64px
--dya-space-4    16px      --dya-space-16    96px
--dya-space-5    24px      --dya-space-24   160px
```

Layout: contenedor máximo 1440px, gutter lateral 36px, header fijo de 72px.
Las secciones se separan con 96–160px y una línea de 1px.


## 3. Tipografía

Común a los dos temas. Geist Sans y Geist Mono, variables, un woff2 por familia.

```text
Rol            Familia   Tamano       Peso   Line-height   Tracking    Caja
------------   -------   ----------   ----   -----------   ---------   ---------
display        sans      64           500           100%   -0.04em     MAYUSCULAS
heading-1      sans      48           400           100%   -0.035em    normal
heading-2      sans      36 (24 mov)  400           110%   -0.031em    normal
heading-3      sans      24           400           110%   -0.02em     normal
paragraph      sans      18 (16 mov)  400           120%   normal      normal
paragraph-mono mono      16           400           120%   -0.02em     normal
label          sans      14           400           100%   normal      normal
label-sm       sans      12           400           100%   normal      normal
label-mono     mono      14           400           100%   -0.02em     MAYUSCULAS
label-sm-mono  mono      12           400           100%   -0.02em     MAYUSCULAS
eyebrow        mono      14           400           100%   -0.02em     MAYUSCULAS
```

Reglas:

- El display es el único elemento en mayúsculas del contenido. El resto de
  titulares van en caja normal.
- Los párrafos van a 120% de interlineado, no 150%. Es deliberadamente apretado.
- **Todo texto de interfaz va en Geist Mono, mayúsculas, tracking -0.02em**:
  botones, labels, eyebrows, índices, metadatos, atajos.
- La mono en caja normal a 16px se reserva para descripciones que deban leerse
  como dato técnico.
- Los tamaños escalan por breakpoint de 1024px, no con `clamp()`.

Carga: la web usa `geist/font/sans` y `geist/font/mono` de Next. Electron consume
`@dyarchia/fonts`, que declara los `@font-face` sobre los woff2 del paquete
`geist`.


## 4. Tema claro

Neutros cálidos con tinte marrón. Lienzo gris papel, negro para el texto.

```text
Token                 Valor      Uso
-------------------   --------   --------------------------------------
--dya-bg              #f5f5f5    lienzo de pagina
--dya-surface-1       #ffffff    card, superficie elevada
--dya-surface-2       #ebebeb    bloque agrupado, superficie secundaria
--dya-surface-inverse #101010    boton primario, bloque de media
--dya-text            #020202    texto principal          19.03:1
--dya-text-2          #3d3a39    secundario fuerte        10.34:1
--dya-text-3          #5c5855    parrafo apagado           6.46:1
--dya-text-4          #8a8380    terciario, placeholder    3.42:1  >=18px
--dya-border          #b8b3b0    borde por defecto
--dya-border-control  #a49d9a    borde de boton e input
--dya-border-card     #e0dedc    borde de card
--dya-line            #0000000f  linea de rejilla, 6% de alfa
--dya-faint           #201e1e3b  indices numericos, 23% de alfa
```

Contrastes medidos sobre `--dya-bg`. Sobre `--dya-surface-1` suben ligeramente.
`--dya-text-4` no se usa por debajo de 18px.

Rasgo característico a conservar: el separador interior de las cards es
`1px dashed`, no `solid`.


## 5. Tema oscuro

**Amended 2026-08-21 and 2026-08-22 — see section 12.** `--dya-text-3` is
`#8b8e93` and no longer carries a size restriction. `--dya-text-2` is `#b0b3b9`.
The four border and line tokens are opaque, not white alphas, and a fourth
surface `--dya-surface-3` has been added. The values in the table below, and the
list of recurring white alphas beneath it, are the ones this document was issued
with; alpha is now confined to hover and to `--dya-faint`.

Neutros fríos con sesgo azul. Estructura idéntica al claro; solo cambian los
valores.

```text
Token                 Valor      Uso
-------------------   --------   --------------------------------------
--dya-bg              #07080a    fondo de pagina
--dya-surface-1       #0e0f11    panel elevado
--dya-surface-2       #16171a    panel sobre panel
--dya-surface-inverse #e6e6e6    boton primario
--dya-text            #f4f4f6    texto principal          18.24:1
--dya-text-2          #a0a3a8    secundario                7.92:1
--dya-text-3          #6a6b6c    terciario                 3.75:1  >=18px
--dya-text-4          #4a4b4e    decorativo, nunca texto   2.30:1
--dya-border          #ffffff0f  borde por defecto
--dya-border-control  #ffffff26  borde de boton e input
--dya-border-card     #ffffff1a  borde de card
--dya-line            #ffffff0f  linea de rejilla
--dya-faint           #ffffff3b  indices numericos
```

Alfas de blanco recurrentes en oscuro: `0d` 5% hover de fila, `0f` 6% borde,
`1a` 10% separador, `26` 15% luz interior, `33` 20% panel flotante, `80` 50%
anillo de foco.

Selección de tema por atributo en la raíz. Sin `prefers-color-scheme` en el
paquete: la elección es del producto, no del sistema operativo.

```css
:root { /* tokens del tema claro */ }
:root[data-dya-theme="dark"] { /* solo los tokens de la seccion 5 */ }
```


## 6. Acento

**Amended 2026-08-21 — see section 12.** The system now also carries a status
scale. It is not accent, and it does not soften a single prohibition below.

Un único valor en los dos temas.

```text
Token               Valor       Rol
-----------------   ---------   ----------------------------------
--dya-accent        #ee6018     punto de acento, indicador activo,
                                subrayado de hover, ::selection
--dya-accent-soft   #ee601826   fondo de estado, el mismo al 15%
```

Dónde aparece, y en ningún otro sitio:

- el punto de 6px que precede a todo eyebrow de sección
- el indicador de lo activo: subrayado de tab, barra de fila seleccionada, punto
  de estado
- el subrayado animado de los enlaces de navegación al pasar por encima
- `::selection`
- detalles dentro de visualizaciones y bloques de media

Prohibiciones:

- **Nunca como fondo de botón.** El primario usa `--dya-surface-inverse`.
- **Nunca como texto sobre un fondo.** Sobre `#f5f5f5` da 3.05:1: vale como
  objeto gráfico (mínimo 3:1 de WCAG 1.4.11) pero no como texto.
- **Nunca aclarado ni oscurecido por estado.**

El anillo de foco no es de acento: es un anillo neutro de 2px, blanco al 50% en
oscuro y negro al 40% en claro. Debe funcionar encima de cualquier superficie,
incluida la del propio acento.


## 7. Elevación

Aportación de dyarchia. Ninguna de las dos extracciones la trae: Raycast tiene
sombras pero con su propia paleta, Factory no tiene ninguna.

**Los dos temas no comparten geometría.** Es el error que costó más iteraciones:
transferir la geometría del oscuro al claro produce un cerco gris difuso
alrededor de cada elemento, porque una sombra con `spread` que sobre fondo
oscuro se funde, sobre fondo claro se ve por los cuatro lados. Cada tema declara
sus recetas completas.

En claro el relieve es **filo más sombra escalonada**, sin luz interior: una
línea blanca en el borde superior produce una costura visible en cuanto el
elemento tiene relleno oscuro, como el botón primario.

En oscuro el relieve es **luz superior más canto negro**. El canto es negro, no
blanco: un anillo blanco sobre casi-negro dibuja un contorno gris en vez de
profundidad.

```css
:root {
    --dya-elev-flat: none;

    --dya-elev-raised:
        0 0 0 1px #0000001a,
        0 1px 2px #0000001f,
        0 4px 8px -2px #00000014;

    --dya-elev-raised-hover:
        0 0 0 1px #00000026,
        0 2px 4px #00000026,
        0 6px 12px -2px #0000001f;

    --dya-elev-pressed:
        inset 0 2px 4px #0000001f,
        0 0 0 1px #00000026;

    --dya-elev-overlay:
        0 0 0 1px #0000001a,
        0 2px 4px #0000001f,
        0 16px 32px -8px #00000029;
}

:root[data-dya-theme="dark"] {
    --dya-elev-raised:
        inset 0 1px 0 #ffffff26,
        0 0 0 1px #000000,
        0 2px 4px #00000099,
        0 8px 16px -4px #000000b3;

    --dya-elev-raised-hover:
        inset 0 1px 0 #ffffff40,
        0 0 0 1px #000000,
        0 3px 6px #000000b3,
        0 10px 20px -4px #000000cc;

    --dya-elev-pressed:
        inset 0 2px 4px #000000cc,
        0 0 0 1px #000000;

    --dya-elev-overlay:
        inset 0 1px 0 #ffffff26,
        0 0 0 1px #000000,
        0 24px 48px -12px #000000e6;
}
```

Reglas de uso:

- **Sobresale todo lo que se puede pulsar.** Botones, controles, items de barra.
  Un contenedor que agrupa controles no lleva relieve propio: si lo lleva, los
  controles de dentro se leen hundidos en un hueco.
- **Se hunde solo lo que recibe entrada**: los campos de texto, que son huecos
  donde se escribe, y cualquier control mientras está pulsado.
- **Superficies y filas son planas.** Su estado se expresa con fondo.
- Ninguna sombra usa `spread` positivo. La expansión negativa de la capa larga
  la mantiene recogida debajo del elemento.

## 8. Movimiento

```text
--dya-ease         ease-in-out                       hover y color
--dya-ease-out     cubic-bezier(.23, 1, .32, 1)      teclas, salidas
--dya-ease-press   cubic-bezier(.34, 1.56, .64, 1)   pulsacion con rebote
--dya-ease-enter   cubic-bezier(.215, .61, .355, 1)  entrada de contenido

--dya-dur-press   120ms      --dya-dur        220ms
--dya-dur-fast    160ms      --dya-dur-slow   320ms
```

- **`box-shadow` no se transiciona nunca.** Cambia de golpe. Listar `box-shadow`
  en `transition` congela la propiedad frente a los cambios de tema: el
  navegador deja de reevaluar el `var()` del que deriva y la sombra conserva los
  parámetros de relieve del tema anterior. Es además la propiedad más cara de
  animar, que §9 ya penaliza. Las transiciones se limitan a `transform`,
  `opacity` y `background-color`, que sí reevalúan sus tokens correctamente.

Medición que fija la regla, tomada en Chromium sobre el catálogo en tema oscuro,
con `--dya-relief-ring` resolviendo correctamente a `#ffffff26`:

```text
Elemento              transition                               Anillo resuelto
-------------------   --------------------------------------   -----------------------
toggle de cabecera    all                                      rgba(255,255,255,.15) ok
Button secundario     box-shadow, background-color, transform  rgba(0,0,0,.12) congelado
Kbd                   box-shadow, transform                    rgba(0,0,0,.12) congelado
Kbd, transition:none  none                                     rgba(255,255,255,.15) ok
```

El mismo elemento, con y sin transición, da resultados distintos: retirarla
corrige el valor al instante. `background-color` no se ve afectado aunque figure
en la misma lista, así que el problema es específico de `box-shadow`, cuya
interpolación depende de la estructura de la lista de sombras.
- Pulsar nunca cambia solo el color: siempre escala hacia dentro. Filas a
  `scale(.98)`, teclas a `translateY(2px)`.
- Menús y popovers se desplazan 2px, no más.
- El subrayado de navegación crece de izquierda a derecha en 200ms.
- Ninguna animación infinita en UI de producto.
- Bloque de movimiento reducido obligatorio en `reset.css`:

```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```


## 9. Rendimiento

Precedencia sobre cualquier consideración estética.

```text
Tecnica                     Decision
-------------------------   ----------------------------------------------
WebGL, shaders              FUERA
Campos de particulas        FUERA
backdrop-filter             OPT-IN. --dya-glass vale none por defecto; el
                            sistema base no emite ninguno. Si se activa:
                            maximo 2 en pantalla, en un ::before a
                            inset -1px con transform: translate(0,0), y
                            nunca sobre un elemento animado.
box-shadow animado          PROHIBIDO en lo que se repite (filas, celdas).
                            Permitido en botones y teclas sueltos.
transform y opacity         via preferente para todo estado animado
Base UI                     import por componente, nunca barrel
@dyarchia/tokens            cero JS, cero dependencias
```

Con `--dya-glass: none`, el sistema entero es CSS estático: coste de runtime cero.


## 10. Consumo

El sistema es CSS estático y dos fuentes. No hay build, no hay paquete, no hay
dependencias.

```text
css/dyarchia.css     importa los cuatro de abajo, es el unico punto de entrada
css/fonts.css        los dos @font-face
css/tokens.css       los dos temas
css/reset.css        normalizacion, foco, scrollbars, movimiento reducido
css/motion.css       cuatro keyframes
fonts/               los dos woff2 variables, 140 KB en total
```

Se copia la carpeta al proyecto y se enlaza una hoja:

```html
<link rel="stylesheet" href="css/dyarchia.css">
```

El tema claro es el de por defecto. El oscuro se activa con un atributo en la
raíz, y la elección es del producto, no del sistema operativo:

```js
document.documentElement.dataset.dyaTheme = "dark";
```

Los productos construyen sus propios componentes contra los tokens. El sistema
no impone framework: funciona igual en React, en LWC de Salesforce o en un HTML
suelto, porque no es más que custom properties.

`demo/relieve.html` renderiza controles, barra, lista y superficies en los dos
temas. Es la referencia visual y el sitio donde comprobar cualquier ajuste del
relieve.


## 11. Calibraciones abiertas

- **Temperatura de los neutros.** El claro es cálido (tinte marrón, de Factory) y
  el oscuro es frío (sesgo azul, de Raycast). Cada tema es coherente por dentro,
  pero cambiar de uno a otro se nota como un cambio de temperatura y no solo de
  luminosidad. Queda decidir si se unifica o si la divergencia es deliberada.
- **Conjuntos estilísticos de Geist.** Determinar empíricamente cuáles aportan.
  No se transfiere el `ss03` de la referencia, que es específico de Inter.
- **`--dya-text-3` en oscuro.** Cerrada el 2026-08-21, ver sección 12. En su
  lugar queda abierta la separación entre `--dya-text-2` y `--dya-text-3`.

## 12. Amendments

Entries are appended, never rewritten. The dated body above stands as it was
issued; each entry states what it changes and why.

### 2026-08-21 — status scale

Added to both themes: `--dya-danger`, `--dya-success`, `--dya-warning`, a
`-soft` companion for each at 15%, and `--dya-on-danger`.

Why. Section 6 gives the system one colour and forbids it as text, which leaves
a product with no way to state an outcome — a failed build, a positive delta, a
stale record. Every consumer was going to invent its own red, and one of them
already had: dyarchia-desktop shipped a local `--shell-danger` before this entry
existed. A red that differs per product is the exact failure this document was
written to prevent.

```text
Token             Light      Dark       Role
---------------   --------   --------   ------------------------------------
--dya-danger      #a8271c    #f0857c    error, negative delta, the hover of a
                                        destructive control
--dya-success     #1c6b39    #63cf95    confirmation, positive delta
--dya-warning     #7d5100    #d6a95c    caution that is not yet a failure
--dya-on-danger   #ffffff    #07080a    text or icon on a --dya-danger fill
```

Contrast against `--dya-surface-1`, the tighter surface in each theme:

```text
              light   dark
-----------   -----   -----
danger         7.07    7.63
success        6.54    9.94
warning        6.89    8.85
on-danger      7.07    7.97   measured against the fill, not the surface
```

The margin over the 4.5:1 line is deliberate and it is the same lesson as
section 3: these hues appear at label sizes, and a thin stem at 12px loses to
antialiasing what the number says it has. A value calibrated to land exactly on
4.5:1 reads thinner than it measures.

Rules:

- **Status is read, accent is not.** These three state an outcome and are
  legible as text. They never mark what is merely active or selected — that
  remains the orange's job and it does not change hands.
- **Only `--dya-danger` fills.** A destructive action earns a red button. A
  success or a caution does not earn a green or a yellow one, which is why
  `--dya-on-success` and `--dya-on-warning` do not exist.
- **Never the only signal.** Colour states the outcome; a word or an icon says
  what it is.
- **The dark yellow stays dark.** A canary yellow is illegible on the light
  canvas. In dark it becomes a muted amber rather than a bright one, for the
  same reason.
- **The fill inverts with the theme, like every other fill in the system.** In
  dark, `--dya-danger` as a background is light and `--dya-on-danger` is
  near-black — the behaviour of `--dya-surface-inverse` in section 4, not an
  exception to it.

What did not change. Section 6 stands in full: one orange, no ramp, never a
button fill, never text on a background. The focus ring is still neutral.

### 2026-08-21 — the third text level in dark

Changed: `--dya-text-3` in the dark theme, from `#6a6b6c` to `#8b8e93`. This
closes the third open calibration of section 11 and opens a narrower one in its
place.

Why. At `#6a6b6c` the token gave 3.75:1 against the background, so it was legal
only at 18px and above — and section 11 already warned that it was easy to apply
to a 12px label and drop below AA without noticing. That warning turned out to
be a description of what happens, not a risk: dyarchia-desktop is chrome at
12px from edge to edge, and the first pass through it put the token under AA in
tab titles, empty states and metadata rows. A level that cannot be used at the
size the product actually writes at is not a level.

```text
                 before     after
--------------   --------   --------
value            #6a6b6c    #8b8e93
on --dya-bg         3.75       6.09
on surface-1        3.59       5.83
compliant at     >= 18px    any size
```

The cost, stated plainly. The dark ramp is bounded: on a near-black canvas every
readable text colour lives between 4.5:1 and 18:1, and three levels have to fit
inside it. Raising the third level pushes it towards the second.

```text
separation between adjacent levels     before   after
------------------------------------   ------   ------
--dya-text vs --dya-text-2               2.30     2.30
--dya-text-2 vs --dya-text-3             2.11     1.30
--dya-text-3 vs --dya-text-4             1.63     2.65
```

At 1.30 the second and third levels are still two levels, but a reader has to
look for the difference. The trade was taken deliberately: a hierarchy that is
harder to perceive is a smaller failure than a label that cannot be read.

Now open in its place: whether `--dya-text-2` moves up to reopen that gap. It
would have to land near 9.5:1 to space the three levels evenly, which changes
the weight of secondary text in both products and is not a decision this entry
takes. `--dya-text-4` is unaffected and remains decorative — at 2.20:1 against
`--dya-surface-1` it is never text.

### 2026-08-22 — dark structure: opaque borders, a fourth surface, a wider text ramp

Changed in the dark theme only: the four border and line tokens, `--dya-text-2`, and a
new `--dya-surface-3` added to both themes. Nothing in the light theme's existing values
moves. This closes the calibration that the 2026-08-21 entry opened.

Why. Section 5 issued the dark border family as white alphas — `#ffffff0f`, `#ffffff1a`,
`#ffffff26` — because that is what the raycast.com extraction used. The alphas were
transferred but the canvas underneath them was not: raycast composites them over a
lighter ground, dyarchia composites them over `#07080a`. An alpha border is not a colour,
it is a percentage of whatever is behind it, and at 6% over near-black there is nothing
behind it to take a percentage of. The default border resolved to `#161718` and measured
1.12:1 against the canvas — not a faint line, no line.

This is the same class of error section 7 already documents for shadow geometry: a recipe
that is correct in the theme it was extracted from, moved to a theme whose ground differs,
producing a value that measures fine in the abstract and disappears in place. Section 7
caught it for shadows. It went uncaught for borders.

The consequence was structural, not cosmetic. Section 7 rules that containers and rows are
flat: no shadow, ever. In dark, therefore, the border is the *only* mechanism that
separates one panel from another, and dyarchia-desktop tiles the viewport with panels. A
grid of four panels read as one continuous field.

Confirmed against a third extraction, linear.app, taken 2026-08-22:

```text
                       canvas    panel     contrast
--------------------   -------   -------   --------
linear.app             #08090a   #0f1011     1.046
dyarchia (as issued)   #07080a   #0e0f11     1.045
```

The same pair of colours, to within a rounding error. Linear reads and dyarchia did not,
and the surfaces are not what separates them:

```text
                          value       resolved   vs canvas
-----------------------   ---------   --------   ---------
linear border-primary     #23252a     opaque        1.30
dyarchia --dya-border     #ffffff0f   #161718       1.12
```

Linear reserves alpha for hover — one translucent value that works over every level of its
ramp — and spends opaque values on structure. That is the correct division and it is the
one adopted here.

A second defect surfaced in the same reading. Linear's own notes state that the container
family and the separator family "are not interchangeable". In dyarchia `--dya-border` and
`--dya-line` were issued as the identical value, `#ffffff0f`: the perimeter of a panel
weighed exactly as much as a separator between two rows inside it. Two families collapsed
into one, which is why the panel grid read as a table.

```text
token                  before      after     vs bg   vs surface-1   role
--------------------   ---------   -------   -----   ------------   -------------------
--dya-line             #ffffff0f   #1a1b1e    1.16       1.11        separator, in-panel
--dya-border           #ffffff0f   #24262b    1.32       1.27        default structure
--dya-border-card      #ffffff1a   #2e3138    1.54       1.47        panel perimeter
--dya-border-control   #ffffff26   #3d4048    1.93       1.85        control edge
```

`--dya-bg`, `--dya-surface-1` and `--dya-surface-2` keep the values section 5 issued. The
canvas was never the problem and linear.app is the evidence that a 1.05:1 surface step is
survivable when the border does its job. `--dya-faint` stays alpha: it is decoration over
a known surface, not structure.

Three things follow at no cost. The black ring in `--dya-elev-raised` becomes correct
again — it was black on black, and now separates a raised control that carries its own
edge. `--dya-bg` stops doing double duty as both page canvas and sunken well, which is the
reading section 7 intended for inputs. And alpha is now confined to hover, where its one
useful property — a single value valid over every surface — is the reason to use it.

#### The fourth surface

Added to both themes: `--dya-surface-3`, the hover of a row that already sits on
`--dya-surface-2`. Light `#e1e1e1`, dark `#1c1d21`. Without it a selected row and a hovered
selected row were the same colour.

The step is calibrated to dyarchia's own ramp, not to Linear's. Linear spaces its four
levels at roughly 1.045 each; dyarchia's issued `surface-1` to `surface-2` step is 1.070,
and the new level continues at 1.064 rather than importing a foreign spacing into the
middle of an existing scale.

```text
bg -> surface-1   1.045      surface-1 -> surface-2   1.070
                             surface-2 -> surface-3   1.064
```

Note that `--dya-line` measures 1.02:1 against `--dya-surface-3`. A separator vanishing
under a hovered row is the intended reading, not a regression: the row is being addressed
as one object.

#### The third text level, closed

The 2026-08-21 entry raised `--dya-text-3` to clear AA at 12px and stated the cost: the
gap between the second and third levels fell to 1.30, "still two levels, but a reader has
to look for the difference". It left open whether `--dya-text-2` should move up to reopen
it, and named 9.5:1 as the figure that would space the ramp evenly.

Taken, at `#b0b3b9` — 9.54:1. `--dya-text`, `--dya-text-3` and `--dya-text-4` do not move.

```text
separation between adjacent levels     2026-08-19   2026-08-21   now
------------------------------------   ----------   ----------   ----
--dya-text vs --dya-text-2                   2.30         2.30    1.91
--dya-text-2 vs --dya-text-3                 2.11         1.30    1.56
--dya-text-3 vs --dya-text-4                 1.63         2.65    2.65
```

The result is close to the light theme's own spacing — 1.84 / 1.60 / 1.89 — which is the
argument for the value beyond the arithmetic. The two themes were never meant to differ in
hierarchy, only in luminance, and until now the dark ramp had a flat spot the light one
did not.

Secondary text is brighter than it was. That is the trade, it was named in advance, and it
is the smaller cost: a level a reader has to hunt for is not a level.

What did not change. Sections 6 and 7 stand in full, and the status scale of 2026-08-21 is
untouched — it clears 4.5:1 on all four surfaces, including the new one. Contrast measured
against `--dya-bg` unless stated; every text and status token was re-measured against all
four surfaces and none falls below AA. `--dya-text-4` remains decorative at 2.30:1 and is
never text.

Now open in its place: nothing from this entry. The temperature divergence of section 11
and the Geist stylistic sets remain the two open calibrations.

### 2026-08-22 — the product is renamed to dyarchia-kanon

Changed: the name of the repository and of the product, from `dyarchia-ui` to
`dyarchia-kanon`. The title of this document and the name of its file follow.
No token, no value and no rule moves.

This entry exists because section 12 forbids rewriting the issued body, and the
title on line 1 is part of it. Recording the change here is the only way to
alter it without breaking that rule.

What is *not* renamed. The entry point stays `css/dyarchia.css`: it never
carried the `-ui` suffix, and it names the family rather than the product. The
scoped package names that appear in sections 3 and 9 — `@dyarchia/fonts` and
`@dyarchia/tokens` — are left exactly as issued and are flagged rather than
edited, because section 10 already states that the system has no package at
all. Reconciling those three lines is a separate decision from a rename.

### 2026-08-22 — the reference render is removed

Changed: `demo/relieve.html` is deleted. The file is gone from disk and its entry
is dropped from `.gitignore`, which no longer needs to exclude a directory that
does not exist. No token, no value and no rule moves.

The closing paragraph of section 10 names the demo as "la referencia visual y el
sitio donde comprobar cualquier ajuste del relieve". That paragraph stands as
issued, as section 12 requires, and is superseded here: there is no such file and
no such site any more.

What this costs. Sections 7 and 8 are the parts of this document whose rules were
established by looking at rendered output rather than by reasoning — the divergent
shadow geometry of the two themes, and the frozen `box-shadow` measurement — and
both were checked on that page. The system keeps no render of its own now, so the
next relief adjustment has to be judged inside a consuming product or against a
surface built for the occasion. Whether the system should carry a reference render
again is left open, alongside the two calibrations already listed in section 11.

### 2026-08-22 — the dark surfaces carry the interface, the canvas frames it

The tone that covers most of the viewport is the tone that has to be comfortable
to look at for hours. Near-black is not that tone. It belongs to the minority of
the screen that frames the work, never to the mass of it.

Which token carries that mass depends on the product, not on the theme. In a
document surface the canvas dominates and the panels are chrome. In dyarchia-desktop
the opposite holds: panels tile the viewport, and what is looked at is the inside of
a panel. `--dya-surface-1` is therefore the dominant tone of the dark theme, and it
sits in the band where a dark interface is read without strain. `--dya-bg` is the
frame: it shows in the gaps and around the edges, and near-black is correct there
because it is a minority.

The band is not a matter of taste. GitHub ships a second dark theme, dark-dimmed at
`#22272e` and L\* 15.4, because its first one at `#0d1117` and L\* 5.0 is aggressive
over large areas. Any dark surface that carries a whole interface belongs above L\* 12.

```css
:root[data-dya-theme="dark"] {
    --dya-bg: #08090b;
    --dya-surface-1: #1f2126;
    --dya-surface-2: #272a30;
    --dya-surface-3: #2f323a;
}
```

```text
token              hex        L*     paso    papel
----------------   -------   ----   -----    ---------------------------------
--dya-bg           #08090b    2.4     -      marco: juntas, bordes de ventana
--dya-surface-1    #1f2126   12.7   1.237    la masa: interior de panel
--dya-surface-2    #272a30   17.0   1.120    fila, celda, control agrupado
--dya-surface-3    #2f323a   20.8   1.122    hover de fila sobre surface-2
```

El panel levanta 10.3 L\* sobre el lienzo, en una relación de 1.24. Es más de los
3.5 L\* que levanta el panel claro sobre su propio lienzo, y esa asimetría es
deliberada: una superficie tapizada de paneles apoya en esa relación mucho más peso
que una página, y el sistema la paga donde el producto la gasta.

La rampa de texto vive sobre esas superficies y sube con ellas. Un tema oscuro
atenuado comprime el rango útil por arriba; la rampa se recoloca dentro del rango
que queda, no se hereda del rango anterior.

```text
token           hex        bg      s-1      s-2      s-3     piso
-------------   -------   -----   -----   -----   -----   -----------------
--dya-text      #f4f4f6   18.13   14.66   13.09   11.67   AA
--dya-text-2    #c3c6cb   11.63    9.40    8.40    7.48   AA
--dya-text-3    #a0a3a8    7.87    6.37    5.68    5.07   AA
--dya-text-4    #75777d    4.45    3.60    3.21    2.86   solo decorativo
```

`--dya-text-4` mide 2.86 en su peor superficie y el claro mide 2.85 en la suya: los
dos temas sostienen la misma jerarquía y difieren solo en luminancia, que es lo que
la sección 1 exige. La separación entre `--dya-text-2` y `--dya-text-3` es 1.48
contra el 1.60 del claro. El suelo entero está más alto, así que la relación se
estrecha; forzarla a 1.60 acercaría `--dya-text-2` a `--dya-text` hasta confundirlos,
y de las dos distancias esa es la que no se puede perder.

Los bordes son opacos y se apoyan en el panel, no en el lienzo.

```text
--dya-line             #2b2e34    1.18 sobre surface-1
--dya-border           #383b43    1.44
--dya-border-card      #41454e    1.68
--dya-border-control   #52565f    2.19
```

La escala de status se lee sobre el panel y dentro de su propia pastilla. El tinte
de la pastilla es del 10%: por encima de esa proporción el fondo se acerca al color
del texto que lleva encima y la pastilla deja de sostener AA en la fila con hover.

```text
token             hex        como texto (min)   como pastilla (min)
---------------   -------   -----------------   -------------------
--dya-success     #63cf95         6.65                 5.43
--dya-warning     #d6a95c         5.91                 4.91
--dya-danger      #f59790         5.93                 4.94
```

`--dya-on-danger` y `--dya-on-inverse` valen `#08090b`: son el lienzo puesto encima
de un relleno claro, y siguen al lienzo siempre.

El acento no se mueve. `#ee6018` mide 3.86 sobre `--dya-surface-3`, su peor caso, y
la regla 4 del mandato lo mantiene fuera del texto, así que el listón que le aplica
es el de objeto gráfico y lo cumple en las cuatro superficies.

Las recetas de relieve no cambian, y el cambio de superficie las favorece: el canto
negro de `--dya-elev-raised` mide 1.30 contra el panel, frente al 1.10 que mediría
contra una superficie casi negra. Una sombra necesita algo de lo que separarse.

El tema claro no se toca. La calibración del lienzo oscuro contra linear.app se
mantiene: `--dya-bg` sigue en casi-negro. Lo que se aparta de esa referencia es el
panel, porque Linear llena su viewport de contenido denso y dyarchia lo llena de
paneles, y la misma pareja de valores no resuelve los dos repartos.

En claro el tinte de la pastilla corre al 15%, no al 10%, porque sus superficies
son otras y la proporción no se comparte. Con ese 15% la pastilla clara mide 4.07
en `--dya-success`, 4.27 en `--dya-danger` y 4.28 en `--dya-warning` contra
`--dya-surface-3`, por debajo de AA. El hue como texto sobre superficie cumple en
todas; es la pastilla la que cierra la distancia. Queda abierto si el claro baja al
10%, que sube el peor caso a 4.37 y deja `--dya-success` corto igualmente, o si lo
que se mueve son los hues de la pastilla.

Sigue abierta la calibración de temperatura de la sección 11: el claro es cálido y
el oscuro frío, y esta entrada no la resuelve.

### 2026-08-22 — la pastilla fija el suelo de la escala de status

El listón de un color de status no lo pone el color sobre la superficie: lo pone
el color sobre su propia pastilla. Un tinte arrastra la superficie hacia el color
del texto que lleva encima, así que la pastilla es siempre el caso más apretado de
los dos, y es el que manda.

De ahí que el tinte corra al 10% en los dos temas. Diez no es una preferencia, es
el techo: por encima de esa proporción la pastilla deja de sostener AA en una fila
con hover, que es la superficie más alta sobre la que puede aparecer.

```css
:root {
    --dya-danger: #9a2419;
    --dya-danger-soft: #9a24191a;
    --dya-success: #186034;
    --dya-success-soft: #1860341a;
    --dya-warning: #714900;
    --dya-warning-soft: #7149001a;
}
```

```text
                     como texto (min)      como pastilla (min)
                     -----------------     -------------------
claro   success            5.82                   5.04
        warning            6.05                   5.25
        danger             6.08                   5.19
oscuro  success            6.65                   5.43
        warning            5.91                   4.91
        danger             5.93                   4.94
```

Los dos temas sostienen el mismo suelo: 5.04 contra 4.91 en pastilla, 5.82 contra
5.91 como texto. Ninguna combinación de hue, pastilla y superficie cae por debajo
de AA en ninguno de los dos.

`--dya-on-danger` sigue en `#ffffff` sobre el relleno claro y mide 7.95. La regla
de que solo `--dya-danger` puede rellenar no se toca, ni la de que el color nunca
es la única señal.

Esto cierra la cuestión que la entrada anterior de esta misma fecha dejó abierta
sobre la pastilla clara.

### 2026-09-05 — la piel vitral: tema único, IBM Plex y capa de componentes

El sistema tiene un solo tema y es oscuro. El lienzo es negro puro, el chasis es
una placa con borde visible y dentro del chasis la jerarquía la hace el peso de la
línea, no el relleno ni la sombra. Hay materia solo en el marco.

Esta entrada gobierna las secciones 2 a 11. Lo que sigue enuncia el estado; el
cuerpo emitido queda como está, según manda la cabecera de esta sección.

#### Forma

Cinco radios, no tres.

```text
Token                  Valor    Uso
--------------------   ------   --------------------------------------------
--dya-radius-sm          3px    control por debajo de 16px: checkbox, radio,
                                puño de toggle, pulgar de slider
--dya-radius             6px    botones, chips, campos, cards, superficies
--dya-radius-media       6px    imagen, video, bloques de media
--dya-radius-chassis     9px    el panel, y nada más
--dya-radius-tag        14px    la etiqueta, y nada más
--dya-radius-full      999px    punto de acento, radio, avatar
```

La regla 5 de la sección 1 pedía tres radios y respondía 3px a cualquier petición
de 8px. El control pasa a 6px, el chasis a 9px y la etiqueta a 14px. `--dya-radius-sm`
existe porque un cuadro de 14px a 6px deja de leerse como cuadro.

#### Tipografía

IBM Plex Sans Condensed para contenido, IBM Plex Mono para interfaz. La condensada
mete más label en la misma columna y la mono tiene aire de instrumento.

Ninguna de las dos familias existe como fuente variable, así que el sistema carga
seis estáticas — pesos 300, 400 y 500 de cada familia — por 336 KB, contra los
140 KB de dos variables. La sección 9 da precedencia al rendimiento sobre la
estética, y este es el único punto donde esta piel gasta ese margen. Lo gasta una
vez, en el arranque, y no cuesta un frame.

Pesos en uso: 300, 400 y 500. El 300 va en display y en cifra de dato; el 600
desaparece del sistema.

El tracking de la mono es positivo y escala con el papel del texto, no con su
tamaño:

```text
Token                    Valor      Uso
----------------------   --------   ---------------------------------------
--dya-tracking-mono       0.02em    valores, rutas, cifras, identificadores
--dya-tracking-data       0.14em    labels de dato en tabla y en ficha
--dya-tracking-label      0.2em     labels de sección, botones, chips, tabs
--dya-tracking-brand      0.26em    el badge de marca, y nada más
```

Los párrafos corren a 145% y a 165%. La sección 3 los fija en 120% y lo llama
deliberadamente apretado; a 13,5px de condensada, apretado es ilegible.

Sin `clamp()` y sin breakpoint: la escala es una sola.

#### Superficies

Nueve tonos, del lienzo a la fila seleccionada.

```text
Token             Valor      Uso
---------------   --------   -----------------------------------------------
--dya-bg          #000000    lienzo
--dya-sunken      #08090b    campo de texto, pista de slider
--dya-chassis     #0a0b0f    la placa del panel
--dya-surface-1   #0d0f15    card, superficie interior
--dya-surface-2   #12141b    fila en hover, fila en edición
--dya-flat-hover  #161922    hover de control plano
--dya-raised      #1b1e29    botón en reposo
--dya-overlay     #1f2126    menú, tooltip
--dya-selected    #2b3140    fila seleccionada, item de menú activo
```

La regla 8 de la sección 1 prohíbe el negro puro por aplanar la escala. Aquí el
lienzo es `#000000` y no aplana nada, porque no es superficie de trabajo: es el
vacío contra el que se recorta el chasis. Ninguna de las ocho superficies que sí
reciben contenido es negra.

Tres gradientes estáticos, sin coste de runtime: `--dya-grad-bar`, `--dya-grad-dock`
y `--dya-grad-header`.

La rampa de texto y la de líneas:

```text
--dya-text        #e3e3e4      --dya-border         #262a36
--dya-text-2      #c3c6cb      --dya-border-strong  #33384a
--dya-text-3      #9d9ea4      --dya-hairline       #1b1e29
--dya-text-4      #83858d      --dya-rule           #14171f
                               --dya-dashed         #232734
```

#### Dónde puede apoyarse cada nivel de texto

`--dya-text-4` es el nivel de los labels y el color más repetido de la piel.
Sostiene AA sobre todas las superficies salvo tres, y de esas tres queda excluido:

```text
Superficie          text   text-2   text-3   text-4
-----------------   ----   ------   ------   -----------
bg                  16.37   12.26     7.86    5.70
sunken              15.53   11.63     7.46    5.41
chassis             15.34   11.48     7.36    5.34
surface-1           14.94   11.18     7.17    5.20
surface-2           14.34   10.74     6.89    5.00
flat-hover          13.69   10.25     6.57    4.77
raised              12.95    9.70     6.22    4.51
overlay             12.56    9.40     6.03    4.38  vetada
raised-hover        11.81    8.84     5.67    4.12  vetada
selected            10.13    7.59     4.86    3.53  vetada
```

Un label no se apoya en `--dya-overlay`, en `--dya-raised-hover` ni en
`--dya-selected`. En esas tres el nivel de label es `--dya-text-3`, que mide 6.03,
5.67 y 4.86. Es el mismo patrón que ya gobierna la pastilla de status: el listón lo
pone la superficie más alta sobre la que el token puede aparecer, no el lienzo.

#### Relieve

Un solo tema, una sola geometría: luz superior de 1px y canto negro. Ninguna sombra
usa `spread` positivo.

```css
:root {
    --dya-elev-flat: none;

    --dya-elev-chassis: inset 0 1px 0 #ffffff0a;

    --dya-elev-raised:
        inset 0 1px 0 #ffffff14,
        0 0 0 1px #000000,
        0 1px 2px #00000099;

    --dya-elev-pressed:
        inset 0 2px 4px #000000cc,
        0 0 0 1px #000000;

    --dya-elev-sunken:
        inset 0 2px 4px #000000cc,
        0 0 0 1px #000000;

    --dya-elev-focus:
        inset 0 2px 4px #000000cc,
        0 0 0 1px #ee6018;

    --dya-elev-popover:
        inset 0 1px 0 #ffffff26,
        0 0 0 1px #000000,
        0 2px 4px #00000099;

    --dya-elev-overlay:
        inset 0 1px 0 #ffffff26,
        0 0 0 1px #000000,
        0 24px 48px -12px #000000e6;
}
```

`--dya-elev-raised-hover` no existe. El hover de un elemento con relieve cambia
`background-color`, de `--dya-raised` a `--dya-raised-hover`, y deja la sombra
quieta. Esto no es una simplificación: es la regla de la sección 8 llevada a su
conclusión. Si la sombra no se transiciona nunca, un par de recetas que solo se
distinguen en hover obliga a un salto que el ojo lee como parpadeo, y el color de
fondo hace el mismo trabajo por una propiedad que sí se puede animar.

La sección 7 mantiene su reparto: sobresale lo que se pulsa, se hunde lo que recibe
entrada, y las superficies y filas son planas. El chasis lleva `--dya-elev-chassis`,
que es una luz de 1px al 4% y no relieve; un contenedor que agrupa controles sigue
sin poder sobresalir.

#### Pulsación

La sección 8 describe la pulsación en prosa. Aquí son tokens.

```text
--dya-press-y        1px    botones y chips
--dya-press-y-key    2px    teclas y items de dock
--dya-press-scale    0.98   filas, items de lista y de menú
```

Siempre con `--dya-ease-press` y `--dya-dur-press`. Ninguna animación infinita, y
el estado de carga es estático: un bloque `--dya-surface-2` sin brillo que recorra.

#### Foco

El anillo de foco es `#ee6018` a 1px. El anillo neutro de 2px de la sección 6 se
comía el borde capilar sobre el que se apoya toda esta piel, y un anillo que tapa
la estructura que señala no señala nada.

Esto es coherente con la sección 6 y no la amplía: el foco es una forma de
selección, y la selección ya era trabajo del naranja.

#### Acento

Un solo naranja, `#ee6018`, y sus dos tintes.

```text
--dya-accent        #ee6018
--dya-accent-soft   #ee60181f   12%, fondo de lo activo
--dya-accent-faint  #ee60180f    6%, relleno de dato
--dya-on-accent     #08090b     tinta sobre el relleno, 6.00
```

Sigue sin ser fondo de botón. La prohibición de la regla 4 sobre el naranja como
texto se acota, no se levanta: el naranja es texto **solo sobre su propio tinte**,
que es donde aparece el chip activo y la tab activa, y ahí mide entre 4.75 y 5.30.
Sobre cualquier superficie del sistema sigue siendo objeto gráfico y nada más, con
3.91 en el peor caso, que es la fila seleccionada.

Sobre el lienzo negro el naranja mide 6.32. El número que justificaba la
prohibición era 3.05 sobre el gris papel del tema claro, y ese lienzo ya no existe.
La prohibición se conserva igualmente: un color que solo es legible en la mitad de
las superficies del sistema no es un color de texto, y la escala de status ya cubre
ese trabajo.

#### Status

Los tres estados rellenan, con tinta `--dya-on-status: #08090b`.

```text
             hue        relleno   como texto sobre surface-1
----------   --------   -------   --------------------------
success      #63cf95     10.33               9.93
warning      #d6a95c      9.19               8.84
danger       #f59790      9.21               8.86
idle         #2b3140      7.59                  —
```

La sección 7 reservaba el relleno a `--dya-danger`. Con un solo tema y una tinta
oscura común, los tres se sostienen por encima de 9:1, que es el doble del listón.
La regla que no se toca es la otra: el color nunca es la única señal.

`--dya-on-danger` se renombra a `--dya-on-status` porque ahora sirve a los tres.
Cada hue conserva su `-soft` al 10% para el tinte de fila y de pastilla.

#### La etiqueta

`.dya-tag` es la única forma redonda y translúcida del sistema: radio 14px, fondo
blanco al 7%, borde blanco al 17%, texto `--dya-text-2`. Mide entre 6.33 y 11.11
según la superficie que tenga debajo.

#### El sistema pasa a declarar componentes

`css/components.css` entra en el punto de entrada, el último de los cinco. Declara
las clases `dya-*` que los productos consumen sin redefinirlas.

```text
Estructura   panel, bar, dock, card, card__header, card__body, rule, brand
Pulsable     button (quiet, sm, danger), key, chip, item
Entrada      field, toggle, checkbox, radio, slider
Contenido    tag, badge (success, warning, danger, soft), table, row, metric,
             display, heading, text, label, eyebrow, value, mono, caret
Capas        menu, menu__item, tooltip
Navegación   tabs, tab, pagination
Vacíos       empty, loading, skeleton
```

El último párrafo de la sección 10 dice que los productos construyen sus propios
componentes contra los tokens y que el sistema no impone framework. La segunda
mitad sigue en pie: esto es CSS sin JavaScript, sin build y sin dependencias, y
funciona igual en React, en LWC o en un HTML suelto. La primera se sustituye. Un
token no impide que dos productos dibujen el mismo botón distinto, y el kanon
existe para que no lo hagan.

Nada de lo que declara `components.css` es un valor nuevo: cada regla resuelve a un
token de `tokens.css`, y el fichero no contiene ni un color, ni un radio, ni una
duración literales.

Diez de esas clases — toggle, checkbox, radio, slider, tabs de contenido,
pagination, empty, loading y skeleton entre ellas — no aparecen en la piel de la
que procede esta entrada y están derivadas de las reglas de este documento, no
observadas. Son las primeras candidatas a revisión cuando exista una superficie que
las pida de verdad.

#### Qué cierra y qué queda

La calibración de temperatura de la sección 11 queda cerrada por desaparición: no
hay dos temas entre los que notar un cambio de temperatura. La calibración de los
conjuntos estilísticos de Geist queda anulada por el cambio de familia; los de IBM
Plex no se han determinado y ocupan su lugar.

Queda abierto qué hacen los productos que hoy arrancan en claro. El sistema ya no
tiene tema claro y `data-dya-theme` deja de existir: la raíz no lleva atributo y no
hay nada que conmutar.

Lo que esta piel no cubre y sigue sin cubrir: gráficas, medidores, radar y el resto
del instrumental de dato del panel del que procede. Son composiciones, no
componentes, y se construyen en el producto contra estos tokens.

### 2026-09-05 — el dato conserva su caja

La interfaz va en mayúsculas; el dato no. Un label de control es un label y se
transforma. Un nombre de fichero, una ruta o una línea de log son dato: conservan
su caja, en mono y a `--dya-tracking-mono`.

`README.md` y `readme.md` son ficheros distintos, y `IBMPlexMono-Light.woff2` en
mayúsculas no se lee. La regla 6 de la sección 1 manda mayúsculas en todo lo que
sea botón, label, eyebrow, índice o metadato, y esa lista no incluye el dato. Esta
entrada lo hace explícito y le da clase.

#### `.dya-entry`

Cuatro selectores. Es la única fila de lista del sistema que no transforma la
caja, y esa diferencia es toda su razón de existir.

```css
.dya-entry {
    display: block;
    width: 100%;
    padding: 3px var(--dya-space-3);
    border: none;
    background: transparent;
    font-family: var(--dya-font-mono);
    font-size: var(--dya-size-mono-xs);
    letter-spacing: var(--dya-tracking-mono);
    color: var(--dya-text-3);
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition:
        transform var(--dya-dur-press) var(--dya-ease-press),
        background-color var(--dya-dur-fast) var(--dya-ease);
}

.dya-entry:hover {
    background-color: var(--dya-flat-hover);
    color: var(--dya-text);
}

.dya-entry:active {
    transform: scale(var(--dya-press-scale));
}

.dya-entry--strong {
    color: var(--dya-text-2);
}

.dya-entry--active {
    background-color: var(--dya-selected);
    box-shadow: inset 2px 0 0 var(--dya-accent);
    color: var(--dya-text);
}
```

`--strong` es la entrada que lleva a otro sitio en vez de abrir algo: el
directorio, el padre. `--active` es la selección.

Es plana, como corresponde a una fila: sin relieve, y el estado en el fondo. El
hover cambia `background-color` y nada más. La barra de selección es
`inset 2px 0 0 var(--dya-accent)`, el mismo trazo que ya dibuja
`.dya-row--selected > td:first-child`, de modo que una fila de árbol y una fila de
tabla marcan la selección igual. `--dya-text-4` no aparece, así que la regla sobre
dónde puede apoyarse un label no la alcanza.

Pulsar escala hacia dentro, como manda la sección 8: pulsar nunca cambia solo el
color.

```text
Estado       Tinta      Fondo         Ratio
----------   --------   -----------   -----
reposo       text-3     surface-1      7.17
reposo       text-3     chassis        7.36
--strong     text-2     surface-1     11.18
hover        text       flat-hover    13.69
--active     text       selected      10.13
barra        accent     selected       3.91
```

Todo estado de texto pasa AA con margen a 11px. La barra es objeto gráfico y pasa
el listón de 3.0.

#### `.dya-bar--flush`

`padding-right: 0` sobre la barra. Una ventana sin marco del sistema operativo
tiene su grupo de botones de ventana pegado al borde, porque detrás no hay canalón
que lo separe.

La regla que obliga a que esto sea un modificador y no un `padding-right` en el
producto es la de la sección 10 según la enmienda del 2026-09-05: los componentes
se referencian, no se redefinen. Un producto que ajusta `.dya-bar` ha bifurcado el
sistema. Un modificador de una línea lo devuelve al vocabulario del sistema y deja
la excepción contada donde se puede leer.

#### Las transiciones nombran tres propiedades y solo tres

La sección 8 limita las transiciones a `transform`, `opacity` y
`background-color`. `.dya-tab` transicionaba `color` y `.dya-checkbox` con
`.dya-radio` transicionaban `border-color`. Ya no.

El hover de una tab y el de una entrada saltan de color en vez de fundirlo, y las
dos se comportan igual. La lista de la sección 8 es cerrada, no una preferencia
sobre lo caro: una hoja donde la mitad de los hovers funden el color y la otra
mitad lo saltan no tiene una regla, tiene dos costumbres.

#### Lo que no se toca

`.dya-item` sigue en mayúsculas. Para un label de control las mayúsculas son el
comportamiento correcto, y esta entrada añade una clase en vez de corregir la que
había. `.dya-menu__item` y la cabecera de `.dya-table` tampoco cambian. El cuerpo
de `.dya-table` nunca transformó la caja, así que una tabla de ficheros ya era
posible; lo que faltaba era la fila suelta, fuera de tabla.

#### Queda abierto

La escala de prosa tiene un solo escalón. `.dya-heading` a `--dya-size-h2` es el
único titular, y entre `--dya-size-metric` y `--dya-size-body` no hay nada. Un
producto que renderiza documentos arbitrarios tiene tres niveles de titular y un
tamaño que gastar en ellos. La salida que cabe dentro de la gramática es bajar los
dos inferiores al idioma del label mono — mayúsculas, `--dya-tracking-label` y
luego `--dya-tracking-data` — porque en un panel de documentación un `h2` es una
etiqueta de sección. Si el sistema debe llevar una escala de prosa de verdad queda
sin decidir, junto a las calibraciones de la sección 11.
