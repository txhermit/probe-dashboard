(function() {

    const ws = new WebSocket(`ws://${window.location.hostname}:2501/eventbus`);

    ws.onopen = function() {
        console.log("Probe Dashboard: WebSocket connected");

        // Subscribe to DEVICE events
        ws.send(JSON.stringify({
            "subscribe": ["DEVICE"]
        }));
    };

    ws.onmessage = function(event) {
        let data;

        try {
            data = JSON.parse(event.data);
        } catch (e) {
            return;
        }

        // Only process DEVICE updates
        if (!data || data["kismet.device.base"]) {

            const dev = data["kismet.device.base"];
            const dot11 = data["dot11.device"];

            if (!dot11 || !dot11["dot11.probed_ssid_list"]) {
                return;
            }

            const probes = dot11["dot11.probed_ssid_list"];
            if (!probes.length) {
                return;
            }

            const mac = dev["macaddr"] || "Unknown";
            const rssi = dev["signal"] || "N/A";
            const time = new Date(dev["last_time"] * 1000).toLocaleTimeString();
            const channel = dot11["dot11.channel"] || "N/A";

            probes.forEach(ssid => {
                addProbeRow(time, mac, rssi, ssid, channel);
            });
        }
    };

    function addProbeRow(time, mac, rssi, ssid, channel) {
        const tbody = document.getElementById("probeBody");

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${time}</td>
            <td>${mac}</td>
            <td>${rssi}</td>
            <td>${ssid}</td>
            <td>${channel}</td>
        `;

        tbody.appendChild(row);

        // Auto-scroll
        tbody.parentNode.scrollTop = tbody.parentNode.scrollHeight;
    }

})();
