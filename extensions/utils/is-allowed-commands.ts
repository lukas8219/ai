import parse from 'bash-parser';
const allowedList = [
	'which',
	"ls",
	"find",
	"cat",
	"tree",
	"less",
	"tail",
	"head",
	"grep",
	"awk",
	"sed",
	"cut",
	"sort",
	"uniq",
	"diff",
	"head",
	"tail",
	"journalctl",
	"dmesg",
	"lsof",
	"ps",
	"top",
	"htop",
	"stat",
	"file",
	"strings",
	"hexdump",
	"xxd",
	"zcat",
	"gunzip",
	"gzip",
	"rmq_log_analysis",
	"which",
	"pidof",
	"vmstat",
	"free",
	"du",
	"df",
	"pidstat",
	"sar",
	"iostat",
	"iotop",
	"mpstat",
	"nestat",
	'journalctl',
]
export const allowedCommands = new Set(allowedList);

export function isAllowedCommand(command) {
	const ast = parse(command);
	const executedCommands = bfs(ast);
	// There shouldn't be any difference in the commands. If we intersect then, it means executed command is a superset out of 
	const isAllowed = executedCommands.isSubsetOf(allowedCommands);
	return {
		isAllowed,
		executedCommands,
	}
}

function bfs(ast): Set<string> {
	const q = [];
	const visited = new Set();
	q.push(...ast.commands)

	while (q.length) {
		const astNode = q.shift();
		console.log(astNode);
		if (Array.isArray(astNode)) {
			q.push(...astNode);
			continue;
		}
		if (astNode.type === 'Command') {
			visited.add(astNode.name.text)
			if (astNode.name.text === 'xargs') {
				//Not a easy/safe way to handle xargs. So better to allow usage but very restricted (aka, almost no flags etc)
				// We can make it better by grouping the suffix, joining then, parsing again and applying the same logic
				// Too much for now
				visited.add(new Set([astNode.suffix.map((s => s.text))]));
			}
		}
		q.push(...astNode.commands || [])
	}

	return visited;
}
