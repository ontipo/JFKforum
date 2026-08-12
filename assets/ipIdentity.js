// Identité "porte-parole IP" — stockée localement (pas de session Supabase Auth,
// puisqu'il n'y a ni e-mail ni mot de passe pour ce type de compte).
export function getIpIdentity() {
  try {
    const raw = localStorage.getItem("ip_identity");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearIpIdentity() {
  localStorage.removeItem("ip_identity");
}
