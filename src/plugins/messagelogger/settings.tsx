import { findAssetId } from "@api/assets";
import SettingsTextInput from "@api/ui/components/SettingsTextInput";
import { findByProps } from "@metro";
import { Stack, TableRow, TableRowGroup, TableSwitchRow } from "@metro/common/components";
import React from "react";
import { ScrollView } from "react-native";

import { useMessageLoggerSettings } from "./storage";

const { Card } = findByProps("Card");

export default function MessageLoggerSettings() {
    const settings = useMessageLoggerSettings();
    const update = (patch: any) => useMessageLoggerSettings.getState().updateSettings(patch);

    return (
        <ScrollView style={{ flex: 1 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title="Deleted Messages">
                    <TableSwitchRow
                        label="Log deleted messages"
                        icon={<TableRow.Icon source={findAssetId("ic_eye_hidden")} />}
                        value={!!settings.deleted?.enabled}
                        onValueChange={v => update({ deleted: { ...settings.deleted, enabled: v } })}
                    />
                </TableRowGroup>

                <TableRowGroup title="Edited Messages">
                    <TableSwitchRow
                        label="Log edited messages"
                        icon={<TableRow.Icon source={findAssetId("ic_edit_24px")} />}
                        value={!!settings.edited?.enabled}
                        onValueChange={v => update({ edited: { ...settings.edited, enabled: v } })}
                    />
                </TableRowGroup>

                <TableRowGroup title="Persistence">
                    <TableSwitchRow
                        label="Keep history across restarts"
                        subLabel="Writes logs to disk and restores deleted/edited messages when you reopen a channel."
                        icon={<TableRow.Icon source={findAssetId("ic_download_24px")} />}
                        value={!!settings.persistence}
                        onValueChange={v => update({ persistence: v })}
                    />
                </TableRowGroup>

                <TableRowGroup title="Filters">
                    <TableSwitchRow
                        label="Ignore bots"
                        icon={<TableRow.Icon source={findAssetId("ic_close")} />}
                        value={!!settings.filters?.ignoreBots}
                        onValueChange={v => update({ filters: { ...settings.filters, ignoreBots: v } })}
                    />
                    <TableSwitchRow
                        label="Ignore my own edits"
                        icon={<TableRow.Icon source={findAssetId("ic_close")} />}
                        value={!!settings.filters?.ignoreSelfEdits}
                        onValueChange={v => update({ filters: { ...settings.filters, ignoreSelfEdits: v } })}
                    />
                    <TableSwitchRow
                        label="Ignore my own deletes"
                        icon={<TableRow.Icon source={findAssetId("ic_close")} />}
                        value={!!settings.filters?.ignoreSelfDeletes}
                        onValueChange={v => update({ filters: { ...settings.filters, ignoreSelfDeletes: v } })}
                    />
                </TableRowGroup>

                <TableRowGroup title="User ignore list">
                    <Card>
                        <SettingsTextInput
                            placeholder="User IDs to ignore, separated by spaces."
                            value={settings.ignoreLists.user}
                            onChange={(v: string) => update({ ignoreLists: { ...settings.ignoreLists, user: v.replaceAll(/[^0-9 ]/g, "") } })}
                            isClearable
                        />
                    </Card>
                </TableRowGroup>
                <TableRowGroup title="Channel ignore list">
                    <Card>
                        <SettingsTextInput
                            placeholder="Channel IDs to ignore, separated by spaces."
                            value={settings.ignoreLists.channel}
                            onChange={(v: string) => update({ ignoreLists: { ...settings.ignoreLists, channel: v.replaceAll(/[^0-9 ]/g, "") } })}
                            isClearable
                        />
                    </Card>
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}
