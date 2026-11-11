import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { defineTool } = require('./lib/tool.cjs');

const tool = defineTool({
  name: 'x',
  description: 'd',
  parameters: {
    action: { type: 'string', required: true },
    accounts: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } } },
    },
  },
  output: { schema: { type: 'object', additionalProperties: true, properties: {} } },
  async execute() { return {}; },
});

assert.equal(tool.parameters.type, 'object');
assert.equal(tool.parameters.additionalProperties, false);
assert.deepEqual(tool.parameters.required, ['action']);
assert.equal(tool.parameters.properties.accounts.type, 'array');
const item = tool.parameters.properties.accounts.items;
assert.equal(item.type, 'object');
assert.equal(item.additionalProperties, false, 'nested object must declare additionalProperties');
assert.equal(item.properties.id.type, 'string');
console.log('tool schema OK:', JSON.stringify(item));
