"""Measure a colour token against every surface it can sit on.

    py packages/kanon/tools/contrast.py --dya-text-2
    py packages/kanon/tools/contrast.py '#85857f' --against surface-1 surface-2

Every change to a text, border, surface or accent token has to be re-measured this way and
the numbers go in the commit body. See packages/kanon/README.md for the rule and the 4.50
floor.
"""

import argparse
import pathlib
import re

CSS = pathlib.Path(__file__).resolve().parent.parent / 'css' / 'tokens.css'

SURFACES = [
    'bg', 'sunken', 'chassis', 'surface-1', 'surface-2', 'flat-hover',
    'raised', 'overlay', 'raised-hover', 'selected', 'disabled'
]

"""
Two grounds no token declares, because they only exist where translucent layers stack: the
panel's glass over the brightest ground the system has allowed, and a card on that glass. They
were measured over a pool of light `--dya-ground` no longer carries and are kept as a ceiling:
the lightest place a panel's text could land, so every ink is measured against them too.
"""
COMPOSITES = {
    'glass-peak': '#27292c',
    'card-peak': '#2f3033',
}

FLOOR = 4.50
GRAPHIC = 3.00


def palette() -> dict[str, str]:
    values = tokens(CSS.read_text(encoding='utf-8'))
    values.update({f'--dya-{name}': value for name, value in COMPOSITES.items()})
    return values


def tokens(block: str) -> dict[str, str]:
    return {
        name: value.strip()
        for name, value in re.findall(r'(--dya-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;', block)
    }


def luminance(value: str) -> float:
    raw = value.lstrip('#')
    channels = []
    for pair in (raw[0:2], raw[2:4], raw[4:6]):
        channel = int(pair, 16) / 255
        channels.append(channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def ratio(ink: str, ground: str) -> float:
    a, b = luminance(ink), luminance(ground)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def verdict(value: float) -> str:
    if value >= FLOOR:
        return 'text'
    if value >= GRAPHIC:
        return 'graphic only'
    return 'FAILS'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('ink', help='a token suffix such as text-2 or code-comment, or a literal #rrggbb')
    parser.add_argument('--against', nargs='*', default=SURFACES, help='surface suffixes')
    args = parser.parse_args()

    values = palette()
    ink = args.ink if args.ink.startswith('#') else values.get(f'--dya-{args.ink}')
    if not ink:
        raise SystemExit(f'--dya-{args.ink} is not defined')
    print(f'{"surface":14} {"ground":9} {"ratio":>6}  reading')
    print('-' * 43)
    for surface in args.against + [name for name in COMPOSITES if name not in args.against]:
        ground = values.get(f'--dya-{surface}')
        if ground:
            value = ratio(ink, ground)
            print(f'{surface:14} {ground:9} {value:6.2f}  {verdict(value)}')


if __name__ == '__main__':
    main()
