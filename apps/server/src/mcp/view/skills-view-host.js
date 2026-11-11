// Host bridge for the skill library view: the MCP Apps postMessage protocol
// (JSON-RPC 2.0, spec 2026-01-26) without dependencies. skills-view.js sets
// the on* handlers and renders; this file only talks to the host.
var skillHost = (function () {
  "use strict";

  var host = {
    onResult: function () {},
    onCancelled: function () {},
    onUnsupported: function () {},
    capabilities: function () {
      return hostCapabilities;
    },
  };

  var PROTOCOL_VERSION = "2026-01-26";
  var CALLER_KEY = "skill-library/caller";
  var nextId = 1;
  var pending = {};
  var hostCapabilities = {};

  // --- Host bridge -------------------------------------------------------

  function send(message) {
    window.parent.postMessage(message, "*");
  }

  function request(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      send({ jsonrpc: "2.0", id: id, method: method, params: params || {} });
    });
  }

  function notify(method, params) {
    send({ jsonrpc: "2.0", method: method, params: params || {} });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var msg = event.data;
    if (!msg || msg.jsonrpc !== "2.0") return;

    if (msg.id !== undefined && !msg.method) {
      var waiter = pending[msg.id];
      if (!waiter) return;
      delete pending[msg.id];
      if (msg.error)
        waiter.reject(new Error(msg.error.message || "Request failed"));
      else waiter.resolve(msg.result);
      return;
    }

    if (msg.method === "ui/notifications/tool-result") {
      host.onResult(msg.params);
    } else if (msg.method === "ui/notifications/tool-cancelled") {
      host.onCancelled();
    } else if (msg.method === "ui/notifications/host-context-changed") {
      applyHostContext(msg.params);
    } else if (msg.id !== undefined) {
      // Host requests: ping and ui/resource-teardown need only an answer.
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
    }
  });

  function callTool(name, args) {
    var meta = {};
    meta[CALLER_KEY] = "view";
    return request("tools/call", { name: name, arguments: args, _meta: meta });
  }

  function openLink(url) {
    return request("ui/open-link", { url: url }).catch(function () {
      window.open(url, "_blank", "noopener");
    });
  }

  function sendMessage(text) {
    return request("ui/message", {
      role: "user",
      content: [{ type: "text", text: text }],
    });
  }

  function applyHostContext(context) {
    if (!context) return;
    if (context.theme) document.documentElement.dataset.theme = context.theme;
    var vars = context.styles && context.styles.variables;
    if (vars) {
      Object.keys(vars).forEach(function (key) {
        if (vars[key])
          document.documentElement.style.setProperty(key, vars[key]);
      });
    }
    var fonts =
      context.styles && context.styles.css && context.styles.css.fonts;
    if (fonts && !document.getElementById("host-fonts")) {
      var style = document.createElement("style");
      style.id = "host-fonts";
      style.textContent = fonts;
      document.head.appendChild(style);
    }
  }

  var lastHeight = 0;
  function reportSize() {
    var height = Math.ceil(
      document.documentElement.getBoundingClientRect().height
    );
    if (height === lastHeight) return;
    lastHeight = height;
    notify("ui/notifications/size-changed", { height: height });
  }
  new ResizeObserver(reportSize).observe(document.documentElement);

  host.callTool = callTool;
  host.openLink = openLink;
  host.sendMessage = sendMessage;

  // Answered after both scripts ran, so the renderer's handlers are set.
  request("ui/initialize", {
    appInfo: { name: "skill-library-view", version: "1.0.0" },
    appCapabilities: { availableDisplayModes: ["inline"] },
    protocolVersion: PROTOCOL_VERSION,
  })
    .then(function (init) {
      hostCapabilities = (init && init.hostCapabilities) || {};
      applyHostContext(init && init.hostContext);
      notify("ui/notifications/initialized");
      reportSize();
    })
    .catch(function () {
      host.onUnsupported();
    });

  return host;
})();
