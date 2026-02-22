import net from 'net';

const listenHost = process.env.CDP_BRIDGE_LISTEN_HOST || '0.0.0.0';
const listenPort = Number(process.env.CHROME_CDP_BRIDGE_PORT || process.env.CDP_BRIDGE_LISTEN_PORT || 9334);
const targetHost = process.env.CHROME_CDP_TARGET_HOST || '127.0.0.1';
const targetPort = Number(process.env.CHROME_CDP_PORT || process.env.CDP_BRIDGE_TARGET_PORT || 9222);

if (!Number.isInteger(listenPort) || listenPort < 1 || listenPort > 65535) {
  console.error(`[cdp-bridge] Invalid listen port: ${listenPort}`);
  process.exit(1);
}
if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
  console.error(`[cdp-bridge] Invalid target port: ${targetPort}`);
  process.exit(1);
}

const server = net.createServer((client) => {
  const upstream = net.connect(targetPort, targetHost);

  client.pipe(upstream);
  upstream.pipe(client);

  const closeBoth = () => {
    if (!client.destroyed) client.destroy();
    if (!upstream.destroyed) upstream.destroy();
  };

  client.on('error', closeBoth);
  upstream.on('error', closeBoth);
});

server.on('error', (err) => {
  console.error('[cdp-bridge] Server error:', err);
  process.exit(1);
});

server.listen(listenPort, listenHost, () => {
  console.log(
    `[cdp-bridge] listening on ${listenHost}:${listenPort}, forwarding to ${targetHost}:${targetPort}`,
  );
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
