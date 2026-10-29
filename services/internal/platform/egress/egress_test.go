package egress

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestPublic(t *testing.T) {
	for addr, want := range map[string]bool{
		"8.8.8.8":                  true,
		"104.18.2.161":             true,
		"2606:4700:4700::1111":     true,
		"::ffff:8.8.8.8":           true,
		"64:ff9b::808:808":         true, // NAT64 of 8.8.8.8
		"127.0.0.1":                false,
		"127.8.9.10":               false,
		"::1":                      false,
		"10.1.2.3":                 false,
		"172.16.0.1":               false,
		"192.168.1.1":              false,
		"169.254.169.254":          false, // cloud metadata
		"169.254.1.1":              false,
		"fe80::1":                  false,
		"fc00::1":                  false,
		"fd12:3456::1":             false,
		"0.0.0.0":                  false,
		"0.1.2.3":                  false,
		"::":                       false,
		"224.0.0.1":                false,
		"239.255.255.250":          false,
		"ff02::1":                  false,
		"100.64.0.1":               false, // carrier-grade NAT
		"100.127.255.254":          false,
		"255.255.255.255":          false,
		"240.0.0.1":                false,
		"198.18.0.1":               false,
		"192.0.2.1":                false,
		"2001:db8::1":              false,
		"::ffff:127.0.0.1":         false,
		"::ffff:169.254.169.254":   false,
		"::ffff:10.0.0.1":          false,
		"::ffff:100.64.0.1":        false,
		"64:ff9b::a9fe:a9fe":       false, // NAT64 of 169.254.169.254
		"64:ff9b::7f00:1":          false, // NAT64 of 127.0.0.1
		"2002:7f00:1::1":           false, // 6to4 of 127.0.0.1
		"2001:0:4136:e378::1":      false, // Teredo
		"fe80::1%eth0":             false,
		"::ffff:0:0":               false,
		"100::1":                   false,
		"64:ff9b:1::a00:1":         false,
		"2600:1f18:1234:5678::abc": true,
	} {
		ip, err := netip.ParseAddr(addr)
		if err != nil {
			t.Fatalf("%s: %v", addr, err)
		}
		if got := Public(ip); got != want {
			t.Errorf("Public(%s) = %v, want %v", addr, got, want)
		}
	}
}

func TestClientRefusesPrivateAddresses(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("the request reached a loopback server")
	}))
	defer srv.Close()
	port := srv.URL[strings.LastIndex(srv.URL, ":"):]
	for _, u := range []string{srv.URL, "http://localhost" + port, "http://[::ffff:127.0.0.1]" + port} {
		_, err := Client(5 * time.Second).Get(u)
		if !errors.Is(err, ErrBlocked) {
			t.Errorf("%s: got %v, want ErrBlocked", u, err)
		}
	}
}

// allowOnly is a test's idea of public: one loopback server stands in for the internet.
func allowOnly(t *testing.T, srv *httptest.Server) func(netip.AddrPort) bool {
	t.Helper()
	u, err := url.Parse(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	allowed := netip.MustParseAddrPort(u.Host)
	return func(a netip.AddrPort) bool { return a == allowed }
}

func TestRedirectsAreCheckedOnEveryHop(t *testing.T) {
	private := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("the redirect reached a private server")
	}))
	defer private.Close()
	public := httptest.NewServer(http.RedirectHandler(private.URL+"/secret", http.StatusFound))
	defer public.Close()

	_, err := newClient(5*time.Second, allowOnly(t, public)).Get(public.URL)
	if !errors.Is(err, ErrBlocked) {
		t.Fatalf("got %v, want ErrBlocked", err)
	}
}

func TestRedirectsAreLimited(t *testing.T) {
	hops := 0
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hops++
		http.Redirect(w, r, srv.URL+"/again", http.StatusFound)
	}))
	defer srv.Close()
	_, err := newClient(5*time.Second, allowOnly(t, srv)).Get(srv.URL)
	if err == nil || !strings.Contains(err.Error(), "redirects") {
		t.Fatalf("got %v, want a redirect limit error", err)
	}
	if hops != MaxRedirects+1 {
		t.Errorf("followed %d requests, want %d", hops, MaxRedirects+1)
	}

	other := httptest.NewServer(http.RedirectHandler("ftp://example.com/x", http.StatusFound))
	defer other.Close()
	if _, err := newClient(5*time.Second, allowOnly(t, other)).Get(other.URL); err == nil {
		t.Error("a redirect to ftp:// was followed")
	}
}
