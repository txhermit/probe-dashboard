"use strict";

let local_uri_prefix = "";
if (typeof(KISMET_URI_PREFIX) !== 'undefined')
    local_uri_prefix = KISMET_URI_PREFIX;

kismet_ui_tabpane.AddTab({
    id: 'probe_dashboard',
    tabTitle: 'Probes',
    createCallback: function(div) {
        div.html(`
            <table class="table table-striped table-sm" style="width:100%">
                <thead><tr>
                    <th>Time</th><th>MAC</th><th>RSSI</th>
                    <th>Probe SSID</th><th>Channel</th>
                </tr></thead>
                <tbody id="probeBody"></tbody>
            </table>`);
    },
});

const lastShown = new Map();
let pollTimer = null;

// Edge-triggered: first time a device probes a given SSID
kismet_ui_base.SubscribeEventbus("DOT11_PROBED_SSID", [], function(data) {
    try {
        data = kismet.sanitizeObject(data);

        const dev = data['DOT11_NEW_SSID_BASEDEV'];
        const ssid_rec = data['DOT11_PROBED_SSID'];

        if (!dev || !ssid_rec)
            return;

        showProbes(dev['kismet.device.base'] || dev,
                   [ssid_rec['dot11.probedssid.ssid'] || '<wildcard>']);
    } catch (e) {
        console.log('probe dashboard (eventbus):', e);
    }
});

// Level-triggered: poll devices updated since our last timestamp
function pollProbes() {
    if (pollTimer == null)
        return;

    const ts = kismet.timestamp_sec || Math.floor(Date.now() / 1000);

    $.post(local_uri_prefix + 'devices/last-time/' + ts + '/devices.json', {
        json: JSON.stringify({ fields: [
            'kismet.device.base.macaddr',
            'kismet.device.base.last_time',
            'kismet.device.base.signal',
            'kismet.device.base.frequency',
            'dot11.device.probed_ssid_map'
        ]})
    })
    .done(function(devs) {
        for (const rec of kismet.sanitizeObject(devs)) {
            try {
                const probes = rec['dot11.device.probed_ssid_map'];
                if (!probes || !probes.length)
                    continue;

                showProbes(rec, probes.map(p => p['dot11.probedssid.ssid'] || '<wildcard>'));
            } catch (e) {
                console.log('probe dashboard (poll):', e);
            }
        }
    })
    .always(function() {
        pollTimer = setTimeout(pollProbes, 2000);
    });
}

function showProbes(dev, ssidList) {
    const mac = dev['kismet.device.base.macaddr'];
    if (!mac)
        return;

    // Per-MAC throttle: max one row set per MAC per 5s
    const now = Date.now();
    if (lastShown.has(mac) && now - lastShown.get(mac) < 5000)
        return;
    lastShown.set(mac, now);

    const t = dev['kismet.device.base.last_time'];
    const time = t ? new Date(t * 1000).toLocaleTimeString() : '';
    const rssi = dev['kismet.device.base.signal']
        ? dev['kismet.device.base.signal']['kismet.common.signal.last_signal'] : 'N/A';
    const chan = freqToChannel(dev['kismet.device.base.frequency']);

    for (const s of ssidList)
        addProbeRow(time, mac, rssi, s, chan);
}

function freqToChannel(freq_khz) {
    if (!freq_khz) return 'N/A';
    if (freq_khz === 2484000) return 14;
    if (freq_khz >= 2412000 && freq_khz <= 2472000)
        return ((freq_khz - 2407000) / 500) | 0;
    if (freq_khz >= 5000000 && freq_khz <= 5900000)
        return ((freq_khz - 5000000) / 500) | 0;
    if (freq_khz >= 5955000 && freq_khz <= 7115000)
        return ((freq_khz - 5950000) / 500) | 0;
    return (freq_khz / 1000) + ' MHz';
}

function addProbeRow(time, mac, rssi, ssid, channel) {
    const tbody = document.getElementById('probeBody');
    if (!tbody) return;

    const row = tbody.insertRow(0);
    row.insertCell(0).textContent = time;
    row.insertCell(1).textContent = mac;
    row.insertCell(2).textContent = rssi;
    row.insertCell(3).textContent = ssid;
    row.insertCell(4).textContent = channel;

    while (tbody.rows.length > 500)
        tbody.deleteRow(tbody.rows.length - 1);
}

pollTimer = setTimeout(pollProbes, 2000);
