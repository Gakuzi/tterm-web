// Who may do what with a project's machines and notes, as the core decides
// it (core/notes.py): the page only hides what would be refused anyway.

import type { Folder, NoteSummary, Project, Role } from "./api";

/** The owner and admins: machines, and folders with notes in them. */
export function manages(project: Project): boolean {
  return project.role === "owner" || project.role === "admin";
}

/** Nobody else in it: Personal, and, until people come, every project of
 * one's own (0.1.1). */
export function alone(project: Project): boolean {
  return project.personal || project.alone;
}

/** Everyone but an observer writes notes. */
export function writes(project: Project): boolean {
  return project.role !== "observer";
}

/** Its author, the owner and admins; an observer, even its author, no. */
export function deletesNote(project: Project, note: NoteSummary,
  meId: string): boolean {
  return manages(project) || (writes(project) && note.createdBy?.id === meId);
}

/** The owner and admins, and whoever made it while it is empty. */
export function deletesFolder(project: Project, folder: Folder,
  meId: string): boolean {
  return manages(project) ||
    (writes(project) && folder.createdBy?.id === meId && folder.notes.length === 0);
}

/** The words for each role (0.1.16: strings of i18n/<code>.txt). */
export const ROLE_KEY: Record<Role, string> = {
  owner: "role.owner",
  admin: "role.admin",
  member: "role.member",
  observer: "role.observer",
};
