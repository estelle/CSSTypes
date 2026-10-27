/* js for CSS types */

import { definitionSyntax } from 'https://cdn.jsdelivr.net/npm/css-tree@3.2.1/dist/csstree.esm.js';

const data = await (await fetch('https://cdn.jsdelivr.net/npm/@webref/css@latest/css.json')).json();

const result = new Object(null);
const reverse = new Map();
const edges = new Map();
populateResults();

const showResultsBtn = document.getElementById("showResults");
const resultsSection = document.querySelector("section");
const datatype = document.getElementById('datatype');
const selection = document.getElementById("select");
const list = document.getElementById('resultList');

for (const key in result) {
    if (!Object.hasOwn(result, key)) continue;

    const option = document.createElement('OPTION');
    option.setAttribute('value', key);
    option.innerText = key;
    selection.appendChild(option);
}

showResultsBtn.addEventListener("click", function (e) {
    if (selection.value === "line-style") {
        resultsSection.style.display = "block";
    }

    const value = selection.value;
    datatype.innerText = value;

    const props = result[value] ?? [];

    list.innerHTML = '';

    for (let i = 0; i < props.length; i++) {
        const li = document.createElement('LI');
        li.innerText = props[i];

        list.appendChild(li);
    }

    resultsSection.style.display = 'block';
});

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

function addEdge(from, to) {
    let targets = edges.get(from);
    if (!targets) {
        targets = new Set();
        edges.set(from, targets);
    }
    targets.add(to);
}

function addResult(key, property) {
    let properties = reverse.get(key);
    if (!properties) {
        properties = new Set();
        reverse.set(key, properties);
    }
    properties.add(property);
}

function populateResults() {
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

    for (const key of [...reverse.keys()].sort()) {
        result[key] = [...reverse.get(key)].sort();
    }
}
