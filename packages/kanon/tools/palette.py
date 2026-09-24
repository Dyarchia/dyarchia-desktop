"""Solve a categorical hue for both themes: the most chroma a hue can carry and still be text.

    py packages/kanon/tools/palette.py
    py packages/kanon/tools/palette.py --hue 305 --text raised --graphic selected

A hue is fixed in OKLCH, where equal steps of hue look like equal steps, and the lightness and
chroma are searched together. The answer is the most saturated colour inside sRGB that measures
at least 4.50 against every surface a row, a card or a tile sits on, and at least 3.00 against
the surfaces where it is only ever a mark. Among equally saturated answers the darker one wins,
because the lightest colour that passes is the one that glares.

It prints hex values for tokens.css and the grid the commit body needs. contrast.py remains the
tool that re-measures a token once it is in the file.
"""

from __future__ import annotations

import argparse
import math

import contrast

TEXT_ON = ['surface-1', 'surface-2', 'flat-hover', 'raised']
MARK_ON = ['overlay', 'raised-hover', 'selected']

HUES = {
    'amber': 78,
    'mint': 165,
    'cyan': 215,
    'blue': 262,
    'violet': 303,
    'pink': 350,
}


def oklch_to_rgb(lightness: float, chroma: float, hue: float) -> tuple[float, float, float] | None:
    a = chroma * math.cos(math.radians(hue))
    b = chroma * math.sin(math.radians(hue))
    l_ = lightness + 0.3963377774 * a + 0.2158037573 * b
    m_ = lightness - 0.1055613458 * a - 0.0638541728 * b
    s_ = lightness - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    linear = (
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    )
    if any(channel < -1e-6 or channel > 1 + 1e-6 for channel in linear):
        return None
    return tuple(min(1.0, max(0.0, channel)) for channel in linear)


def to_hex(linear: tuple[float, float, float]) -> str:
    def encode(channel: float) -> int:
        value = 12.92 * channel if channel <= 0.0031308 else 1.055 * channel ** (1 / 2.4) - 0.055
        return round(max(0.0, min(1.0, value)) * 255)

    return '#' + ''.join(f'{encode(channel):02x}' for channel in linear)


def passes(ink: str, theme: dict[str, str], text_on: list[str], mark_on: list[str]) -> bool:
    if any(contrast.ratio(ink, theme[f'--dya-{name}']) < contrast.FLOOR for name in text_on):
        return False
    return all(contrast.ratio(ink, theme[f'--dya-{name}']) >= contrast.GRAPHIC for name in mark_on)


def solve(
    hue: float,
    theme: dict[str, str],
    text_on: list[str],
    mark_on: list[str],
    fixed: float | None = None,
) -> tuple[str, float, float]:
    best: tuple[float, float, str] | None = None
    for li in ([round(fixed * 1000)] if fixed else range(400, 980, 2)):
        lightness = li / 1000
        for ci in range(0, 380, 2):
            chroma = ci / 1000
            linear = oklch_to_rgb(lightness, chroma, hue)
            if linear is None:
                break
            ink = to_hex(linear)
            if not passes(ink, theme, text_on, mark_on):
                continue
            key = (chroma, -lightness)
            if best is None or key > (best[0], -best[1]):
                best = (chroma, lightness, ink)
    if best is None:
        raise SystemExit(f'no colour at hue {hue} passes')
    return best[2], best[1], best[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--hue', type=float, action='append')
    parser.add_argument('--text', nargs='*', default=TEXT_ON)
    parser.add_argument('--graphic', nargs='*', default=MARK_ON)
    parser.add_argument('--lightness', nargs=2, type=float, metavar=('GI', 'REI'))
    args = parser.parse_args()

    hues = {f'h{h:g}': h for h in args.hue} if args.hue else HUES
    grounds = [*args.text, *args.graphic]
    fixed = dict(zip(('Gi', 'Rei'), args.lightness)) if args.lightness else {}
    for theme_name, theme in contrast.themes().items():
        print(f'\n{theme_name}' + (f'  at OKLCH L {fixed[theme_name]}' if theme_name in fixed else ''))
        header = f'    {"name":<8} {"value":<8} {"L":>5} {"C":>5}  ' + ' '.join(f'{g[:9]:>9}' for g in grounds)
        print(header)
        print('    ' + '-' * (len(header) - 4))
        for name, hue in hues.items():
            ink, lightness, chroma = solve(hue, theme, args.text, args.graphic, fixed.get(theme_name))
            ratios = ' '.join(f'{contrast.ratio(ink, theme[f"--dya-{g}"]):>9.2f}' for g in grounds)
            print(f'    {name:<8} {ink:<8} {lightness:>5.3f} {chroma:>5.3f}  {ratios}')


if __name__ == '__main__':
    main()
