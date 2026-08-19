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
