function escape(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function inline(text: string): string {
    return escape(text)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
}

function listItem(line: string): string | null {
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) return bullet[1]
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    return ordered ? ordered[1] : null
}

export function renderMarkdown(source: string): string {
    const lines = source.replace(/\r\n/g, '\n').split('\n')
    const out: string[] = []
    let list: string[] = []

    const flush = (): void => {
        if (!list.length) return
        out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`)
        list = []
    }

    let paragraph: string[] = []

    const flushParagraph = (): void => {
        if (!paragraph.length) return
        out.push(`<p>${inline(paragraph.join(' '))}</p>`)
        paragraph = []
    }

    for (const line of lines) {
        const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
            flush()
            flushParagraph()
            out.push(`<h4 class="dya-label">${inline(heading[2])}</h4>`)
            continue
        }

        const item = listItem(line)
        if (item !== null) {
            flushParagraph()
            list.push(item)
            continue
        }

        if (!line.trim()) {
            flush()
            flushParagraph()
            continue
        }

        flush()
        paragraph.push(line.trim())
    }

    flush()
    flushParagraph()
    return out.join('')
}
