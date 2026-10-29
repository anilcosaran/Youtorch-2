// Package egress builds HTTP clients for URLs we don't control: provider
// output files now, webhook deliveries later. A provider (or whoever controls
// a URL in its output) must not be able to make us fetch from our own network,
// so the client only speaks http and https, follows at most MaxRedirects
// redirects, never goes through a proxy, and only connects to public
// addresses. The address is checked when the connection is dialed, after DNS
// resolution, so every redirect and every DNS answer (rebinding included) is
// checked on the IP actually used.
package egress

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"syscall"
	"time"
)

// MaxRedirects is how many redirects one request may follow.
const MaxRedirects = 3

// ErrBlocked means a request would have reached an address that isn't public.
var ErrBlocked = errors.New("egress: address isn't public")

// Client returns a client for untrusted URLs; timeout bounds a whole request,
// body included.
func Client(timeout time.Duration) *http.Client {
	return newClient(timeout, func(a netip.AddrPort) bool { return Public(a.Addr()) })
}

// newClient is Client with the address check as a parameter, for tests.
func newClient(timeout time.Duration, allow func(netip.AddrPort) bool) *http.Client {
	dialer := &net.Dialer{
		Timeout:   10 * time.Second,
		KeepAlive: 30 * time.Second,
		ControlContext: func(_ context.Context, network, address string, _ syscall.RawConn) error {
			if network != "tcp4" && network != "tcp6" {
				return fmt.Errorf("%w: network %s", ErrBlocked, network)
			}
			addr, err := netip.ParseAddrPort(address)
			if err != nil {
				return fmt.Errorf("%w: %v", ErrBlocked, err)
			}
			if !allow(addr) {
				return fmt.Errorf("%w: %s", ErrBlocked, addr.Addr())
			}
			return nil
		},
	}
	transport := &http.Transport{
		// No proxy: it would dial the destination for us, past the check.
		Proxy:                 nil,
		DialContext:           dialer.DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: time.Minute,
		ExpectContinueTimeout: time.Second,
	}
	return &http.Client{Transport: transport, Timeout: timeout, CheckRedirect: checkRedirect}
}

func checkRedirect(req *http.Request, via []*http.Request) error {
	if len(via) > MaxRedirects {
		return fmt.Errorf("egress: stopped after %d redirects", MaxRedirects)
	}
	if req.URL.Scheme != "http" && req.URL.Scheme != "https" {
		return fmt.Errorf("egress: redirect to unsupported scheme %q", req.URL.Scheme)
	}
	return nil
}

// notPublic lists ranges netip's predicates don't cover: shared, reserved,
// documentation and benchmarking space, and IPv6 forms that carry or reach
// IPv4 addresses we can't check.
var notPublic = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),       // "this network"
	netip.MustParsePrefix("100.64.0.0/10"),   // carrier-grade NAT
	netip.MustParsePrefix("192.0.0.0/24"),    // IETF protocol assignments
	netip.MustParsePrefix("192.0.2.0/24"),    // documentation
	netip.MustParsePrefix("198.18.0.0/15"),   // benchmarking
	netip.MustParsePrefix("198.51.100.0/24"), // documentation
	netip.MustParsePrefix("203.0.113.0/24"),  // documentation
	netip.MustParsePrefix("240.0.0.0/4"),     // reserved, and broadcast
	netip.MustParsePrefix("64:ff9b:1::/48"),  // local-use NAT64
	netip.MustParsePrefix("100::/64"),        // discard
	netip.MustParsePrefix("2001::/32"),       // Teredo
	netip.MustParsePrefix("2001:db8::/32"),   // documentation
	netip.MustParsePrefix("2002::/16"),       // 6to4
}

// nat64 is the well-known NAT64 prefix; its last 32 bits are an IPv4 address.
var nat64 = netip.MustParsePrefix("64:ff9b::/96")

// Public reports whether ip is a public unicast address: not loopback,
// private (RFC 1918, IPv6 ULA), link-local (169.254.0.0/16, metadata
// endpoints included, and fe80::/10), unspecified, multicast, carrier-grade
// NAT or otherwise reserved. IPv4-mapped and NAT64 addresses are judged by the
// IPv4 address they carry.
func Public(ip netip.Addr) bool {
	ip = ip.Unmap()
	if nat64.Contains(ip) {
		b := ip.As16()
		ip = netip.AddrFrom4([4]byte(b[12:]))
	}
	if !ip.IsValid() || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() ||
		ip.IsUnspecified() || ip.IsMulticast() || ip.IsInterfaceLocalMulticast() || ip.IsLinkLocalMulticast() {
		return false
	}
	for _, p := range notPublic {
		if p.Contains(ip) {
			return false
		}
	}
	return true
}
