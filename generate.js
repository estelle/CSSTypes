import css from '@webref/css';
import { definitionSyntax } from 'css-tree';

// Build a reverse map of the form:
//
//   {
//     "<type>": ["property", ...],
//     "function()": ["property", ...]
//   }
//
// A property is included when the type or function can appear in its value
// grammar, directly or through other types/properties.
//
// Function arguments are intentionally not traversed: a property that accepts
// `rgb()` does not thereby accept every type that `rgb()` accepts.
//
// Note that this only reflects the grammars published in webref. Functions
// that are allowed in every value by CSS itself (`var()`, `env()`, `calc()`,
// ...) are generally not mentioned in those grammars and therefore do not
// show up here.

const data = await css.listAll();

/**
 * Turn a definition-syntax reference into the key used by the graph.
 *
 * webref names:
 *   properties: `width`
 *   types:      `length`      (no angle brackets)
 *   functions:  `rgb()`       (with parentheses)
 *
 * css-tree nodes:
 *   Property:   name `width`
 *   Type:       name `length` (or `rgb()` for `<rgb()>` references)
 *   Function:   name `rgb`    (no parentheses)
 */
function referenceKey(node) {
	switch (node.type) {
		case 'Property':
			return node.name;
		case 'Type':
			return node.name.endsWith('()') ? node.name : `<${node.name}>`;
		case 'Function':
			return node.name.endsWith('()') ? node.name : `${node.name}()`;
		default:
			return null;
	}
}

function selfKey(category, name) {
	switch (category) {
		case 'properties':
			return name;
		case 'types':
			return `<${name}>`;
		case 'functions':
			return name;
		default:
			return null;
	}
}

/** @type {Map<string, Set<string>>} */
const edges = new Map();

function addEdge(from, to) {
	let targets = edges.get(from);
	if (!targets) {
		targets = new Set();
		edges.set(from, targets);
	}
	targets.add(to);
}

for (const category of ['properties', 'types', 'functions']) {
	for (const feature of data[category]) {
		const from = selfKey(category, feature.name);

		// Make sure the node exists even when it has no syntax.
		if (!edges.has(from)) {
			edges.set(from, new Set());
		}

		if (!feature.syntax) {
			continue;
		}

		definitionSyntax.walk(definitionSyntax.parse(feature.syntax), {
			enter(node) {
				const to = referenceKey(node);
				if (!to || to === from) {
					return;
				}
				addEdge(from, to);
			},
		});
	}
}

/** @type {Map<string, Set<string>>} */
const reverse = new Map();

function addResult(key, property) {
	let properties = reverse.get(key);
	if (!properties) {
		properties = new Set();
		reverse.set(key, properties);
	}
	properties.add(property);
}

for (const property of data.properties) {
	const start = selfKey('properties', property.name);
	const seen = new Set();
	const queue = [...(edges.get(start) ?? [])];

	while (queue.length > 0) {
		const key = queue.pop();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);

		if (key.endsWith('()')) {
			// A function is accepted as a value, but its arguments belong to the
			// function's own grammar, not to the property's grammar.
			addResult(key, property.name);
			continue;
		}

		if (key.startsWith('<') && key.endsWith('>')) {
			addResult(key, property.name);
		}

		// Types and property references are expanded. Plain property names are
		// traversed but do not themselves appear in the reverse map.
		for (const next of edges.get(key) ?? []) {
			if (!seen.has(next)) {
				queue.push(next);
			}
		}
	}
}

const result = {};
for (const key of [...reverse.keys()].sort()) {
	result[key] = [...reverse.get(key)].sort();
}

// Optional query:
//
//   node scripts/collect-b.mjs '<length>'
//   node scripts/collect-b.mjs length
//   node scripts/collect-b.mjs rgb
//
// Without an argument, the complete reverse map is written to stdout.
const query = process.argv[2];
if (query === undefined) {
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
	const candidates = [query, `<${query}>`, `${query}()`];
	const key = candidates.find((candidate) => Object.hasOwn(result, candidate));

	if (!key) {
		process.stderr.write(`No property accepts ${query}\n`);
		process.exitCode = 1;
	} else {
		process.stdout.write(`${JSON.stringify(result[key], null, 2)}\n`);
	}
}
