
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";


export default function(pi: ExtensionAPI) {
  pi.registerTool({
    name: 'syscli',
    description: 'Calls a CLI that lists a lot of tools and pre-made commands, along with which resource (cpu, memory, disk etc) and type of analysis (saturation, utilization etc) that can be ran',
    label: 'CLI that lists possible commands to run analysis on',
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const {
        stdout,
        stderr,
        code,
      } = await pi.exec('syscli', []);

      return {
        content: [{ type: "text", text: `${stdout}` }],
        details: {}
      };
    },
  })
}
