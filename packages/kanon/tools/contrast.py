"""Measure a colour token against every surface it can sit on.

    py packages/kanon/tools/contrast.py text-muted
    py packages/kanon/tools/contrast.py text-muted --theme <id>
    py packages/kanon/tools/contrast.py '#85857f' --against panel field

Every change to a text, border, surface or accent token has to be re-measured this way and
the numbers go in the commit body. See packages/kanon/README.md for the rule and the 4.50
floor.
"""

import argparse
import pathlib
import re

CSS = pathlib.Path(__file__).resolve().parent.parent / 'css'
DEFAULT = 'dyarchia'

SURFACES = ['ground', 'panel', 'field', 'hover', 'selected']

"""
Grounds no token declares, because they only exist where a translucent wash lies over a surface:
the pressed wash over a panel is the lightest place text lands. Each theme measures its own; a
theme is not finished until its washes are here.
"""
COMPOSITES = {
    'dyarchia': {
        'press-peak': '#2c2b29',
        'hover-peak': '#242422',
    },
}

FLOOR = 4.50
GRAPHIC = 3.00


def palette(theme: str) -> dict[str, str]:
    """The default's tokens, with a theme's own file laid over them as the cascade does."""
    values = tokens((CSS / 'tokens.css').read_text(encoding='utf-8'))
    if theme != DEFAULT:
        path = CSS / 'themes' / f'{theme}.css'
        if not path.exists():
            raise SystemExit(f'{path} does not exist')
        values.update(tokens(path.read_text(encoding='utf-8')))
    values.update({f'--dya-{name}': value for name, value in COMPOSITES.get(theme, {}).items()})
    for name, value in values.items():
        while value.startswith('var('):
            value = values[value[4:-1]]
        values[name] = value
    return values


def tokens(block: str) -> dict[str, str]:
    return {
        name: value.strip()
        for name, value in re.findall(r'(--dya-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6}|var\(--dya-[a-z0-9-]+\))\s*;', block)
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
    parser.add_argument('ink', help='a token suffix such as text-faint or code-comment, or a literal #rrggbb')
    parser.add_argument('--against', nargs='*', default=SURFACES, help='surface suffixes')
    parser.add_argument('--theme', default=DEFAULT, help='a theme id, as css/themes/<id>.css names it')
    args = parser.parse_args()

    values = palette(args.theme)
    composites = COMPOSITES.get(args.theme, {})
    if not composites:
        print(f'{args.theme} declares no composite grounds yet')
    ink = args.ink if args.ink.startswith('#') else values.get(f'--dya-{args.ink}')
    if not ink:
        raise SystemExit(f'--dya-{args.ink} is not defined')
    print(f'{"surface":14} {"ground":9} {"ratio":>6}  reading')
    print('-' * 43)
    for surface in args.against + [name for name in composites if name not in args.against]:
        ground = values.get(f'--dya-{surface}')
        if ground:
            value = ratio(ink, ground)
            print(f'{surface:14} {ground:9} {value:6.2f}  {verdict(value)}')


if __name__ == '__main__':
    main()
