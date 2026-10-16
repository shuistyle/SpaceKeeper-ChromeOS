// ======================================================================
// desks.js — talking to ChromeOS desks
// ======================================================================
// ChromeOS has no general "desks" API for apps. On MANAGED Chromebooks
// (school or work), an administrator can switch on Google's Desk API for
// chosen web addresses. ChromeOS then lets those pages send messages to a
// built-in extension that controls desks:
//
//   page ──chrome.runtime.sendMessage(EXTENSION_ID, {messageType, operands})──▶ ChromeOS
//
// What it can do (and so what SpaceKeeper can do):
//   GetActiveDesk   which desk you're on (its ID)
//   GetDeskByID     a desk's ChromeOS name
//   SwitchDesk      go to a desk
//   LaunchDesk      add a new desk (optionally named) and go to it
//   RemoveDesk      remove a desk (its windows move to the desk on its left)
//   SetWindowProperties  show SpaceKeeper's window on every desk
//   events          a desk was added, removed or switched to
//
// What it CAN'T do: list all desks, rename desks, reorder them, or say
// where a desk is in the row. SpaceKeeper therefore learns desks as you use
// them (see store.js), and its names and colours are its own labels.
//
// Setup for administrators: ADMIN-SETUP.md.
//
// DemoDesks below has the same functions but pretends, so you can try
// SpaceKeeper in any browser. app.js uses it when the Desk API isn't there.
// ======================================================================

import { isDeskId } from "./text.js";

/** The built-in ChromeOS Desk API extension, then Google's "Desk Connector Demo" (for testing). */
export const EXTENSION_IDS = ["kflgdebkpepnpjobkdfeeipcjdahoomc", "oagemgapjncacjdaockjfaidedggjond"];

const TIMEOUT_MS = 4000;

/** Error with ChromeOS's own error code (e.g. "DesksCountCheckFailedError"). */
export class DeskError extends Error {
  constructor(code, detail) {
    super(friendlyMessage(code, detail));
    this.code = code;
  }
}

function friendlyMessage(code, detail) {
  switch (code) {
    case "DesksCountCheckFailedError": return "ChromeOS already has as many desks as it allows.";
    case "ResourceNotFoundError": return "That desk no longer exists.";
    case "DeskBeingModifiedError": return "ChromeOS was still busy with the last desk change. Try again.";
    case "NoCurrentUserError": return "No one is signed in to this Chromebook.";
    case "InvalidIdError": return "That isn't a valid desk.";
    case "Timeout": return "ChromeOS didn't answer in time. Try again.";
    case "Unavailable": return "The ChromeOS Desk API isn't available here.";
    default: return detail || "ChromeOS couldn't do that.";
  }
}

/** Turns whatever ChromeOS reported into one of its error codes. */
function errorCode(text) {
  const known = ["DesksCountCheckFailedError", "ResourceNotFoundError", "DeskBeingModifiedError",
    "NoCurrentUserError", "InvalidIdError", "StorageError"];
  return known.find((k) => String(text).includes(k)) ?? "OperationFailure";
}

/** Real desks, through the ChromeOS Desk API. */
export class ChromeDesks {
  constructor(extensionId) {
    this.extensionId = extensionId;
    this.isDemo = false;
  }

  /** Finds a Desk API extension that answers. Returns a ChromeDesks, or null. */
  static async connect() {
    const runtime = globalThis.chrome?.runtime;
    if (typeof runtime?.sendMessage !== "function") return null;
    for (const id of EXTENSION_IDS) {
      const desks = new ChromeDesks(id);
      try {
        const active = await desks.activeDesk();
        if (active) return desks;
      } catch {
        // not this one; try the next
      }
    }
    return null;
  }

  /** Sends one request and waits for ChromeOS's answer. */
  call(messageType, operands) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new DeskError("Timeout")), TIMEOUT_MS);
      const message = operands === undefined ? { messageType } : { messageType, operands };
      try {
        globalThis.chrome.runtime.sendMessage(this.extensionId, message, (response) => {
          clearTimeout(timer);
          const lastError = globalThis.chrome.runtime.lastError;
          if (lastError) return reject(new DeskError(errorCode(lastError.message), lastError.message));
          if (!response) return reject(new DeskError("OperationFailure"));
          if (response.messageType === "OperationFailure") {
            const text = response.errorMessage ?? response.ErrorMessage ?? "";
            return reject(new DeskError(errorCode(text), text));
          }
          resolve(response.operands ?? {});
        });
      } catch (error) {
        clearTimeout(timer);
        reject(new DeskError("Unavailable", error?.message));
      }
    });
  }

  async activeDesk() {
    const result = await this.call("GetActiveDesk");
    return isDeskId(result?.deskUuid) ? result.deskUuid : null;
  }

  /** ChromeOS's name for a desk, or "" if it has none. Throws ResourceNotFoundError if it's gone. */
  async deskName(id) {
    const result = await this.call("GetDeskByID", { deskId: id });
    return typeof result?.deskName === "string" ? result.deskName : "";
  }

  switchTo(id) {
    return this.callRetrying("SwitchDesk", { deskId: id });
  }

  /** Adds a desk and goes to it. Returns the new desk's ID. */
  async addDesk(name) {
    const result = await this.callRetrying("LaunchDesk", name ? { deskName: name } : {});
    if (!isDeskId(result?.deskUuid)) throw new DeskError("OperationFailure");
    return result.deskUuid;
  }

  /** Removes a desk. Its windows move to the desk on its left, so nothing is closed. */
  removeDesk(id) {
    return this.callRetrying("RemoveDesk", {
      deskId: id,
      skipConfirmation: true, // SpaceKeeper asks you itself
      options: { combineDesks: true },
    });
  }

  /** Shows (or stops showing) SpaceKeeper's own window on every desk. */
  async showOnAllDesks(on) {
    try {
      await this.call("SetWindowProperties", { allDesks: on });
    } catch {
      await this.call("SetWindowProperties", { windowProperties: { allDesks: on } }); // older format
    }
  }

  /** Retries once if ChromeOS is still animating the previous change. */
  async callRetrying(type, operands) {
    try {
      return await this.call(type, operands);
    } catch (error) {
      if (error.code !== "DeskBeingModifiedError") throw error;
      await new Promise((r) => setTimeout(r, 1500));
      return this.call(type, operands);
    }
  }

  /**
   * Calls `onEvent({type, deskId, activated, deactivated})` when a desk is
   * added, removed or switched to. Returns a function that stops listening.
   */
  listen(onEvent) {
    let port;
    try {
      port = globalThis.chrome.runtime.connect(this.extensionId);
    } catch {
      return () => {};
    }
    const handler = (message) => {
      if (!message || typeof message !== "object") return;
      const type = message.eventName ?? message.messageType ?? message.type;
      const data = message.data ?? message.operands ?? message;
      if (!["DeskAdded", "DeskRemoved", "DeskSwitched", "DeskUndone"].includes(type)) return;
      onEvent({
        type,
        deskId: isDeskId(data?.deskId) ? data.deskId : null,
        activated: isDeskId(data?.activated) ? data.activated : null,
        deactivated: isDeskId(data?.deactivated) ? data.deactivated : null,
      });
    };
    port.onMessage.addListener(handler);
    return () => { try { port.onMessage.removeListener(handler); port.disconnect(); } catch { /* gone */ } };
  }
}

/** Pretend desks for trying SpaceKeeper anywhere. Nothing real changes. */
export class DemoDesks {
  constructor() {
    this.isDemo = true;
    this.listeners = new Set();
    this.desks = ["Desk 1", "Desk 2", "Desk 3", "Desk 4"].map((name) => ({ id: crypto.randomUUID(), name }));
    this.active = this.desks[0].id;
  }
  /** Demo desks the app hasn't "visited" yet, to show how learning desks works. */
  all() { return this.desks.map((d) => d.id); }
  async activeDesk() { return this.active; }
  async deskName(id) {
    const desk = this.desks.find((d) => d.id === id);
    if (!desk) throw new DeskError("ResourceNotFoundError");
    return desk.name;
  }
  async switchTo(id) {
    if (!this.desks.some((d) => d.id === id)) throw new DeskError("ResourceNotFoundError");
    const previous = this.active;
    this.active = id;
    this.emit({ type: "DeskSwitched", activated: id, deactivated: previous, deskId: null });
  }
  async addDesk(name) {
    if (this.desks.length >= 16) throw new DeskError("DesksCountCheckFailedError");
    const desk = { id: crypto.randomUUID(), name: name || `Desk ${this.desks.length + 1}` };
    this.desks.push(desk);
    this.emit({ type: "DeskAdded", deskId: desk.id, activated: null, deactivated: null });
    await this.switchTo(desk.id);
    return desk.id;
  }
  async removeDesk(id) {
    const at = this.desks.findIndex((d) => d.id === id);
    if (at < 0) throw new DeskError("ResourceNotFoundError");
    if (this.desks.length === 1) throw new DeskError("OperationFailure", "You can't remove the last desk.");
    this.desks.splice(at, 1);
    if (this.active === id) await this.switchTo(this.desks[Math.max(0, at - 1)].id);
    this.emit({ type: "DeskRemoved", deskId: id, activated: null, deactivated: null });
  }
  async showOnAllDesks() {}
  listen(onEvent) { this.listeners.add(onEvent); return () => this.listeners.delete(onEvent); }
  emit(event) { for (const l of this.listeners) queueMicrotask(() => l(event)); }
}
