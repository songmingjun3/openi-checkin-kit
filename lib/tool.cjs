/**
 * Convert the plugin's compact tool declaration into the registry's raw
 * ToolDefinition shape. Bundled locally because a symlink-installed workspace
 * package resolves ESM imports from its real path, outside the profile's
 * node_modules.
 *
 * The registry refuses an object schema that omits `additionalProperties`, so
 * every object node — including nested array items — is completed here.
 */
'use strict';

function completeObject(node) {
  if (node === null || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(completeObject);
  const copy = {};
  for (const [key, value] of Object.entries(node)) copy[key] = completeObject(value);
  if (!copy.type && (copy.properties || copy.additionalProperties !== undefined)) copy.type = 'object';
  if (copy.type === 'object' && copy.additionalProperties === undefined && !copy.properties) copy.additionalProperties = true;
  if (copy.type === 'object' && copy.additionalProperties === undefined && copy.properties) copy.additionalProperties = false;
  return copy;
}

function jsonSchema(parameters) {
  const properties = {};
  const required = [];
  for (const [name, field] of Object.entries(parameters ?? {})) {
    properties[name] = completeObject(Object.fromEntries(Object.entries(field)
      .filter(([key]) => key !== 'required')));
    if (field.required) required.push(name);
  }
  return {
    type: 'object',
    properties,
    additionalProperties: false,
    ...required.length ? { required } : {},
  };
}

function defineTool(definition) {
  const { parameters, output, ...rest } = definition;
  return {
    ...rest,
    parameters: jsonSchema(parameters),
    output: {
      ...output,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
  };
}

module.exports = { defineTool };
