const { detectLanIp, isVirtualInterfaceName } = require('./detectLanIp');

describe('isVirtualInterfaceName', () => {
  it('flags VPN and virtual adapters', () => {
    expect(isVirtualInterfaceName('vEthernet (WSL)')).toBe(true);
    expect(isVirtualInterfaceName('OpenVPN TAP-Windows6')).toBe(true);
    expect(isVirtualInterfaceName('Wi-Fi')).toBe(false);
  });
});

describe('detectLanIp', () => {
  it('prefers private IPv4 on a non-virtual interface', () => {
    const ip = detectLanIp({
      networkInterfaces: () => ({
        'Wi-Fi': [{ family: 'IPv4', internal: false, address: '192.168.1.42' }],
        'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.24.0.1' }],
      }),
    });
    expect(ip).toBe('192.168.1.42');
  });

  it('returns null when only virtual adapters exist', () => {
    const ip = detectLanIp({
      networkInterfaces: () => ({
        'OpenVPN TAP': [{ family: 'IPv4', internal: false, address: '10.8.0.2' }],
      }),
    });
    expect(ip).toBeNull();
  });
});
