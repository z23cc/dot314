import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupPermissionGateHook } from "./permission-gate";
import { setupPreventBrewHook } from "./prevent-brew";
import { setupProtectPathsHook } from "./protect-paths";

export function setupGuardrailsHooks(pi: ExtensionAPI) {
  setupPreventBrewHook(pi);
  setupProtectPathsHook(pi);
  setupPermissionGateHook(pi);
}
