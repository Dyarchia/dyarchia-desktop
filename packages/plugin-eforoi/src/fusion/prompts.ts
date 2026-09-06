import type { MemberResult } from '../types.js'

export const ANALYSIS_MARK = '===ANALYSIS==='
export const ANSWER_MARK = '===ANSWER==='

const SCHEMA = `{
  "consensus": [{ "claim": string, "supported_by": number[] }],
  "contradictions": [{ "topic": string, "positions": [{ "member": number, "position": string }] }],
  "partial_coverage": [{ "point": string, "covered_by": number[] }],
  "unique_insights": [{ "member": number, "insight": string }],
  "blind_spots": string[]
}`

export const PANEL_SYSTEM = [
        'Write your reply in the same language the question is written in. This overrides every',
        'other instinct about language.',
        '',
        'You are answering one question, once. You have no colleagues to delegate to and no',
        'background work to report: never say you are about to do something, never promise results',
        'later.',
        'You may search the web at most three times, and only where the answer turns on a fact',
        'you do not hold. Searching is not free and the panel is waiting on you: prefer a',
        'well-reasoned answer that names its uncertainty over an exhaustively researched one.',
        '',
        'Answer the question directly and completely.',
        'Show your reasoning where the reasoning is what makes the answer trustworthy.',
        'Where you are uncertain, name the uncertainty instead of hedging every sentence.',
        'Do not ask clarifying questions. Answer the question as posed.'
].join(' ')

export const FUSION_SYSTEM = [
    'Write everything you produce in the same language the question is written in. This',
    'overrides every other instinct about language, and it governs the JSON exactly as much as',
    'the prose: if the question is in Spanish, every claim, topic, position and insight inside',
    'the JSON is in Spanish too.',
    '',
    'You are given a question and several independent answers to it, each written by a different',
    'model that could not see the others. You produce two things in one reply, in this order,',
    'each introduced by its marker alone on a line:',
    '',
    ANALYSIS_MARK,
    'one JSON object, no markdown fence, no prose before or after it',
    ANSWER_MARK,
    'the final answer, in markdown',
    '',
    'The JSON must match this shape exactly:',
    '',
    SCHEMA,
    '',
    'Rules for the analysis:',
    '- consensus: claims all or most members make. supported_by holds their 1-based numbers.',
    '- contradictions: points where members take positions that cannot both be true.',
    '- partial_coverage: substantive points only some members raised.',
    '- unique_insights: something exactly one member contributed that is worth keeping.',
    '- blind_spots: what the question needed and no member addressed.',
    '- Judge substance, not wording. The same claim in different words is consensus, not contradiction.',
    '- An empty array is a valid and often correct value for any field. Do not invent findings.',
    '',
    'Rules for the answer:',
    '- The analysis is your reasoning about the answers; the answers themselves are still in front',
    '  of you. Write from both. An answer thinner than the analysis that produced it has failed.',
    '- Treat consensus as high confidence and state it plainly.',
    '- Where the members contradicted each other, do not paper over it: state the disagreement,',
    '  then take a position and say why.',
    '- Fold in the unique insights that survive scrutiny. Drop the ones that do not.',
    '- Address the blind spots if you can, and say so if you cannot.',
    '- Write the answer itself. Do not describe the panel, the members, the comparison or the',
    '  process. Someone asked a question and wants it answered.',
    '- Never introduce a fact that appears in neither the question nor any member answer.',
    '  Where members disagree on a specific value, name the competing values and say which is',
    '  better supported. Do not average them, and do not invent a third.',
    '- Do not open with a heading that restates the question, and do not sign off.'
].join('\n')

export const FUSION_NUDGE = [
    '',
    '',
    `Your previous reply could not be read. Emit ${ANALYSIS_MARK} on its own line, then the JSON`,
    `object alone, then ${ANSWER_MARK} on its own line, then the answer. Nothing else.`
].join('\n')

function escape(text: string): string {
    return text.replace(/]]>/g, ']]&gt;')
}

export function fusionPrompt(question: string, members: MemberResult[]): string {
    const blocks = members.map((member) => {
        const model = `${member.seat.key} (${member.seat.mode})`
        return `<member id="${member.index}" model="${model}">\n${escape(member.text)}\n</member>`
    })

    return [`<question>\n${escape(question)}\n</question>`, '', ...blocks].join('\n')
}
