import { getLevel, getLevelBadge, ROLE_LABEL, escapeHtml } from "./utils.js";

export function userBadgeHtml({ username, role, likesReceived = 0, postsCount = 0 }) {
  const level = getLevel({ role, postsCount, likesReceived });
  const badge = getLevelBadge(level.level);
  const roleLabel = ROLE_LABEL[role];

  const roleHtml = roleLabel
    ? `<span class="role-tag ${role === "owner" ? "owner" : ""}">${escapeHtml(roleLabel)}</span>`
    : "";

  const levelHtml = badge
    ? `<img src="${badge.src}" alt="${escapeHtml(level.label)}" title="${escapeHtml(level.label)}" width="${badge.width}" height="${badge.height}" class="level-badge-img" />`
    : "";

  return `
    <span class="user-badge">
      <span class="name">${escapeHtml(username)}</span>
      ${roleHtml}
      ${levelHtml}
    </span>
  `;
}
