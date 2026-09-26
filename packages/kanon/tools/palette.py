"""Lift a reference colour until it clears a floor on every ground.

    py packages/kanon/tools/palette.py
    py packages/kanon/tools/palette.py '#1069f6' --floor 3.00

The six colours are quotations of a reference, not solved from nothing. Each one keeps its OKLCH
hue and chroma and has its lightness raised in small steps, the chroma giving way only where sRGB
cannot hold it, until the worst ratio against every ground reaches the floor. With the defaults
it prints the three rows each colour needs: the light at 3.00, the ink at 5.50 and the bright
terminal twin at 9.00. A colour that already clears a floor is printed as it is.

contrast.py remains the tool that re-measures a token once it is in the file.
"""

from __future__ import annotations

import argparse
import math

import contrast

REFERENCE = {
    'blue': '#1069f6',
    'purple': '#7646e6',
    'orange': '#f07a35',
    'green': '#4bbc6e',
    'yellow': '#f5b031',
    'red': '#ec4b3a',
}

FLOORS = {'light': 3.00, 'ink': 5.50, 'bright': 9.00}

"""
Degrees an ink turns away from its light before it is lifted. Lifted at its own hue, purple's
ink lands 30 degrees from blue's at the lightness text needs, and the two read as one colour
side by side in a code block, a keyword beside the name it declares. The light keeps the
reference hue; only the words turn toward magenta.
"""
TURN = {'purple': 15.0}


def linear(channel: float) -> float:
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def encode(channel: float) -> float:
    return 12.92 * channel if channel <= 0.0031308 else 1.055 * channel ** (1 / 2.4) - 0.055


def to_oklch(value: str) -> tuple[float, float, float]:
    r, g, b = (linear(int(value[i:i + 2], 16) / 255) for i in (1, 3, 5))
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    lightness = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
    a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
    b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
    return lightness, math.hypot(a, b), math.atan2(b, a)


def to_hex(lightness: float, chroma: float, hue: float) -> str | None:
    a, b = chroma * math.cos(hue), chroma * math.sin(hue)
    l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (lightness - 0.0894841775 * a - 1.2914855480 * b) ** 3
    rgb = (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )
    if any(channel < -1e-4 or channel > 1 + 1e-4 for channel in rgb):
        return None
    return '#' + ''.join(f'{round(max(0.0, min(1.0, encode(max(0.0, c)))) * 255):02x}' for c in rgb)


def fit(lightness: float, chroma: float, hue: float) -> str:
    while chroma > 0:
        value = to_hex(lightness, chroma, hue)
        if value:
            return value
        chroma -= 0.002
    return to_hex(lightness, 0, hue) or '#ffffff'


def worst(value: str, grounds: list[str]) -> float:
    return min(contrast.ratio(value, ground) for ground in grounds)


def lift(value: str, floor: float, grounds: list[str]) -> str:
    lightness, chroma, hue = to_oklch(value)
    while worst(value, grounds) < floor and lightness < 1:
        lightness += 0.005
        value = fit(lightness, chroma, hue)
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('colour', nargs='?', help='a #rrggbb to lift instead of the six references')
    parser.add_argument('--floor', type=float, help='one floor instead of light, ink and bright')
    args = parser.parse_args()

    theme = contrast.palette()
    grounds = [theme[f'--dya-{name}'] for name in contrast.SURFACES + list(contrast.COMPOSITES)]
    colours = {'colour': args.colour} if args.colour else REFERENCE
    floors = {f'{args.floor:.2f}': args.floor} if args.floor else FLOORS

    header = f'{"name":<8} {"reference":<9} ' + ' '.join(f'{name:>15}' for name in floors)
    print(header)
    print('-' * len(header))
    for name, value in colours.items():
        cells = []
        for label, floor in floors.items():
            seed = value
            if name in TURN and label != 'light':
                lightness, chroma, hue = to_oklch(value)
                seed = fit(lightness, chroma, hue + math.radians(TURN[name]))
            lifted = lift(seed, floor, grounds)
            cells.append(f'{lifted} {worst(lifted, grounds):>5.2f}'.rjust(15))
        print(f'{name:<8} {value:<9} ' + ' '.join(cells))


if __name__ == '__main__':
    main()
