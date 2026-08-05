const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMongoUri } = require('../src/config/db').__test;

test('MongoDB direct-host fallback preserves credentials without requiring SRV DNS', () => {
  const previous = {
    MONGO_URI: process.env.MONGO_URI,
    MONGO_DIRECT_HOSTS: process.env.MONGO_DIRECT_HOSTS,
    MONGO_REPLICA_SET: process.env.MONGO_REPLICA_SET,
    MONGO_AUTH_SOURCE: process.env.MONGO_AUTH_SOURCE,
    DB_NAME: process.env.DB_NAME
  };
  Object.assign(process.env, {
    MONGO_URI: 'mongodb+srv://crm-user:p%40ss@cluster.example.net/?appName=CRM',
    MONGO_DIRECT_HOSTS: 'shard-00.example.net:27017,shard-01.example.net:27017',
    MONGO_REPLICA_SET: 'atlas-example-shard-0',
    MONGO_AUTH_SOURCE: 'admin',
    DB_NAME: 'crm'
  });
  const uri = buildMongoUri();
  assert.match(uri, /^mongodb:\/\/crm-user:p%40ss@shard-00\.example\.net:27017,shard-01\.example\.net:27017\/crm\?/);
  assert.match(uri, /replicaSet=atlas-example-shard-0/);
  assert.match(uri, /authSource=admin/);
  Object.entries(previous).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
});
