/**
 * Honest rows for whatever the bridge actually reported.
 * Never claims a model is attached just because port 8790 answered.
 * @param {{ reachable?: boolean, xai?: boolean, cursor?: boolean, skipped?: boolean }} bridge
 */
export function brainRows(bridge) {
  if (bridge.skipped) {
    return [
      {
        id: "brain",
        status: "FLAG",
        label: "Live brain",
        detail: "Probe switched off in my settings, so I didn't check. Assuming not wired.",
      },
    ];
  }
  if (!bridge.reachable) {
    return [
      {
        id: "brain",
        status: "FLAG",
        label: "Live brain",
        detail: "Bridge offline. I'm answering from the resident profile, not a model.",
      },
    ];
  }
  if (!bridge.xai && !bridge.cursor) {
    return [
      {
        id: "brain",
        status: "FLAG",
        label: "Live brain",
        detail:
          "Bridge is up, but .env has no keys. Talk stays local. SuperGrok chat is not an xAI API key — mint XAI_API_KEY at console.x.ai. Cursor key from cursor.com/dashboard/cloud-agents.",
      },
    ];
  }
  return [
    bridge.xai
      ? {
          id: "xai",
          status: "OK",
          label: "xAI",
          detail: "Grok is wired. Talk goes through the live model.",
        }
      : {
          id: "xai",
          status: "FLAG",
          label: "xAI",
          detail:
            "No XAI_API_KEY. Talk stays on the local profile. SuperGrok chat login is not this key (console.x.ai).",
        },
    bridge.cursor
      ? {
          id: "link",
          status: "OK",
          label: "Cursor link",
          detail: "Local Cursor agent is wired. File and HUD edits go through it — not a silent cloud PR.",
        }
      : {
          id: "link",
          status: "FLAG",
          label: "Cursor link",
          detail:
            "No CURSOR_API_KEY. I can talk, but I won't change files. Mint one at cursor.com/dashboard/cloud-agents.",
        },
  ];
}
