import { GuildPluginData } from "knub";
import { ExtendedMatchParams } from "knub/dist/config/PluginConfigManager";
import { CounterValue } from "../../../data/entities/CounterValue";
import { renderTemplate, TemplateSafeValue, TemplateSafeValueContainer } from "../../../templateFormatter";
import { renderRecursively, StrictMessageContent } from "../../../utils";
import { CountersPlugin } from "../../Counters/CountersPlugin";
import { TagsPluginType, TTag } from "../types";
import { findTagByName } from "./findTagByName";
import { counterValueToTemplateSafeCounterValue, TemplateSafeCounterValue } from "../../../utils/templateSafeObjects";

const MAX_TAG_FN_CALLS = 25;

export async function renderTagBody(
  pluginData: GuildPluginData<TagsPluginType>,
  body: TTag,
  args: TemplateSafeValue[] = [],
  extraData = {},
  subTagPermissionMatchParams?: ExtendedMatchParams,
  tagFnCallsObj = { calls: 0 },
): Promise<StrictMessageContent> {
  const dynamicVars = {};

  let countersPlugin: any;
  try {
    countersPlugin = pluginData.getPlugin(CountersPlugin);
  } catch (_) {
    // no counters plugin
  }

  const data = new TemplateSafeValueContainer({
    args,
    ...extraData,
    ...pluginData.state.tagFunctions,
    set(name, val) {
      if (typeof name !== "string") return;
      dynamicVars[name] = val;
    },
    setr(name, val) {
      if (typeof name !== "string") return "";
      dynamicVars[name] = val;
      return val;
    },
    get(name) {
      return dynamicVars[name] == null ? "" : dynamicVars[name];
    },
    async get_counter_value(counter, userId?, channelId?) {
      if (!countersPlugin) return "";
      if (!userId && !channelId) return "";
      const cData = await countersPlugin.getCounterValue(counter, channelId, userId);
      return cData?.toString() ?? "";
    },
    async get_all_counter_values(counter) {
      if (!countersPlugin) return "";
      const cData = (await countersPlugin.getAllCounterValues(counter))?.map((cd) =>
        counterValueToTemplateSafeCounterValue(cd),
      );
      return cData?.sort((a, b) => b.value - a.value) ?? [];
    },
    tag: async (name, ...subTagArgs) => {
      if (++tagFnCallsObj.calls > MAX_TAG_FN_CALLS) return "";
      if (typeof name !== "string") return "";
      if (name === "") return "";

      const subTagBody = await findTagByName(pluginData, name, subTagPermissionMatchParams);

      if (!subTagBody) {
        return "";
      }

      if (typeof subTagBody !== "string") {
        return "<embed>";
      }

      const rendered = await renderTagBody(
        pluginData,
        subTagBody,
        subTagArgs,
        extraData,
        subTagPermissionMatchParams,
        tagFnCallsObj,
      );
      return rendered.content!;
    },
  });

  if (typeof body === "string") {
    // Plain text tag
    return { content: await renderTemplate(body, data) };
  } else {
    // Embed
    return renderRecursively(body, (str) => renderTemplate(str, data));
  }
}
