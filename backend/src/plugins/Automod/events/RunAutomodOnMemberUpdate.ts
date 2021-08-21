import { typedGuildEventListener } from "knub";
import diff from "lodash.difference";
import isEqual from "lodash.isequal";
import { runAutomod } from "../functions/runAutomod";
import { AutomodContext, AutomodPluginType } from "../types";

export const RunAutomodOnMemberUpdate = typedGuildEventListener<AutomodPluginType>()({
  event: "guildMemberUpdate",
  listener({ pluginData, args: { oldMember, newMember } }) {
    if (!oldMember) return;
    const oldRoles = oldMember.roles.cache.map(r => r.id);
    const newRoles = newMember.roles.cache.map(r => r.id);
    if (isEqual(oldRoles, newRoles)) return;

    const oldRoles = [...oldMember.roles.cache.keys()];
    const newRoles = [...newMember.roles.cache.keys()];

    if (isEqual(oldRoles, newRoles)) return;

    const addedRoles = diff(oldRoles, newRoles);
    const removedRoles = diff(newRoles, oldRoles);

    if (addedRoles.length || removedRoles.length) {
      const context: AutomodContext = {
        timestamp: Date.now(),
        user: newMember.user,
        member: newMember,
        rolesChanged: {
          added: addedRoles,
          removed: removedRoles,
        },
      };

      pluginData.state.queue.add(() => {
        runAutomod(pluginData, context);
      });
    }
  },
});
