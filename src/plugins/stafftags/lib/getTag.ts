import { rawColors } from "@api/ui/components/color";
import { findByProps } from "@metro";
import { constants } from "@metro/common";
import { GuildMemberStore } from "@metro/common/stores";
import chroma from "chroma-js";

import { useStaffTagsSettings } from "../storage";

const { computePermissions } = findByProps("computePermissions", "canEveryoneRole") ?? {};

// Discord's built-in author tags, by i18n key. We detect these to avoid replacing
// them with our own staff tag. Keys vary by Discord build: 344.13 resolves APP_TAG
// ("APP") and BOT_TAG_SERVER ("SERVER"); the rest are kept for older/other builds
// that still define them (they resolve to undefined and are filtered out otherwise).
const BUILT_IN_TAG_KEYS = [
    "APP_TAG",
    "BOT_TAG_BOT",
    "BOT_TAG_SERVER",
    "AI_TAG",
    "SYSTEM_DM_TAG_SYSTEM",
    "GUILD_AUTOMOD_USER_BADGE_TEXT",
    "REMIXING_TAG"
] as const;

// Cached result per key, including misses (undefined). Some of these Discord
// message keys are empty in newer builds (e.g. BOT_TAG_BOT); without caching the
// miss, intl.string() re-fires an "message has no value" warning on every single
// message render, flooding the log.
const messageCache = new Map<string, string | undefined>();

const getMessage = (key: string): string | undefined => {
    if (messageCache.has(key)) return messageCache.get(key);

    const props = findByProps("intl", "t");
    const runtimeHashMessageKey = findByProps("runtimeHashMessageKey", "MessageLoader")?.runtimeHashMessageKey;
    // Don't cache until Discord's i18n is ready, otherwise we'd permanently cache a miss.
    if (!props?.intl?.string || !props?.t || !runtimeHashMessageKey) return undefined;

    const value = props.t[runtimeHashMessageKey(key)];
    const resolved = (value ? props.intl.string(value) : undefined) || undefined;
    messageCache.set(key, resolved);
    return resolved;
};

let builtInTagsCache: string[] | undefined;
export const getBuiltInTags = (): string[] => {
    if (builtInTagsCache) return builtInTagsCache;

    const tags = BUILT_IN_TAG_KEYS
        .map(getMessage)
        .filter((x): x is string => Boolean(x));

    // Only memoize once i18n was ready (every key resolved to a definitive result).
    if (messageCache.size >= BUILT_IN_TAG_KEYS.length) builtInTagsCache = tags;
    return tags;
};

interface Tag {
    text: string
    textColor?: any
    backgroundColor?: any
    verified?: boolean | ((guild: any, channel: any, user: any) => boolean)
    condition?: (guild: any, channel: any, user: any) => boolean
    permissions?: string[]
}

const tags: Tag[] = [
    {
        text: "WEBHOOK",
        condition: (guild, channel, user) => user?.isNonUserBot?.() ?? false
    },
    {
        text: "OWNER",
        condition: (guild, channel, user) => guild?.ownerId === user?.id
    },
    {
        text: "ADMIN",
        permissions: ["ADMINISTRATOR"]
    },
    {
        text: "STAFF",
        permissions: ["MANAGE_GUILD", "MANAGE_CHANNELS", "MANAGE_ROLES", "MANAGE_WEBHOOKS"]
    },
    {
        text: "MOD",
        permissions: ["MANAGE_MESSAGES", "KICK_MEMBERS", "BAN_MEMBERS"]
    },
    {
        text: "VC Mod",
        permissions: ["MOVE_MEMBERS", "MUTE_MEMBERS", "DEAFEN_MEMBERS"]
    },
    {
        text: "Chat Mod",
        permissions: ["MODERATE_MEMBERS"]
    }
];

export default function getTag(guild: any, channel: any, user: any) {
    if (!guild || !user) return undefined;

    let permissions: string[] = [];
    if (computePermissions) {
        const permissionsInt = computePermissions({
            user: user,
            context: guild,
            overwrites: channel?.permissionOverwrites
        });
        const Permissions = constants?.Permissions;
        if (Permissions) {
            permissions = Object.entries(Permissions)
                .filter(([, permissionInt]) => (permissionsInt as bigint) & (permissionInt as bigint))
                .map(([permission]) => permission);
        }
    }

    const useRoleColor = useStaffTagsSettings.getState()?.useRoleColor ?? false;

    for (const tag of tags) {
        if (tag.condition?.(guild, channel, user) ||
            (!user.bot && tag.permissions?.some(perm => permissions?.includes(perm)))) {

            const roleColor = useRoleColor && GuildMemberStore ? GuildMemberStore.getMember(guild?.id, user.id)?.colorString : undefined;
            const backgroundColor = roleColor ? roleColor : tag.backgroundColor ?? rawColors?.BRAND_500 ?? "#5865F2";
            const textColor = (roleColor || !tag.textColor) ? (chroma(backgroundColor).get("lab.l") < 70 ? rawColors?.WHITE_500 ?? "#ffffff" : rawColors?.BLACK_500 ?? "#000000") : tag.textColor;

            return {
                ...tag,
                textColor,
                backgroundColor,
                verified: typeof tag.verified === "function" ? tag.verified(guild, channel, user) : tag.verified ?? false,
                condition: undefined,
                permissions: undefined
            };
        }
    }
}
