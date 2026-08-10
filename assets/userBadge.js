import { getLevel, ROLE_LABEL, escapeHtml } from "./utils.js";

export function userBadgeHtml({ username, role, likesReceived = 0 }) {
  const level = getLevel(likesReceived);
  const roleLabel = ROLE_LABEL[role];

  const roleHtml = roleLabel
    ? `<span class="role-tag ${role === "owner" ? "owner" : ""}">${escapeHtml(roleLabel)}</span>`
    : "";

  const levelHtml =
    level.level > 0
      ? `<span class="level-badge" title="${escapeHtml(level.label)}">${level.level}</span>`
      : "";

  return `
    <span class="user-badge">
      <span class="name">${escapeHtml(username)}</span>
      ${roleHtml}
      ${levelHtml}
    </span>
  `;
}
