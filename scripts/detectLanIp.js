const os = require('os');

const VIRTUAL_NAME_PATTERN =
  /virtual|vpn|tap|tun|wsl|hyper-v|loopback|vethernet|docker|vmware|npcap/i;

function isVirtualInterfaceName(name) {
  return VIRTUAL_NAME_PATTERN.test(name);
}

function isPrivateIpv4(address) {
  if (address.startsWith('10.')) return true;
  if (address.startsWith('192.168.')) return true;
  const parts = address.split('.').map(Number);
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  return false;
}

function scorePrivateIpv4(address) {
  if (address.startsWith('192.168.')) return 0;
  if (address.startsWith('10.')) return 1;
  return 2;
}

function detectLanIp(options = {}) {
  const networkInterfaces = options.networkInterfaces ?? os.networkInterfaces;
  const interfaces = networkInterfaces();

  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (isVirtualInterfaceName(name)) continue;
    for (const entry of entries ?? []) {
      const family = entry.family === 'IPv4' || entry.family === 4;
      if (!family || entry.internal) continue;
      if (!isPrivateIpv4(entry.address)) continue;
      candidates.push({ name, address: entry.address });
    }
  }

  candidates.sort((a, b) => scorePrivateIpv4(a.address) - scorePrivateIpv4(b.address));

  return candidates[0]?.address ?? null;
}

module.exports = { detectLanIp, isVirtualInterfaceName, isPrivateIpv4 };
