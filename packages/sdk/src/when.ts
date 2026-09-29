const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function two(value: number): string {
    return String(value).padStart(2, '0')
}

export function when(value: Date | number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return ''
    const at = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(at.getTime())) return ''
    const year = at.getFullYear() === new Date().getFullYear() ? '' : ` ${at.getFullYear()}`
    return `${at.getDate()} ${MONTHS[at.getMonth()]}${year} ${two(at.getHours())}:${two(at.getMinutes())}`
}
