import { createPluginStore } from "@api/storage";

export interface MessageLoggerSettings {
    deleted: {
        enabled: boolean;
    };
    edited: {
        enabled: boolean;
    };
    // When off, history is kept in memory for the session only (no disk write / restore).
    persistence: boolean;
    filters: {
        ignoreBots: boolean;
        ignoreSelfEdits: boolean;
        ignoreSelfDeletes: boolean;
    };
    ignoreLists: {
        user: string;
        channel: string;
    };
}

export const {
    useStore: useMessageLoggerSettings,
    settings: messageLoggerSettings,
} = createPluginStore<MessageLoggerSettings>("messagelogger", {
    deleted: {
        enabled: true,
    },
    edited: {
        enabled: true,
    },
    persistence: false,
    filters: {
        ignoreBots: false,
        ignoreSelfEdits: true,
        ignoreSelfDeletes: false,
    },
    ignoreLists: {
        user: "",
        channel: "",
    },
});
