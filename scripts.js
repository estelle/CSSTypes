/* js for CSS types */

import { definitionSyntax } from 'https://cdn.jsdelivr.net/npm/css-tree@3.2.1/dist/csstree.esm.js';

const data = await (await fetch('https://cdn.jsdelivr.net/npm/@webref/css@latest/css.json')).json();

const categories = ['properties', 'atrules', 'descriptors', 'functions', 'selectors'];
const result = new Object(null);
const reverse = new Map();
const edges = new Map();
const consumers = new Map();
populateResults();

const showResultsBtn = document.getElementById("showResults");
const resultsSection = document.querySelector("section");
const datatype = document.getElementById('datatype');
const typeInput = document.getElementById('type');
const typeList = document.getElementById('typeList');
const form = document.querySelector('form');
const lists = {
    properties: document.getElementById('propertyList'),
    atrules: document.getElementById('atruleList'),
    descriptors: document.getElementById('descriptorList'),
    functions: document.getElementById('functionList'),
    selectors: document.getElementById('selectorList'),
};
const messages = {
    properties: document.getElementById('noProperties'),
    atrules: document.getElementById('noAtrules'),
    descriptors: document.getElementById('noDescriptors'),
    functions: document.getElementById('noFunctions'),
    selectors: document.getElementById('noSelectors'),
};

for (const key in result) {
    if (!Object.hasOwn(result, key)) continue;

    const option = document.createElement('OPTION');
    option.setAttribute('value', key);
    option.innerText = key;
    typeList.appendChild(option);
}

showResultsBtn.addEventListener("click", showResults);
form.addEventListener("submit", function (e) {
    e.preventDefault();
    showResults();
});

function showResults() {
    const value = typeInput.value;
    datatype.innerText = value;

    const found = result[value] ?? {};

    for (const category of categories) {
        const list = lists[category];
        const message = messages[category];
        const items = found[category] ?? [];

        list.innerHTML = '';
        list.hidden = items.length === 0;
        message.hidden = items.length > 0;
        message.querySelector('code').innerText = value;

        for (const item of items) {
            const li = document.createElement('LI');
            li.innerText = item;

            list.appendChild(li);
        }
    }

    resultsSection.style.display = 'block';
}

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
        case 'selectors':
        case 'atrules':
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

function addResult(key, consumer) {
    let found = reverse.get(key);
    if (!found) {
        found = new Set();
        reverse.set(key, found);
    }
    found.add(consumer);
}

function addSyntax(from, syntax, selector) {
    if (!syntax) {
        return;
    }

    let definition;

    try {
        definition = definitionSyntax.parse(syntax);
    } catch {
        return;
    }

    definitionSyntax.walk(definition, {
        enter(node) {
            if (selector && node.type === 'Function' && node.name === selector) {
                return;
            }

            const to = referenceKey(node);
            if (!to || to === from) {
                return;
            }
            addEdge(from, to);
        },
    });
}

function atrulePrelude(syntax, name) {
    let prelude = syntax;

    if (prelude.startsWith(name)) {
        prelude = prelude.slice(name.length);
    }

    prelude = prelude.replace(/\{[^}]*\}/g, ' ');
    prelude = prelude.replace(/\[\s*\]\?/g, ' ');
    prelude = prelude.split(name).join(' ');
    prelude = prelude.replace(/;\s*$/, ' ');

    return prelude.trim();
}

function selectorName(name) {
    return name.replace(/^:+/, '').replace(/\(\)$/, '');
}

function collect(from) {
    const seen = new Set();
    const queue = [...(edges.get(from) ?? [])];

    while (queue.length > 0) {
        const key = queue.pop();
        if (seen.has(key) || key === from) {
            continue;
        }
        seen.add(key);

        if (key.endsWith('()')) {
            addResult(key, from);
            continue;
        }

        if (key.startsWith('<') && key.endsWith('>')) {
            addResult(key, from);
        }

        for (const next of edges.get(key) ?? []) {
            if (!seen.has(next)) {
                queue.push(next);
            }
        }
    }
}

function populateResults() {
    for (const category of ['properties', 'types', 'functions', 'selectors', 'atrules']) {
        for (const feature of data[category]) {
            const from = selfKey(category, feature.name);

            if (!edges.has(from)) {
                edges.set(from, new Set());
            }

            if (category === 'atrules') {
                addSyntax(from, atrulePrelude(feature.syntax ?? '', feature.name));

                for (const descriptor of feature.descriptors ?? []) {
                    const descriptorKey = `${feature.name} { ${descriptor.name} }`;

                    if (!edges.has(descriptorKey)) {
                        edges.set(descriptorKey, new Set());
                    }

                    addSyntax(descriptorKey, descriptor.syntax);
                }
            } else if (category === 'selectors') {
                addSyntax(from, feature.syntax, selectorName(feature.name));
            } else {
                addSyntax(from, feature.syntax);
            }
        }
    }

    for (const category of ['properties', 'functions', 'selectors']) {
        for (const feature of data[category]) {
            const from = selfKey(category, feature.name);
            consumers.set(from, category);
            collect(from);
        }
    }

    for (const atrule of data.atrules) {
        consumers.set(atrule.name, 'atrules');
        collect(atrule.name);

        for (const descriptor of atrule.descriptors ?? []) {
            const descriptorKey = `${atrule.name} { ${descriptor.name} }`;
            consumers.set(descriptorKey, 'descriptors');
            collect(descriptorKey);
        }
    }

    for (const key of [...reverse.keys()].sort()) {
        const found = [...reverse.get(key)].sort();

        result[key] = {
            properties: found.filter((consumer) => consumers.get(consumer) === 'properties'),
            atrules: found.filter((consumer) => consumers.get(consumer) === 'atrules'),
            descriptors: found.filter((consumer) => consumers.get(consumer) === 'descriptors'),
            functions: found.filter((consumer) => consumers.get(consumer) === 'functions'),
            selectors: found.filter((consumer) => consumers.get(consumer) === 'selectors'),
        };
    }
}
