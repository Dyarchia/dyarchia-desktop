# dyarchia-ui — mandato del sistema visual

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
- [10. Arquitectura](#10-arquitectura)
- [11. Catálogo y fases](#11-catálogo-y-fases)
- [12. Calibraciones abiertas](#12-calibraciones-abiertas)


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

**Principio: nunca una sombra difusa sola.** Todo elemento elevado combina luz
interior arriba, anillo fino de contorno y sombra difusa abajo.

### 7.1 Los cuatro peldaños

```text
--dya-elev-flat      por defecto: paneles, filas, celdas, contenedores
--dya-elev-raised    lo que se puede pulsar: boton, control
--dya-elev-key       la tecla fisica: kbd, atajos
--dya-elev-overlay   lo que flota: modal, popover, dropdown, palette
```

### 7.2 Parámetros

La receta es la misma en ambos temas. Solo cambian estos cuatro valores, y en
claro **invierten**: la luz sube y el anillo pasa de alfa blanca a alfa negra.

```text
Parametro                 Oscuro      Claro       Papel
-----------------------   ---------   ---------   --------------------------
--dya-relief-light        #ffffff33   #ffffffe6   luz interior superior
--dya-relief-ring         #ffffff26   #0000001f   anillo de contorno, reposo
--dya-relief-ring-strong  #ffffff59   #00000038   anillo de contorno, hover
--dya-relief-shade        #00000040   #0000000d   sombra interior desde arriba
--dya-relief-drop         #00000066   #0000001a   sombra difusa inferior
```

El anillo tiene dos pasos porque la regla 2 del mandato exige que el hover se
exprese en el anillo. Sin el segundo valor no hay con qué expresarlo.

### 7.3 Recetas

```css
:root {
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
}
```

### 7.4 Estados

```text
Componente        Reposo        Hover          Active            Foco
---------------   -----------   ------------   ---------------   -----------
boton secundario  elev-raised   anillo mas     anillo mas        anillo de
                                opaco          tenue + .98       foco 2px
boton primario    relleno       relleno un     relleno + .98     anillo de
                  inverse       paso claro                       foco 2px
tecla / kbd       elev-key      elev-key       elev-key-pressed  anillo de
                                               + translateY 2px  foco 2px
fila de lista     plano         fondo suave    scale(.98)        fondo firme
enlace de nav     sin subray.   subrayado de   -                 anillo de
                                acento 200ms                     foco 2px
```

El botón primario es el único componente que cambia de relleno, y solo un paso:
en claro `#101010` a `#2e2c2b`, en oscuro `#e6e6e6` a `#ffffff`.


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
  parámetros de relieve del tema anterior. Verificado en Chromium: un elemento
  con `transition: box-shadow` mantiene el anillo del tema claro al pasar a
  oscuro, y se corrige en el instante en que se le retira la transición. Es
  además la propiedad más cara de animar, que §9 ya penaliza. Las transiciones
  se limitan a `transform`, `opacity` y `background-color`, que sí reevalúan sus
  tokens correctamente.
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


## 10. Arquitectura

```text
dyarchia-ui/
├─ packages/
│  ├─ tokens/    @dyarchia/tokens   CSS puro: tokens.css, reset.css, motion.css
│  ├─ fonts/     @dyarchia/fonts    @font-face de Geist para consumidores sin
│  │                                next/font
│  └─ ui/        @dyarchia/ui       React + CSS Modules
└─ apps/catalog/                    app Vite, una ruta por componente
```

- Motor de estilos: custom properties + CSS Modules. Nativo en Vite y en Next,
  sin configuración añadida.
- Accesibilidad: Base UI para todo lo que tenga foco atrapado, teclado, ARIA o
  posicionamiento con colisiones. El resto a mano, sin dependencias.
- Distribución: npm bajo el scope `@dyarchia`; `link:` de pnpm en desarrollo.
- Catálogo con Vite, no Storybook.


## 11. Catálogo y fases

```text
Primitivas      Button, IconButton, Kbd, Input, Textarea, Card, Surface,
sin deps        Badge, Separator, Text, Heading, Spinner, Avatar, Eyebrow
Sobre Base UI   Dialog, AlertDialog, Popover, Tooltip, DropdownMenu,
                ContextMenu, Select, Tabs, Switch, Checkbox, Radio, Slider,
                Accordion, Toast, ScrollArea, Progress
Composites      CommandPalette, ListRow, SectionTitle, PanelHeader, Toolbar,
dyarchia        StatusDot, EmptyState
```

```text
Fase   Contenido                                      Motivo
----   --------------------------------------------   -----------------------
1      tokens + fonts + catalogo + Button, Kbd,       valida el relieve en los
       Input, Card, Badge, Separator, Eyebrow         DOS temas antes de nada
2      migrar el shell de dyarchia-desktop            un sistema sin consumidor
                                                      se pudre
3      tier de Base UI completo                       ya sobre tokens probados
4      composites de dyarchia                         lo que el shell necesita
5      landing Next.js                                validacion final
```

Los dos temas se construyen a la vez desde la fase 1. No hay fase de "añadir el
tema claro": ambos son entrada conocida.


## 12. Calibraciones abiertas

Se resuelven mirando pantalla en la fase 1. Ninguna bloquea el arranque.

- **Temperatura de los neutros.** El claro es cálido (tinte marrón, de Factory) y
  el oscuro es frío (sesgo azul, de Raycast). Cada tema es coherente por dentro,
  pero conviene decidir si se unifica la temperatura o si la divergencia es
  deliberada.
- **Relieve en claro.** Los cuatro valores de 7.2 en la columna clara son un
  punto de partida razonado, no medido: Factory no tiene sombras que copiar.
- **Conjuntos estilísticos de Geist.** Determinar empíricamente cuáles aportan.
  No se transfiere el `ss03` de la referencia, que es específico de Inter.
- **Radio de la tecla.** 3px es lo que manda el sistema, pero una tecla física a
  3px puede pedir el `--dya-radius-media` de 4px. Se decide en pantalla.
