import { GuildMemberEditData, Permissions } from "discord.js";
import intersection from "lodash.intersection";
import { memberToTemplateSafeMember } from "../../../utils/templateSafeObjects";
import { LogType } from "../../../data/LogType";
import { canAssignRole } from "../../../utils/canAssignRole";
import { getMissingPermissions } from "../../../utils/getMissingPermissions";
import { memberRolesLock } from "../../../utils/lockNameHelpers";
import { missingPermissionError } from "../../../utils/missingPermissionError";
import { LogsPlugin } from "../../Logs/LogsPlugin";
import { persistEvt } from "../types";

const p = Permissions.FLAGS;

export const LoadDataEvt = persistEvt({
  event: "guildMemberAdd",

  async listener(meta) {
    const member = meta.args.member;
    const pluginData = meta.pluginData;

    const memberRoleLock = await pluginData.locks.acquire(memberRolesLock(member));

    const persistedData = await pluginData.state.persistedData.find(member.id);
    if (!persistedData) {
      memberRoleLock.unlock();
      return;
    }

    const toRestore: GuildMemberEditData = {};
    const config = await pluginData.config.getForMember(member);
    const restoredData: string[] = [];

    // Check permissions
    const me = pluginData.guild.members.cache.get(pluginData.client.user!.id)!;
    let requiredPermissions = 0n;
    if (config.persist_nicknames) requiredPermissions |= p.MANAGE_NICKNAMES;
    if (config.persisted_roles) requiredPermissions |= p.MANAGE_ROLES;
    const missingPermissions = getMissingPermissions(me.permissions, requiredPermissions);
    if (missingPermissions) {
      pluginData.getPlugin(LogsPlugin).logBotAlert({
        body: `Missing permissions for persist plugin: ${missingPermissionError(missingPermissions)}`,
      });
      return;
    }

    const guildRoles = Array.from(
      pluginData.guild.roles.cache
        .filter(
          (r) => r.id !== pluginData.guild.id && !r.managed && (canAssignRole(pluginData.guild, me, r.id) ?? false),
        )
        .keys(),
    );

    // Check specific role permissions
    if (config.persisted_roles) {
      for (const roleId of config.persisted_roles) {
        if (!canAssignRole(pluginData.guild, me, roleId) && guildRoles.includes(roleId)) {
          pluginData.getPlugin(LogsPlugin).logBotAlert({
            body: `Missing permissions to assign role \`${roleId}\` in persist plugin`,
          });
          return;
        }
      }
    }

    const persistedRoles = config.persisted_roles;
    if (persistedRoles.length >= 0) {
      const rolesToRestore =
        persistedRoles.length === 0
          ? intersection(persistedData.roles, guildRoles)
          : intersection(persistedRoles, persistedData.roles, guildRoles);

      if (rolesToRestore.length) {
        restoredData.push("roles");
        toRestore.roles = Array.from(new Set([...rolesToRestore, ...member.roles.cache.keys()]));
      }
    }

    if (config.persist_nicknames && persistedData.nickname) {
      restoredData.push("nickname");
      toRestore.nick = persistedData.nickname;
    }

    if (restoredData.length) {
      await member.edit(toRestore, "Restored upon rejoin");
      await pluginData.state.persistedData.clear(member.id);

      pluginData.getPlugin(LogsPlugin).logMemberRestore({
        member,
        restoredData: restoredData.join(", "),
      });
    }

    memberRoleLock.unlock();
  },
});
