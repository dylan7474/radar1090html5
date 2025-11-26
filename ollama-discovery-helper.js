#!/usr/bin/env node
'use strict';

const http = require('http');
const os = require('os');

const DEFAULT_PORT = Number.parseInt(process.env.PORT || process.env.LISTEN_PORT || '8081', 10);
const DEFAULT_OLLAMA_PORT = Number.parseInt(process.env.OLLAMA_PORT || '11434', 10);
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.PROBE_TIMEOUT_MS || '2500', 10);
const DEFAULT_RESCAN_MS = Number.parseInt(process.env.RESCAN_INTERVAL_MS || `${2 * 60 * 1000}`, 10);
const DEFAULT_CONCURRENCY = Number.parseInt(process.env.PROBE_CONCURRENCY || '20', 10);
const DEFAULT_CIDR = process.env.SCAN_CIDR || null;
const DEFAULT_MAX_HOSTS = Number.parseInt(process.env.MAX_HOSTS || '512', 10);
const EXTRA_HOSTS = (process.env.EXTRA_HOSTS || '').split(',').map((h) => h.trim()).filter(Boolean);

const countBits = (n) => n.toString(2).split('1').length - 1;
const ipToInt = (ip) => ip.split('.').reduce((acc, octet) => (acc << 8) + Number.parseInt(octet, 10), 0) >>> 0;
const intToIp = (int) => [24, 16, 8, 0].map((shift) => (int >>> shift) & 0xff).join('.');

const netmaskToPrefix = (netmask) => countBits(ipToInt(netmask));

const isPrivate = (ip) => {
  if (!ip) return false;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number.parseInt(ip.split('.')[1], 10);
    return second >= 16 && second <= 31;
  }
  return false;
};

const parseArgs = (argv) => {
  const config = {
    port: DEFAULT_PORT,
    ollamaPort: DEFAULT_OLLAMA_PORT,
    cidr: DEFAULT_CIDR,
    rescanMs: DEFAULT_RESCAN_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    concurrency: DEFAULT_CONCURRENCY,
    maxHosts: DEFAULT_MAX_HOSTS,
    hosts: [...EXTRA_HOSTS],
    once: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--cidr') {
      config.cidr = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--port') {
      config.port = Number.parseInt(argv[i + 1], 10) || config.port;
      i += 1;
      continue;
    }
    if (arg === '--ollama-port') {
      config.ollamaPort = Number.parseInt(argv[i + 1], 10) || config.ollamaPort;
      i += 1;
      continue;
    }
    if (arg === '--rescan-ms') {
      config.rescanMs = Number.parseInt(argv[i + 1], 10) || config.rescanMs;
      i += 1;
      continue;
    }
    if (arg === '--timeout-ms') {
      config.timeoutMs = Number.parseInt(argv[i + 1], 10) || config.timeoutMs;
      i += 1;
      continue;
    }
    if (arg === '--concurrency') {
      config.concurrency = Math.max(1, Number.parseInt(argv[i + 1], 10) || config.concurrency);
      i += 1;
      continue;
    }
    if (arg === '--max-hosts') {
      config.maxHosts = Math.max(1, Number.parseInt(argv[i + 1], 10) || config.maxHosts);
      i += 1;
      continue;
    }
    if (arg === '--hosts') {
      const extra = (argv[i + 1] || '')
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean);
      config.hosts.push(...extra);
      i += 1;
      continue;
    }
    if (arg === '--once') {
      config.once = true;
      continue;
    }
  }

  return config;
};

const printUsage = () => {
  console.log(`Ollama LAN discovery helper\n\n` +
    `Usage: node ollama-discovery-helper.js [--cidr 192.168.50.0/24] [--hosts 192.168.50.10,192.168.50.11]\\\n` +
    `       [--port 8081] [--ollama-port 11434] [--timeout-ms 2500] [--rescan-ms 120000] [--concurrency 20] [--max-hosts 512] [--once]\n\n` +
    `Environment overrides:\n` +
    `  LISTEN_PORT / PORT   Port to serve the discovery feed (default 8081)\n` +
    `  OLLAMA_PORT          Port to probe for Ollama (default 11434)\n` +
    `  SCAN_CIDR            CIDR range to scan if --cidr not set\n` +
    `  EXTRA_HOSTS          Comma-separated host list added to the probe set\n` +
    `  RESCAN_INTERVAL_MS   How often to rescan when running the server (default 120000)\n` +
    `  PROBE_TIMEOUT_MS     Per-host timeout when calling /api/tags (default 2500)\n` +
    `  PROBE_CONCURRENCY    Parallel probes to run at once (default 20)\n` +
    `  MAX_HOSTS            Maximum hosts to probe per scan (default 512)\n`);
};

const parseCidr = (cidr) => {
  if (!cidr) return null;
  const match = cidr.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
  if (!match) return null;
  const [, ip, prefixRaw] = match;
  const prefix = Number.parseInt(prefixRaw, 10);
  if (prefix < 0 || prefix > 32) return null;
  return { ip, prefix };
};

const expandCidr = (cidr) => {
  const parsed = parseCidr(cidr);
  if (!parsed) return [];
  const baseInt = ipToInt(parsed.ip);
  const mask = parsed.prefix === 0 ? 0 : ((0xffffffff << (32 - parsed.prefix)) >>> 0);
  const network = baseInt & mask;
  const broadcast = network | (~mask >>> 0);
  const hosts = [];
  for (let current = network + 1; current < broadcast; current += 1) {
    hosts.push(intToIp(current));
  }
  return hosts;
};

const deriveDefaultCidr = () => {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (!isPrivate(entry.address)) continue;
      const prefix = entry.cidr ? Number.parseInt(entry.cidr.split('/')[1], 10) : netmaskToPrefix(entry.netmask);
      if (Number.isNaN(prefix)) continue;
      return `${entry.address}/${prefix}`;
    }
  }
  return null;
};

const mapWithConcurrency = async (items, limit, task) => {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 1 }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      // eslint-disable-next-line no-await-in-loop
      results.push(await task(current));
    }
  });
  await Promise.all(workers);
  return results;
};

const probeHost = async (host, config) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const start = Date.now();
  const base = `http://${host}:${config.ollamaPort}`;
  try {
    const resp = await fetch(`${base}/api/tags`, { signal: controller.signal });
    const latencyMs = Date.now() - start;
    if (resp.ok) {
      return { url: base, latencyMs };
    }
    return null;
  } catch (err) {
    // Ignore individual probe failures to keep output focused on discovered hosts.
  } finally {
    clearTimeout(timer);
  }
  return null;
};

const uniqueHosts = (hosts) => {
  const seen = new Set();
  const filtered = [];
  hosts.forEach((host) => {
    if (!host || seen.has(host)) return;
    seen.add(host);
    filtered.push(host);
  });
  return filtered;
};

const discoverOllamaHosts = async (config) => {
  const cidr = config.cidr || deriveDefaultCidr();
  const hostsFromCidr = cidr ? expandCidr(cidr) : [];
  let candidates = uniqueHosts([...hostsFromCidr, ...config.hosts]);
  if (candidates.length > config.maxHosts) {
    console.warn(`Host list trimmed from ${candidates.length} to ${config.maxHosts}. Override with --max-hosts if needed.`);
    candidates = candidates.slice(0, config.maxHosts);
  }
  if (!candidates.length) {
    console.warn('No hosts to probe. Provide --cidr or --hosts.');
    return { endpoints: [], meta: { cidr: cidr || 'unknown', probed: 0, durationMs: 0 } };
  }

  console.log(`Probing ${candidates.length} host(s) for Ollama on port ${config.ollamaPort}...`);
  const started = Date.now();
  const responses = await mapWithConcurrency(candidates, config.concurrency, async (host) => ({
    host,
    result: await probeHost(host, config),
  }));
  const endpoints = responses
    .map((entry) => entry.result)
    .filter(Boolean)
    .sort((a, b) => (a.latencyMs || 0) - (b.latencyMs || 0));
  const failures = candidates.length - endpoints.length;
  const durationMs = Date.now() - started;
  if (endpoints.length) {
    const prettyList = endpoints
      .map((endpoint) => `${endpoint.url}${endpoint.latencyMs != null ? ` (${endpoint.latencyMs}ms)` : ''}`)
      .join(', ');
    console.log(`Discovered ${endpoints.length} Ollama host(s): ${prettyList}`);
  } else {
    console.warn('No Ollama hosts discovered.');
  }
  console.log(`Finished probe: ${endpoints.length} responsive, ${failures} unreachable in ${durationMs}ms.`);
  return {
    endpoints,
    meta: {
      cidr: cidr || 'unknown',
      probed: candidates.length,
      responsive: endpoints.length,
      unreachable: failures,
      durationMs,
      completedAt: new Date().toISOString(),
    },
  };
};

const startServer = (config) => {
  let latestPayload = { endpoints: [], meta: { cidr: config.cidr || deriveDefaultCidr() || 'unknown', probed: 0, durationMs: 0, completedAt: null } };

  const refresh = async () => {
    latestPayload = await discoverOllamaHosts(config);
  };

  refresh();
  setInterval(refresh, config.rescanMs);

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      });
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      res.writeHead(405, { 'Access-Control-Allow-Origin': '*' });
      res.end('Method Not Allowed');
      return;
    }

    if (['/ollama/discovery', '/ollama/hosts', '/ollama-discovery.json'].includes(req.url)) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(latestPayload));
      return;
    }

    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ status: 'ok', lastScan: latestPayload.meta?.completedAt || null }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end('Ollama LAN discovery helper\nPaths: /ollama/discovery, /ollama/hosts, /ollama-discovery.json\n');
  });

  server.listen(config.port, () => {
    console.log(`Discovery feed available on port ${config.port} (paths: /ollama/discovery, /ollama/hosts, /ollama-discovery.json)`);
  });
};

const main = () => {
  const config = parseArgs(process.argv);
  if (!config.cidr) {
    config.cidr = deriveDefaultCidr();
  }

  if (config.once) {
    discoverOllamaHosts(config)
      .then((payload) => {
        console.log(JSON.stringify(payload, null, 2));
        process.exit(0);
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
    return;
  }

  startServer(config);
};

main();
