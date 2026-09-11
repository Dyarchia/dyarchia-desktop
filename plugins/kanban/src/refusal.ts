export class Refusal extends Error {
    readonly dyarchiaRefusal = true

    constructor(message: string) {
        super(message)
        this.name = 'Refusal'
    }
}

export function isRefusal(error: unknown): error is Refusal {
    return (
        error instanceof Error &&
        (error as { dyarchiaRefusal?: unknown }).dyarchiaRefusal === true
    )
}
