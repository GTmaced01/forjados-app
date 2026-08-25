export const PASSWORD_MIN_LENGTH = 10;

export type PasswordRequirement = {
  id: 'length' | 'lowercase' | 'uppercase' | 'number' | 'symbol' | 'common';
  label: string;
  met: boolean;
};

const COMMON_PASSWORDS = new Set([
  '1234567890',
  'password123',
  'senha12345',
  'senha#1234',
  'forjados123',
  'forjados#2026',
]);

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  const normalizedPassword = password.normalize('NFKC').toLowerCase();

  return [
    {
      id: 'length',
      label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'lowercase',
      label: 'Uma letra minúscula',
      met: /\p{Ll}/u.test(password),
    },
    {
      id: 'uppercase',
      label: 'Uma letra maiúscula',
      met: /\p{Lu}/u.test(password),
    },
    {
      id: 'number',
      label: 'Um número',
      met: /\d/.test(password),
    },
    {
      id: 'symbol',
      label: 'Um símbolo',
      met: /[^\p{L}\p{N}\s]/u.test(password),
    },
    {
      id: 'common',
      label: 'Não ser uma senha comum',
      met: password.length > 0 && !COMMON_PASSWORDS.has(normalizedPassword),
    },
  ];
}

export function assertStrongPassword(password: string) {
  const missingRequirement = getPasswordRequirements(password).find((requirement) => !requirement.met);

  if (missingRequirement) {
    throw new Error(`A senha precisa atender ao requisito: ${missingRequirement.label.toLowerCase()}.`);
  }
}
