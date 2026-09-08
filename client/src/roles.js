// Human labels for the stored role values, used wherever a role is shown.
export const ROLE_LABEL = {
  admin: 'Super Admin',
  registrar: 'Registering Officer',
  gate_scanner: 'Gate Personnel', // legacy — no longer created
  district_scanner: 'Check Post Officer',
};

export function roleLabel(role) {
  return ROLE_LABEL[role] || role;
}
