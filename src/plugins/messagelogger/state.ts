// In-memory, session-only runtime registries for MessageLogger.
// Custom props don't survive the MessageStore record, so render/logic branch on
// these id-keyed registries. All cleared on stop().

export const deletedIds = new Set<string>(); // message ids currently shown as deleted
export const ghostParent = new Map<string, string>(); // ghostId -> current (parent) message id
export const highlightOff = new Set<string>(); // deleted ids whose highlight is toggled off this session
export const channelsWithGhosts = new Set<string>(); // channels that have injected ghost rows (for stop() cleanup)

const CONTENT_CACHE_MAX = 500;
// insertion-ordered Map used as a simple LRU of recent message contents (by id).
const contentCache = new Map<string, { content: string; raw: any }>();

export function cacheMessage(raw: any): void {
    if (!raw?.id) return;
    const id = String(raw.id);
    if (contentCache.has(id)) contentCache.delete(id);
    contentCache.set(id, { content: typeof raw.content === "string" ? raw.content : "", raw });
    if (contentCache.size > CONTENT_CACHE_MAX) {
        const oldest = contentCache.keys().next().value;
        if (oldest !== undefined) contentCache.delete(oldest);
    }
}

export function getCached(id: string): { content: string; raw: any } | undefined {
    return contentCache.get(String(id));
}

export function isDeleted(id: string): boolean {
    return deletedIds.has(String(id));
}

export function isGhost(id: string): boolean {
    return ghostParent.has(String(id));
}

export function clearState(): void {
    deletedIds.clear();
    ghostParent.clear();
    highlightOff.clear();
    channelsWithGhosts.clear();
    contentCache.clear();
}
