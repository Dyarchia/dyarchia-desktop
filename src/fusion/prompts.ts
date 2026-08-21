import type { MemberResult } from '../types.js'

const SCHEMA = `{
  "consensus": [{ "claim": string, "supported_by": number[] }],
  "contradictions": [{ "topic": string, "positions": [{ "member": number, "position": string }] }],
  "partial_coverage": [{ "point": string, "covered_by": number[] }],
  "unique_insights": [{ "member": number, "insight": string }],
  "blind_spots": string[]
}`

export const PANEL_SYSTEM = [
    'Answer the question directly and completely.',
    'Show your reasoning where the reasoning is what makes the answer trustworthy.',
    'Where you are uncertain, name the uncertainty instead of hedging every sentence.',
    'Do not ask clarifying questions. Answer the question as posed.'
].join(' ')

export const ANALYST_SYSTEM = [
    'You are given a question and several independent answers to it, each written by a different model',
    'that could not see the others.',
    'You do not merge them and you do not answer the question yourself. You compare them.',
    '',
    'Return one JSON object and nothing else: no prose before or after, no markdown fence.',
    'It must match this shape exactly:',
    '',
    SCHEMA,
    '',
    'Rules:',
    '- consensus: claims all or most members make. supported_by holds their 1-based numbers.',
    '- contradictions: points where members take positions that cannot both be true.',
    '- partial_coverage: substantive points only some members raised.',
    '- unique_insights: something exactly one member contributed that is worth keeping.',
    '- blind_spots: what the question needed and no member addressed.',
    '- Judge substance, not wording. The same claim in different words is consensus, not contradiction.',
    '- An empty array is a valid and often correct value for any field. Do not invent findings.'
].join('\n')

export const WRITER_SYSTEM = [
    'You are given a question and a structured comparison of several independent answers to it.',
    'Write the final answer.',
    '',
    '- Treat consensus as high confidence and state it plainly.',
    '- Where the members contradicted each other, do not paper over it: state the disagreement,',
    '  then take a position and say why.',
    '- Fold in the unique insights that survive scrutiny. Drop the ones that do not.',
    '- Address the blind spots if you can, and say so if you cannot.',
    '- Write the answer itself. Do not describe the panel, the members, the comparison or the process.',
    '  Someone asked a question and wants it answered.'
].join('\n')

function escape(text: string): string {
    return text.replace(/]]>/g, ']]&gt;')
}

export function analysisPrompt(question: string, members: MemberResult[]): string {
    const blocks = members.map((member) => {
        const model = `${member.seat.key} (${member.seat.mode})`
        return `<member id="${member.index}" model="${model}">\n${escape(member.text)}\n</member>`
    })

    return [`<question>\n${escape(question)}\n</question>`, '', ...blocks].join('\n')
}

export function answerPrompt(question: string, analysis: unknown): string {
    return [
        `<question>\n${escape(question)}\n</question>`,
        '',
        `<analysis>\n${JSON.stringify(analysis, null, 2)}\n</analysis>`
    ].join('\n')
}
