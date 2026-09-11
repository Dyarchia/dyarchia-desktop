"""Measure a colour token against every surface it can sit on, in both themes.

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
    'bg', 'sunken', 'chassis', 'surface-1', 'surface-2',
    'flat-hover', 'raised', 'overlay', 'raised-hover', 'selected'
]

FLOOR = 4.50
GRAPHIC = 3.00


def themes() -> dict[str, dict[str, str]]:
    css = CSS.read_text(encoding='utf-8')
    blocks = re.split(r'\[data-theme="([a-z]+)"\]\s*\{', css)

    parsed: dict[str, dict[str, str]] = {'Gi': tokens(blocks[0])}
    for name, body in zip(blocks[1::2], blocks[2::2]):
        merged = dict(parsed['Gi'])
        merged.update(tokens(body))
        parsed[name.capitalize()] = merged
    return parsed


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

    palettes = themes()
    print(f'{"theme":8} {"surface":14} {"ground":9} {"ratio":>6}  reading')
    print('-' * 52)

    for theme, palette in palettes.items():
        ink = args.ink if args.ink.startswith('#') else palette.get(f'--dya-{args.ink}')
        if not ink:
            raise SystemExit(f'--dya-{args.ink} is not defined in {theme}')
        for surface in args.against:
            ground = palette.get(f'--dya-{surface}')
            if not ground:
                continue
            value = ratio(ink, ground)
            print(f'{theme:8} {surface:14} {ground:9} {value:6.2f}  {verdict(value)}')
        print()


if __name__ == '__main__':
    main()
