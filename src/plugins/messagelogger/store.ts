import { fileExists, readFile, writeFile } from "@api/native/fs";

import { MAX_EDIT_HISTORY } from "./constants";
import { useMessageLoggerSettings } from "./storage";
import {
    type ChannelBucket,
    emptyStore,
    enforceCaps,
    repairData,
    type StoreData,
} from "./store-logic";

export type { ChannelBucket, DeletedRecord, EditedRecord } from "./store-logic";

const LOG_FILE = "public/message_logs.json";

let data: StoreData = emptyStore();
let loaded = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function persistenceOn(): boolean {
    try {
        return !!useMessageLoggerSettings.getState().persistence;
    } catch {
        return false;
    }
}

function bucket(channelId: string): ChannelBucket {
    let b = data.channels[channelId];
    if (!b) {
        b = { deleted: [], edited: [] };
        data.channels[channelId] = b;
    }
    return b;
}

export async function loadStore(): Promise<void> {
    if (loaded) return;
    loaded = true;
    try {
        if (await fileExists(LOG_FILE)) {
            data = repairData(JSON.parse(await readFile(LOG_FILE)));
        }
    } catch {
        data = emptyStore();
    }
}

// Begin reading persisted history at module-import time (earliest possible) so it's ready
// before the first channel load, avoiding a delayed re-injection.
void loadStore();

export async function flush(): Promise<void> {
    if (!persistenceOn()) return;
    try {
        enforceCaps(data);
        await writeFile(LOG_FILE, JSON.stringify(data));
    } catch {
        /* ignore write failures */
    }
}

function scheduleFlush(): void {
    if (!persistenceOn()) return;
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => void flush(), 1000);
}

export function getChannelHistory(channelId: string): ChannelBucket {
    const b = data.channels[channelId];
    return b ? { deleted: [...b.deleted], edited: [...b.edited] } : { deleted: [], edited: [] };
}

export function recordDeleted(channelId: string, raw: any): void {
    const b = bucket(channelId);
    if (b.deleted.some(r => r.raw?.id === raw?.id)) return;
    b.deleted.push({ raw, deletedAt: Date.now() });
    enforceCaps(data); // bound memory even when persistence (flush) is off
    scheduleFlush();
}

export function recordEdit(channelId: string, raw: any, oldContent: string): void {
    const b = bucket(channelId);
    let rec = b.edited.find(r => r.currentMessageId === String(raw.id));
    if (!rec) {
        rec = { currentMessageId: String(raw.id), authorId: String(raw.author?.id ?? ""), channelId, raw, editHistory: [] };
        b.edited.push(rec);
    }
    rec.editHistory.push({ content: oldContent, timestamp: new Date().toISOString() });
    if (rec.editHistory.length > MAX_EDIT_HISTORY) rec.editHistory.splice(0, rec.editHistory.length - MAX_EDIT_HISTORY);
    rec.raw = raw;
    enforceCaps(data); // bound memory even when persistence (flush) is off
    scheduleFlush();
}

export function removeDeleted(channelId: string, messageId: string): void {
    const b = data.channels[channelId];
    if (!b) return;
    b.deleted = b.deleted.filter(r => r.raw?.id !== messageId);
    scheduleFlush();
}

export function clearEdits(channelId: string, messageId: string): void {
    const b = data.channels[channelId];
    if (!b) return;
    b.edited = b.edited.filter(r => r.currentMessageId !== messageId);
    scheduleFlush();
}
