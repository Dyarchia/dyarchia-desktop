import { complete } from '../providers/registry.js'
import type { Analysis, MemberResult, RunConfig, RunSummary, Seat, Stage, Usage } from '../types.js'
import { parseAnalysis } from './parse.js'
import { ANALYST_SYSTEM, PANEL_SYSTEM, WRITER_SYSTEM, analysisPrompt, answerPrompt } from './prompts.js'

export interface RunEvents {
    stage(stage: Stage): void
    memberDelta(index: number, text: string): void
    memberDone(result: MemberResult): void
    analysis(analysis: Analysis, usage: Usage, ms: number): void
    answerDelta(text: string): void
    done(answer: string, summary: RunSummary): void
}

const RETRY_NUDGE = '\n\nYour previous reply was not valid JSON. Return only the JSON object.'

function accumulate(target: RunSummary, usage: Usage): void {
    target.inputTokens += usage.inputTokens
    target.outputTokens += usage.outputTokens
    if (usage.costUsd === null) return
    target.costUsd += usage.costUsd
    if (usage.billing === 'metered') target.meteredCostUsd += usage.costUsd
}

async function member(
    seat: Seat,
    index: number,
    config: RunConfig,
    events: RunEvents,
    signal: AbortSignal
): Promise<MemberResult> {
    const started = Date.now()
    try {
        const result = await complete(seat, {
            system: PANEL_SYSTEM,
            prompt: config.prompt,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            json: false,
            signal,
            onDelta: (text) => events.memberDelta(index, text)
        })
        return { index, seat, text: result.text, usage: result.usage, ms: result.ms }
    } catch (error) {
        return {
            index,
            seat,
            text: '',
            usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: null, billing: 'plan' },
            ms: Date.now() - started,
            error: error instanceof Error ? error.message : String(error)
        }
    }
}

async function analyse(
    config: RunConfig,
    survivors: MemberResult[],
    signal: AbortSignal
): Promise<{ analysis: Analysis; usage: Usage; ms: number }> {
    const prompt = analysisPrompt(config.prompt, survivors)
    let nudge = ''

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const result = await complete(config.analyst, {
            system: ANALYST_SYSTEM + nudge,
            prompt,
            temperature: 0,
            maxTokens: config.maxTokens,
            json: true,
            signal,
            onDelta: () => undefined
        })
        try {
            return { analysis: parseAnalysis(result.text), usage: result.usage, ms: result.ms }
        } catch (error) {
            if (attempt === 1) throw error
            nudge = RETRY_NUDGE
        }
    }

    throw new Error('the analyst never returned usable JSON')
}

export async function runFusion(
    config: RunConfig,
    events: RunEvents,
    signal: AbortSignal
): Promise<void> {
    const started = Date.now()
    const summary: RunSummary = {
        ms: 0,
        costUsd: 0,
        meteredCostUsd: 0,
        inputTokens: 0,
        outputTokens: 0
    }

    events.stage('panel')
    const members = await Promise.all(
        config.panel.map((seat, position) => member(seat, position + 1, config, events, signal))
    )
    for (const result of members) {
        accumulate(summary, result.usage)
        events.memberDone(result)
    }

    const survivors = members.filter((result) => !result.error && result.text.trim())
    if (!survivors.length) throw new Error('every panel member failed')

    events.stage('analysis')
    const analysed = await analyse(config, survivors, signal)
    accumulate(summary, analysed.usage)
    events.analysis(analysed.analysis, analysed.usage, analysed.ms)

    events.stage('answer')
    const answer = await complete(config.analyst, {
        system: WRITER_SYSTEM,
        prompt: answerPrompt(config.prompt, analysed.analysis),
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        json: false,
        signal,
        onDelta: (text) => events.answerDelta(text)
    })
    accumulate(summary, answer.usage)

    summary.ms = Date.now() - started
    events.done(answer.text, summary)
}
