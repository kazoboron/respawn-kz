/**
 * Just test the connection — don't run any SQL.
 */
import { exit, env } from 'node:process';
import pg from 'pg';

const { Client } = pg;

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL required');
  exit(1);
}

const url = new URL(env.DATABASE_URL);
const config = {
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  host: url.hostname,
  port: Number(url.port) || 5432,
  database: url.pathname.replace(/^\//, '') || 'postgres',
  ssl: { rejectUnauthorized: false },
};

console.log('Trying:');
console.log('  user:', config.user);
console.log('  host:', config.host);
console.log('  port:', config.port);
console.log('  database:', config.database);
console.log('  password length:', config.password.length, 'chars');
console.log('  password preview:', config.password.slice(0, 3) + '***' + config.password.slice(-2));

const client = new Client(config);
try {
  await client.connect();
  console.log('✓ Connected');
  const r = await client.query('select current_user, current_database(), version()');
  console.table(r.rows);
} catch (err) {
  console.error('✗ Failed:', err.message);
  console.error('  code:', err.code);
} finally {
  await client.end();
}
