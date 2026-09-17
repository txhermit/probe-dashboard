# probe-dashboard

A **web-only** Kismet plugin that adds a **Probes** tab to the main WebUI.
It shows Wi-Fi probe requests as a live scrolling table: time, MAC, manufacturer, RSSI, probed SSID, and channel.

Kismet already stores probed SSIDs on each client device, but the stock UI only shows them buried in device details. This plugin surfaces them as a feed.

## Requirements

- Kismet 2022-08 or later (tested against 2025-09-R1 / current git)
- `allowplugins=true` in `kismet.conf` (this is the default)

No C++ compiler, no Python helper, no extra packages.

## Install

Kismet only scans plugins at **startup**, and only in two places:

1. The system plugin directory (`pkg-config --variable=plugindir kismet`, usually `/usr/local/lib/kismet` or `/usr/lib/kismet`)
2. `~/.kismet/plugins` of the **user Kismet runs as**

If you start Kismet with `sudo kismet` or the distro systemd unit, it runs as root. Root does **not** read your home directory. Use `make install`.

```bash
git clone https://github.com/txhermit/probe-dashboard.git
cd probe-dashboard
sudo make install
```

If you run Kismet as your own user (log replay, unprivileged UI, etc.):

```bash
make userinstall
```

Then **restart Kismet**. In the server log you should see the plugin load. Open the WebUI and look for a **Probes** tab in the bottom pane (next to Messages / Packet Rate / etc.).

To remove:

```bash
sudo make uninstall
# or
make useruninstall
```

## What you will see

- New rows appear when a client probes for an SSID Kismet has not seen from that MAC yet (`DOT11_PROBED_SSID` event), **or** when an already-known SSID’s `last_time` moves forward (polled from `probed_ssid_map`).
- Empty / broadcast probe requests show as `<wildcard>`.
- The first poll also backfills SSIDs probed in the last 60 seconds so the tab is not blank on load.
- The table keeps the newest 500 rows.

## What this is not

Kismet does **not** publish an event for every probe frame. `DOT11_PROBED_SSID` fires once per `(client MAC, SSID)` the first time that pair is seen. After that, only `dot11.probedssid.last_time` on the device record is updated.

So this tab is a **best-effort live view of probed-SSID updates**, not a packet-level sniffer. A client hammering the same SSID may only produce a new row when Kismet’s poll notices `last_time` change (about every 1.5s). Association / reassociation requests are also folded into the same probed-SSID map by Kismet itself.

A true per-frame feed would need a C++ packet-chain plugin or an external `kisexternal` helper. This plugin stays web-only on purpose.

## Layout

```
probe-dashboard/
  Makefile
  manifest.conf
  README.md
  httpd/
    css/probe_dashboard.css
    js/probe_dashboard.js      ← loaded by the main UI
```

Kismet maps `/plugin/probe-dashboard/` to the `httpd/` directory. The `js=` line in `manifest.conf` **must** be a relative path with no leading slash:

```
js=probe_dashboard,plugin/probe-dashboard/js/probe_dashboard.js
```

If that file 404s, Kismet’s `/dynamic.js` loader `await import()`s it with no try/catch and the **entire WebUI can fail to start**. Do not rename the JS file without updating the manifest to match.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No Probes tab, and the whole UI hangs on load | JS path 404. Confirm `httpd/js/probe_dashboard.js` is installed and the manifest `js=` path matches. |
| No Probes tab, UI otherwise fine | Plugin not loaded. Check install dir vs. the user Kismet runs as; look at the startup log; confirm `allowplugins=true`. |
| Tab is there but stays empty | No Wi-Fi source hopping, or no clients probing. Device details → Probed SSIDs should show the same data. |
| Tab empty, poll error in the status line | Session/auth. Make sure you are logged into the WebUI; the plugin uses the same cookie as the rest of the UI. |

## License

Use it. This is a small WebUI addon around Kismet’s public REST/eventbus APIs.
