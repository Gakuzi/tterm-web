// The commands the core and the app's engine hold back before they run
// (tterm/core/danger.py, and danger.rs of tterm-app), as the page says them
// (0.1.16). Both send what such a command would do and what does not come
// back, in English, the same nine; here each is a string of i18n/<code>.txt,
// found by its English words. One they add later shows as it comes, in
// English, until it is here too (a check of the core's tests sees to that:
// test_danger.py).

/** The English `what` of each rule, and the strings that say it and what
 * is lost. */
export const DANGER_KEYS: Record<string, { what: string; lost: string }> = {
  "delete a directory and everything inside it": { what: "danger.delete_tree", lost: "danger.delete_tree_lost" },
  "rewrite a disk's filesystem": { what: "danger.disk", lost: "danger.disk_lost" },
  "write directly onto a device": { what: "danger.device", lost: "danger.device_lost" },
  "drop a database or a table": { what: "danger.database", lost: "danger.database_lost" },
  "turn the machine off": { what: "danger.power_off", lost: "danger.power_off_lost" },
  "reboot the machine": { what: "danger.reboot", lost: "danger.reboot_lost" },
  "stop the SSH service": { what: "danger.ssh", lost: "danger.ssh_lost" },
  "change the firewall": { what: "danger.firewall", lost: "danger.firewall_lost" },
  "delete a user account": { what: "danger.user", lost: "danger.user_lost" },
};
