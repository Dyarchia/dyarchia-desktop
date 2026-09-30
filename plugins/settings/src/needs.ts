export interface Requirement {
    kind: string
    label: string
    name?: string
    hint?: string
    project?: string
    note?: string
    postInstall?: string[][]
    verify?: string[]
    assets?: Record<string, string>
    withPlugin?: boolean
}

export interface Status {
    label: string
    met: boolean
    acquirable: boolean
    detail: string
}

/*
 * The pills a requirement shows, known from the manifest alone. The panel draws them before the
 * main process has looked at the disk and the inspection only restates each one, so a row has its
 * final shape from its first frame. A post-install step is named by what it fetches, never by its
 * argv; verification is part of the environment, not a pill of its own.
 */
export function needLabels(requirement: Requirement): string[] {
    if (requirement.kind !== 'python') return [requirement.label]
    return [
        'uv',
        requirement.label,
        ...(requirement.postInstall ?? []).map((step) => step[step.length - 1] ?? step.join(' '))
    ]
}
