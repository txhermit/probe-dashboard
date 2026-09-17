// probe-dashboard — Kismet WebUI module
//
// Loaded via dynamic import() from manifest.conf.  Must be a valid ES module
// and must not throw at top level: a failed import stalls the entire UI.

"use strict";

let local_uri_prefix = "";
if (typeof KISMET_URI_PREFIX !== "undefined")
    local_uri_prefix = KISMET_URI_PREFIX;

try {
    $("<link>")
        .appendTo("head")
        .attr({
            type: "text/css",
            rel: "stylesheet",
            href: local_uri_prefix + "plugin/probe-dashboard/css/probe_dashboard.css",
        });
} catch (e) {
    console.error("probe-dashboard: css", e);
}

const POLL_MS = 1500;
const MAX_ROWS = 500;
const PRIME_WINDOW_SEC = 60;

const lastSeen = new Map();
const pendingRows = [];
let primed = false;
let rowCount = 0;
let pollTimer = null;
let pollErrors = 0;

function ssidLabel(ssid) {
    if (ssid === undefined || ssid === null || ssid === "")
        return "<wildcard>";
    return String(ssid);
}

function fmtTime(epochSec) {
    if (!epochSec)
        return "";
    try {
        return new Date(epochSec * 1000).toLocaleTimeString();
    } catch (e) {
        return String(epochSec);
    }
}

function rssiClass(rssi) {
    const n = Number(rssi);
    if (!Number.isFinite(n))
        return "";
    if (n >= -50)
        return "hot";
    if (n >= -70)
        return "warm";
    return "cold";
}

function setStatus(msg) {
    const el = document.getElementById("probeDashStatus");
    if (el)
        el.textContent = msg;
}

function flushPending() {
    const tbody = document.getElementById("probeBody");
    if (!tbody || !pendingRows.length)
        return;
    const queued = pendingRows.splice(0, pendingRows.length);
    for (const args of queued)
        insertRow(tbody, args);
}

function insertRow(tbody, rec) {
    const row = tbody.insertRow(0);

    row.insertCell(0).textContent = rec.time;

    const macCell = row.insertCell(1);
    macCell.textContent = rec.mac;
    macCell.className = "probe-dash-mac";

    row.insertCell(2).textContent = rec.manuf || "";

    const rssiCell = row.insertCell(3);
    rssiCell.textContent = rec.rssi;
    rssiCell.className = "probe-dash-rssi " + rssiClass(rec.rssi);

    const ssidCell = row.insertCell(4);
    ssidCell.textContent = rec.ssid;
    ssidCell.className = "probe-dash-ssid" + (rec.ssid === "<wildcard>" ? " wildcard" : "");

    row.insertCell(5).textContent = rec.channel;

    rowCount++;
    while (tbody.rows.length > MAX_ROWS)
        tbody.deleteRow(tbody.rows.length - 1);

    setStatus("Live · " + rowCount + " probe update" + (rowCount === 1 ? "" : "s"));
}

function addRow(rec) {
    const tbody = document.getElementById("probeBody");
    if (!tbody) {
        pendingRows.push(rec);
        if (pendingRows.length > MAX_ROWS)
            pendingRows.shift();
        return;
    }
    flushPending();
    insertRow(tbody, rec);
}

function probeList(rec) {
    let raw = rec["dot11.device.probed_ssid_map"];
    if (raw === undefined && rec["dot11.device"])
        raw = rec["dot11.device"]["dot11.device.probed_ssid_map"];
    if (!raw)
        return [];
    if (Array.isArray(raw))
        return raw;
    if (typeof raw === "object")
        return Object.values(raw);
    return [];
}

function consider(mac, ssid, last_time, rssi, channel, manuf) {
    if (!mac || !last_time)
        return;

    const label = ssidLabel(ssid);
    const key = mac + "\0" + label;
    const prev = lastSeen.get(key) || 0;
    if (last_time <= prev)
        return;
    lastSeen.set(key, last_time);

    const now = (typeof kismet !== "undefined" && kismet.timestamp_sec)
        ? kismet.timestamp_sec
        : Math.floor(Date.now() / 1000);

    if (!primed && (now - last_time) > PRIME_WINDOW_SEC)
        return;

    addRow({
        time: fmtTime(last_time),
        mac: mac,
        manuf: manuf || "",
        rssi: (rssi === undefined || rssi === null || rssi === "") ? "N/A" : rssi,
        ssid: label,
        channel: channel || "N/A",
    });
}

function handleDevice(rec) {
    const mac = rec["kismet.device.base.macaddr"];
    if (!mac)
        return;

    const rssi = rec["last_signal"]
        ?? rec["kismet.common.signal.last_signal"]
        ?? (rec["kismet.device.base.signal"]
            ? rec["kismet.device.base.signal"]["kismet.common.signal.last_signal"]
            : undefined);

    const channel = rec["kismet.device.base.channel"] || "N/A";
    const manuf = rec["kismet.device.base.manuf"] || "";

    for (const p of probeList(rec)) {
        consider(
            mac,
            p["dot11.probedssid.ssid"],
            p["dot11.probedssid.last_time"],
            rssi,
            channel,
            manuf
        );
    }
}

function pollProbes() {
    if (typeof $ === "undefined")
        return;

    $.post(local_uri_prefix + "devices/last-time/-3/devices.json", {
        json: JSON.stringify({
            fields: [
                "kismet.device.base.macaddr",
                "kismet.device.base.channel",
                "kismet.device.base.manuf",
                ["kismet.device.base.signal/kismet.common.signal.last_signal", "last_signal"],
                "dot11.device/dot11.device.probed_ssid_map",
            ],
        }),
    })
        .done(function (devs) {
            pollErrors = 0;
            try {
                const list = (typeof kismet !== "undefined" && kismet.sanitizeObject)
                    ? kismet.sanitizeObject(devs)
                    : devs;
                for (const rec of list)
                    handleDevice(rec);
            } catch (e) {
                console.error("probe-dashboard: poll parse", e);
            }
            primed = true;
        })
        .fail(function () {
            pollErrors++;
            setStatus("Poll failed ×" + pollErrors + " · will retry");
        })
        .always(function () {
            pollTimer = setTimeout(pollProbes, POLL_MS);
        });
}

function onProbedSsidEvent(data) {
    try {
        if (typeof kismet !== "undefined" && kismet.sanitizeObject)
            data = kismet.sanitizeObject(data);

        const dev = data["DOT11_NEW_SSID_BASEDEV"];
        const ssid = data["DOT11_PROBED_SSID"];
        if (!dev || !ssid)
            return;

        const rssi = (dev["kismet.device.base.signal"] || {})["kismet.common.signal.last_signal"];

        consider(
            dev["kismet.device.base.macaddr"],
            ssid["dot11.probedssid.ssid"],
            ssid["dot11.probedssid.last_time"] || dev["kismet.device.base.last_time"],
            rssi,
            dev["kismet.device.base.channel"],
            dev["kismet.device.base.manuf"]
        );
    } catch (e) {
        console.error("probe-dashboard: eventbus", e);
    }
}

try {
    if (typeof kismet_ui_tabpane !== "undefined") {
        kismet_ui_tabpane.AddTab({
            id: "probe_dashboard",
            tabTitle: "Probes",
            createCallback: function (div) {
                div.html(
                    '<div class="probe-dash">' +
                    '<div class="probe-dash-status" id="probeDashStatus">Waiting for probes…</div>' +
                    '<div class="probe-dash-scroll">' +
                    '<table class="probe-dash-table">' +
                    "<thead><tr>" +
                    "<th>Time</th><th>MAC</th><th>Manuf</th>" +
                    "<th>RSSI</th><th>Probe SSID</th><th>Channel</th>" +
                    "</tr></thead>" +
                    '<tbody id="probeBody"></tbody>' +
                    "</table></div></div>"
                );
                flushPending();
            },
        });
    } else {
        console.warn("probe-dashboard: kismet_ui_tabpane not available");
    }

    if (typeof kismet_ui_base !== "undefined" &&
            typeof kismet_ui_base.SubscribeEventbus === "function") {
        kismet_ui_base.SubscribeEventbus("DOT11_PROBED_SSID", [], onProbedSsidEvent);
    }

    pollTimer = setTimeout(pollProbes, 2000);
} catch (e) {
    console.error("probe-dashboard: init", e);
}

export const load_complete = 1;
