import { runFusion } from '../src/fusion/run.js'
import { catalog } from '../src/providers/registry.js'
import type { Threads } from '../src/fusion/run.js'
import type { RunConfig, Seat } from '../src/types.js'

const [, , command, ...rest] = process.argv

function parseSeat(raw: string): Seat {
    const [key, mode] = raw.split('@')
    return { key, mode: mode === 'api' ? 'api' : 'subscription' }
}

if (command === 'catalog') {
    const found = await catalog()
    for (const [id, status] of Object.entries(found.routes)) {
        console.log(`route ${id.padEnd(9)} ${status.available ? 'ok' : status.reason}`)
    }
    console.log(`\n${found.entries.length} models\n`)
    for (const entry of found.entries) {
        const modes = entry.modes
            .map((mode) => `${mode.mode}=${mode.available ? 'ok' : 'no'}`)
            .join(' ')
        console.log(`${entry.key.padEnd(34)} ${modes}  ${entry.label}`)
    }
} else if (command === 'run') {
    const prompt = rest.pop() ?? 'Say hello.'
    const seats = rest.map(parseSeat)
    if (seats.length < 3) throw new Error('usage: probe run <panel@mode> <panel@mode> <analyst@mode> "prompt"')

    const turns = prompt.split('||').map((part) => part.trim()).filter(Boolean)
    const threads: Threads = new Map()

    for (const [index, turn] of turns.entries()) {
        if (turns.length > 1) console.log(`
######## turn ${index + 1}: ${turn}`)
        await runTurn(turn, seats, threads)
    }
} else {
    console.log('usage: pnpm probe catalog | pnpm probe run <seat> <seat> <analyst> "prompt || follow-up"')
}

async function runTurn(prompt: string, seats: Seat[], threads: Threads): Promise<void> {
    const config: RunConfig = {
        conversation: 'probe',
        prompt,
        panel: seats.slice(0, -1),
        analyst: seats[seats.length - 1],
        temperature: 0.7,
        maxTokens: 4000
    }

    await runFusion(
        config,
        {
            stage: (stage) => console.log(`\n== ${stage} ==`),
            memberDelta: () => undefined,
            memberDone: (result) =>
                console.log(
                    `member ${result.index} ${result.error ? `FAILED ${result.error}` : 'ok'} ` +
                        `${(result.ms / 1000).toFixed(1)}s ${result.usage.outputTokens} out`
                ),
            analysis: (analysis, _usage, ms) => {
                console.log(`analysis in ${(ms / 1000).toFixed(1)}s`)
                console.log(JSON.stringify(analysis, null, 2).slice(0, 1400))
            },
            answerDelta: (text) => process.stdout.write(text),
            done: (_answer, summary) =>
                console.log(
                    `\n\n== done in ${(summary.ms / 1000).toFixed(1)}s, ` +
                        `$${summary.costUsd.toFixed(4)} notional, ` +
                        `$${summary.meteredCostUsd.toFixed(4)} metered ==`
                )
        },
        new AbortController().signal,
        threads
    )
}
