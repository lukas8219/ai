import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { formatDate, parse, isMatch } from 'date-fns'
import { executeSafeCommandInContext } from "./utils/ssh-utils";

const SystemDFormat = 'yyyy-MM-dd HH:mm:ss'

const LogSearchParams = Type.Object({
	since: Type.String({ format: 'date-time', description: `A timestamp to be used for filtering following the format ${SystemDFormat}` }),
	until: Type.String({ format: 'date-time', description: `A timestamp to be used for filtering following the format ${SystemDFormat}` }),
	regex: Type.String({ description: "Optional description shown below label" })
})


function formatDateAsSystemDFormat(dateString: string) {
	const date = new Date(dateString);
	return formatDate(date, SystemDFormat);
}


export default function(pi: ExtensionAPI) {
	pi.registerTool({
		name: "logSearch",
		label: "logSearch",
		description:
			"Use this to search for logs within RabbitMQ.",
		parameters: LogSearchParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const {
				since,
				until,
				regex,
			} = params;

			const sanitize = (p) => `"${p}"`

			const command = [
				'journalctl',
				'-u', 'rabbitmq-server',
				'--since', sanitize(formatDateAsSystemDFormat(since)),
				'--until', sanitize(formatDateAsSystemDFormat(until)),
				'-g', sanitize(regex),
			].join(' ');

			const data = [];
			const result = await executeSafeCommandInContext(pi, command, { signal: _signal, onData: data.push.bind(data), timeout: 5000 })
			const stdout = Buffer.concat(data);


			// Need to investigate why the error path is not good. It says it "worked" even tho it failed
			if (result.exitCode !== 0) {
				return {
					content: [{ type: 'text', text: `Error: running ${command} ${result.exitCode} - ${stdout}` }],
					details: { isError: true },
					isError: true,
					toolCallId: _toolCallId,
				}
			}
			return {
				content: [{ type: "text", text: stdout.toString() }],
				details: {}
			};
		}
	})
}
