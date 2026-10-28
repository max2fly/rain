import { UserStore } from "@metro/common/stores";

import { useMessageLoggerSettings } from "../storage";

function parseIds(list: string | undefined): string[] {
    return (list ?? "").split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

// Whether a message should be skipped (not logged) for the given action.
export function shouldIgnore(message: any, kind: "delete" | "edit"): boolean {
    try {
        const s = useMessageLoggerSettings.getState();
        const author = message?.author;
        const authorId = author?.id ? String(author.id) : "";
        const channelId = message?.channel_id ?? message?.channelId;

        if (s.filters?.ignoreBots && author?.bot) return true;

        const myId = UserStore.getCurrentUser?.()?.id;
        if (myId && authorId === String(myId)) {
            if (kind === "edit" && s.filters?.ignoreSelfEdits) return true;
            if (kind === "delete" && s.filters?.ignoreSelfDeletes) return true;
        }

        if (authorId && parseIds(s.ignoreLists?.user).includes(authorId)) return true;
        if (channelId && parseIds(s.ignoreLists?.channel).includes(String(channelId))) return true;

        return false;
    } catch {
        return false;
    }
}
