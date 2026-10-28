// Pure store logic (no rain imports) so it is unit-checkable with `bun`.
// store.ts wraps this with filesystem + settings I/O.

export interface DeletedRecord {
    raw: any;
    deletedAt: number;
}

export interface EditedRecord {
    currentMessageId: string;
    authorId: string;
    channelId: string;
    raw: any;
    editHistory: { content: string; timestamp: string }[];
}

export interface ChannelBucket {
    deleted: DeletedRecord[];
    edited: EditedRecord[];
}

export interface StoreData {
    version: 2;
    channels: Record<string, ChannelBucket>;
}

export const STORE_VERSION = 2 as const;
export const PER_CHANNEL_CAP = 200;
export const GLOBAL_CAP = 2000;

export function emptyStore(): StoreData {
    return { version: STORE_VERSION, channels: {} };
}

export function validDeleted(r: any): r is DeletedRecord {
    return !!r && typeof r === "object" && !!r.raw && typeof r.raw.id === "string" && typeof r.deletedAt === "number";
}

export function validEdited(r: any): r is EditedRecord {
    return !!r && typeof r === "object" && typeof r.currentMessageId === "string" && Array.isArray(r.editHistory);
}

// Parse+repair arbitrary input into a valid StoreData, dropping malformed records.
export function repairData(parsed: any): StoreData {
    if (!parsed || parsed.version !== STORE_VERSION || typeof parsed.channels !== "object" || !parsed.channels) {
        return emptyStore();
    }
    const channels: Record<string, ChannelBucket> = {};
    for (const [cid, b] of Object.entries<any>(parsed.channels)) {
        const deleted = Array.isArray(b?.deleted) ? b.deleted.filter(validDeleted) : [];
        const edited = Array.isArray(b?.edited) ? b.edited.filter(validEdited) : [];
        if (deleted.length || edited.length) channels[cid] = { deleted, edited };
    }
    return { version: STORE_VERSION, channels };
}

// Oldest timestamp at the head of a bucket (deleted uses deletedAt, edited uses first edit ts).
function headTs(b: ChannelBucket): number {
    const dTs = b.deleted[0]?.deletedAt ?? Infinity;
    const firstEdit = b.edited[0]?.editHistory[0]?.timestamp;
    const eTs = firstEdit ? Date.parse(firstEdit) : Infinity;
    return Math.min(dTs, eTs);
}

function dropOldestInBucket(b: ChannelBucket): void {
    const dTs = b.deleted[0]?.deletedAt ?? Infinity;
    const firstEdit = b.edited[0]?.editHistory[0]?.timestamp;
    const eTs = firstEdit ? Date.parse(firstEdit) : Infinity;
    if (b.deleted.length && dTs <= eTs) b.deleted.shift();
    else if (b.edited.length) b.edited.shift();
}

// Evict oldest records to satisfy per-channel and global caps. Mutates `data`.
export function enforceCaps(data: StoreData, perChannelCap = PER_CHANNEL_CAP, globalCap = GLOBAL_CAP): void {
    for (const b of Object.values(data.channels)) {
        while (b.deleted.length + b.edited.length > perChannelCap) dropOldestInBucket(b);
    }
    let total = 0;
    for (const b of Object.values(data.channels)) total += b.deleted.length + b.edited.length;
    while (total > globalCap) {
        let target: ChannelBucket | null = null;
        let oldest = Infinity;
        for (const b of Object.values(data.channels)) {
            const h = headTs(b);
            if (h < oldest) { oldest = h; target = b; }
        }
        if (!target || (target.deleted.length + target.edited.length === 0)) break;
        dropOldestInBucket(target);
        total--;
    }
}
