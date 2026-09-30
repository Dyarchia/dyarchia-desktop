export interface Hit {
    id: string
    title: string
    detail?: string
    run: () => void | Promise<void>
}

export type Search = (query: string) => Promise<Hit[]>

const searches = new Map<string, Search>()

export function registerSearch(owner: string, search: Search): () => void {
    searches.set(owner, search)
    return () => {
        if (searches.get(owner) === search) searches.delete(owner)
    }
}

export function getSearches(): [string, Search][] {
    return [...searches.entries()]
}
