import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

// Every published port must be bound to loopback on the host. A small line parser (no YAML dependency).
export function publishedPorts(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)ports:\s*$/.exec(lines[i]);
    if (!m) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const item = /^\s*-\s*["']?([^"'\s#]+)["']?/.exec(lines[j]);
      if (!item || lines[j].search(/\S/) <= m[1].length) break;
      out.push(item[1]);
    }
  }
  return out;
}
const here = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('docker-compose.yml publishes only on 127.0.0.1', () => {
  const ports = publishedPorts(here('docker-compose.yml'));
  assert.ok(ports.length > 0, 'the parser found the published port');
  for (const p of ports) assert.match(p, /^127\.0\.0\.1:/, `${p} must start with 127.0.0.1:`);
});

test('the parser flags an unbound or wildcard publish', () => {
  for (const bad of ['- "6700:6700"', '- "0.0.0.0:6700:6700"', '- 6700', '- "::1:6700:6700"']) {
    const ports = publishedPorts(`services:\n  a:\n    ports:\n      ${bad}\n`);
    assert.equal(ports.length, 1);
    assert.doesNotMatch(ports[0], /^127\.0\.0\.1:/);
  }
});

test('compose default host port and Dockerfile port are inside 6700-6849 and agree', () => {
  const compose = here('docker-compose.yml');
  const host = Number(/\$\{HOST_PORT:-(\d+)\}/.exec(compose)[1]);
  assert.ok(host >= 6700 && host <= 6849, `${host} outside 6700-6849`);
  assert.equal(Number(/EXPOSE (\d+)/.exec(here('Dockerfile'))[1]), host);
  for (const forbidden of [8080, 5173, 3900, 4000, 4400, 4510, 4600, 4601, 18080, 19080, 19090]) assert.notEqual(host, forbidden);
});

test('the container may call out only to the names listed in ALLOWED_HOSTS', () => {
  const compose = here('docker-compose.yml');
  const allowed = /^\s*ALLOWED_HOSTS:\s*(\S+)/m.exec(compose)[1].split(',');
  for (const key of ['PEP_URL', 'MINT_URL']) {
    const host = new URL(new RegExp(`${key}:\\s*(\\S+)`).exec(compose)[1]).hostname;
    assert.ok(allowed.includes(host), `${key} host ${host} must be in ALLOWED_HOSTS`);
  }
});

test('docker-compose.yml passes a usable SHELF_URL into the container (the shelf button needs it)', () => {
  assert.match(here('docker-compose.yml'), /^\s*SHELF_URL: \$\{SHELF_URL:-http:\/\/127\.0\.0\.1:4400\}\s*$/m);
});

test('docker-compose.yml allows the family lab-proxy name by default, never the bare launcher name', () => {
  const compose = fs.readFileSync(new URL('../docker-compose.yml', import.meta.url), 'utf8');
  assert.match(compose, /LAB_ALLOWED_HOSTS: \$\{LAB_ALLOWED_HOSTS:-worker-demo\.local\.ping-devops\.com\}\n/);
  assert.doesNotMatch(compose, /LAB_ALLOWED_HOSTS:[^\n]*[-,]local\.ping-devops\.com\b/);
});
