import { complete } from '../providers/registry.js'
import type { CompletionResult } from '../providers/adapter.js'
import { NO_USAGE } from '../providers/adapter.js'
import type { Analysis, MemberResult, RunConfig, RunSummary, Seat, Stage, Usage } from '../types.js'
import { parseAnalysis } from './parse.js'
import { ANSWER_MARK, FUSION_NUDGE, FUSION_SYSTEM, PANEL_SYSTEM, fusionPrompt } from './prompts.js'

export interface RunEvents {
    stage(stage: Stage): void
    memberDelta(index: number, text: string): void
    memberDone(result: MemberResult): void
    analysis(analysis: Analysis, usage: Usage, ms: number, attempt: number): void
    answerDelta(text: string): void
    done(answer: string, summary: RunSummary): void
}

export const MEMBER_DEADLINE_MS = 120_000
export const ANALYST_DEADLINE_MS = 300_000

interface SpeakOptions {
    system: string
    prompt: string
    config: RunConfig
    signal: AbortSignal
    onDelta(text: string): void
}

function speak(seat: Seat, options: SpeakOptions): Promise<CompletionResult> {
    return complete(seat, {
        system: options.system,
        prompt: options.prompt,
        temperature: options.config.temperature,
        maxTokens: options.config.maxTokens,
        signal: options.signal,
        onDelta: options.onDelta
    })
}


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
    const bounded = new AbortController()
    const relay = (): void => bounded.abort()
    signal.addEventListener('abort', relay, { once: true })
    const deadline = setTimeout(() => bounded.abort(), MEMBER_DEADLINE_MS)

    try {
        const result = await speak(seat, {
            system: PANEL_SYSTEM,
            prompt: config.prompt,
            config,
            signal: bounded.signal,
            onDelta: (text) => events.memberDelta(index, text)
        })
        return {
            index,
            seat,
            text: result.text,
            usage: result.usage,
            ms: result.ms,
            searches: result.searches
        }
    } catch (error) {
        const expired = bounded.signal.aborted && !signal.aborted
        return {
            index,
            seat,
            text: '',
            usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: null, billing: 'plan' },
            ms: Date.now() - started,
            searches: 0,
            error: expired
                ? `no answer within ${MEMBER_DEADLINE_MS / 1000}s, so this seat does not vote`
                : error instanceof Error
                  ? error.message
                  : String(error)
        }
    } finally {
        clearTimeout(deadline)
        signal.removeEventListener('abort', relay)
    }
}

interface Fused {
    analysis: Analysis
    answer: string
}

function cut(text: string): Fused | null {
    const at = text.indexOf(ANSWER_MARK)
    if (at < 0) return null
    const head = text.slice(0, at)
    const answer = text.slice(at + ANSWER_MARK.length).trim()
    if (!answer) return null
    try {
        return { analysis: parseAnalysis(head), answer }
    } catch {
        return null
    }
}

interface Fusion {
    fused: Fused
    usage: Usage
    ms: number
    streamed: boolean
    attempt: number
}

async function attempt(
    config: RunConfig,
    prompt: string,
    round: number,
    events: RunEvents,
    signal: AbortSignal
): Promise<Fusion | null> {
    const started = Date.now()
    let buffer = ''
    let past = false

    const result = await speak(config.analyst, {
        system: FUSION_SYSTEM + (round > 1 ? FUSION_NUDGE : ''),
        prompt,
        config,
        signal,
        onDelta(text) {
            if (past) {
                events.answerDelta(text)
                return
            }
            buffer += text
            const at = buffer.indexOf(ANSWER_MARK)
            if (at < 0) return
            past = true
            try {
                events.analysis(parseAnalysis(buffer.slice(0, at)), NO_USAGE, Date.now() - started, round)
            } catch {
                past = false
                return
            }
            events.stage('answer')
            const tail = buffer.slice(at + ANSWER_MARK.length).replace(/^\s*\n/, '')
            if (tail) events.answerDelta(tail)
        }
    })

    const fused = cut(result.text)
    if (!fused) return null
    return { fused, usage: result.usage, ms: result.ms, streamed: past, attempt: round }
}

async function fuse(
    config: RunConfig,
    survivors: MemberResult[],
    events: RunEvents,
    signal: AbortSignal
): Promise<Fusion> {
    const prompt = fusionPrompt(config.prompt, survivors)
    const bounded = new AbortController()
    const relay = (): void => bounded.abort()
    signal.addEventListener('abort', relay, { once: true })
    const deadline = setTimeout(() => bounded.abort(), ANALYST_DEADLINE_MS)

    try {
        for (let round = 1; round <= 2; round += 1) {
            if (round > 1) {
                events.stage('answer')
                events.stage('analysis')
            }
            const done = await attempt(config, prompt, round, events, bounded.signal)
            if (done) return done
        }
        throw new Error('the analyst never returned a readable analysis and answer')
    } catch (error) {
        if (bounded.signal.aborted && !signal.aborted) {
            throw new Error(
                `the analyst did not finish within ${ANALYST_DEADLINE_MS / 1000}s — it reads every ` +
                    'member answer, so a small model can be slower here than any seat was'
            )
        }
        throw error
    } finally {
        clearTimeout(deadline)
        signal.removeEventListener('abort', relay)
    }
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
        config.panel.map((seat, position) =>
            member(seat, position + 1, config, events, signal)
        )
    )
    for (const result of members) {
        accumulate(summary, result.usage)
        events.memberDone(result)
    }

    const survivors = members.filter((result) => !result.error && result.text.trim())
    if (!survivors.length) throw new Error('every panel member failed')

    events.stage('analysis')
    const { fused, usage, ms, streamed, attempt } = await fuse(config, survivors, events, signal)
    accumulate(summary, usage)

    if (!streamed) {
        events.analysis(fused.analysis, usage, ms, attempt)
        events.stage('answer')
        events.answerDelta(fused.answer)
    }

    summary.ms = Date.now() - started
    events.done(fused.answer, summary)
}
