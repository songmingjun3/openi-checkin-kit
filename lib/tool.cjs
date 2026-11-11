/**
 * Convert the plugin's compact tool declaration into the registry's raw
 * ToolDefinition shape. Bundled locally because a symlink-installed workspace
 * package resolves ESM imports from its real path, outside the profile's
 * node_modules.
 */
'use strict';

function jsonSchema(parameters) {
  const properties = {};
  const required = [];
  for (const [name, field] of Object.entries(parameters ?? {})) {
    properties[name] = Object.fromEntries(Object.entries(field)
      .filter(([key]) => key !== 'required'));
    if (field.required) required.push(name);
  }
  return {
    type: 'object',
    properties,
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
