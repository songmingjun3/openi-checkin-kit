/**
 * Standard Schema Config for the OpenI check-in plugin.
 *
 * Bundled locally because Node resolves ESM dependencies from a symlinked
 * workspace package's real path, outside the profile's node_modules. Cordis
 * calls Config['~standard'].validate(); Settings reads .dict and .meta.
 */
'use strict';

const DEFAULTS = { enabled: false, startTime: '09:00', endTime: '10:00' };
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const FIELDS = {
  enabled: {
    type: 'boolean',
    description: 'Run the daily OpenI check-in automatically.',
    volatile: true,
    validate(value) {
      return typeof value === 'boolean' ? undefined : 'expected boolean';
    },
  },
  startTime: {
    type: 'string',
    description: 'Start of the daily execution window (HH:MM, local time).',
    volatile: true,
    validate(value) {
      return typeof value === 'string' && TIME.test(value) ? undefined : 'expected HH:MM';
    },
  },
  endTime: {
    type: 'string',
    description: 'End of the daily random execution window (HH:MM, local time).',
    volatile: true,
    validate(value) {
      return typeof value === 'string' && TIME.test(value) ? undefined : 'expected HH:MM';
    },
  },
};

function field(name) {
  const spec = FIELDS[name];
  const schema = () => { throw new TypeError('Use Config["~standard"].validate()'); };
  schema.type = spec.type;
  schema.meta = { default: DEFAULTS[name], description: spec.description, volatile: true };
  schema.dict = undefined;
  schema.list = undefined;
  schema.inner = undefined;
  schema.default = () => schema;
  schema.volatile = () => schema;
  schema.description = value => { schema.meta.description = value; return schema; };
  schema.i18n = () => schema;
  return schema;
}

const STANDARD = {
  version: 1,
  vendor: 'dsh-openi-checkin',
  validate(value) {
    const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const issues = [];
    const result = {};
    for (const name of Object.keys(FIELDS)) {
      const input = raw[name] === undefined || raw[name] === null || raw[name] === '' ? DEFAULTS[name] : raw[name];
      const message = FIELDS[name].validate(input);
      if (message) issues.push({ message: `${name}: ${message}`, path: [name] });
      else result[name] = input;
    }
    return issues.length ? { issues } : { value: result };
  },
};

function Config(raw) {
  const result = STANDARD.validate(raw);
  if (result.issues) throw new TypeError(result.issues.map(issue => issue.message).join('; '));
  return result.value;
}

Config.type = 'object';
Config.meta = {};
Config.dict = {
  enabled: field('enabled'),
  startTime: field('startTime'),
  endTime: field('endTime'),
};
Config['~standard'] = STANDARD;
Config.default = () => Config;
Config.i18n = () => Config;
Config.description = value => { Config.meta.description = value; return Config; };

module.exports = { Config };
