/**
 * Pseudonymization utility for RGPD compliance
 * Creates a pseudonym from first name and first 2 letters of last name
 *
 * Example: "Marie DUPONT" -> "Marie DU"
 */

/**
 * Generate a pseudonym from first name and last name
 * @param firstName - Student's first name
 * @param lastName - Student's last name
 * @returns Pseudonymized name (firstName + 2 uppercase letters)
 */
export function generatePseudonym(firstName: string, lastName: string): string {
  const cleanFirstName = firstName.trim();
  const cleanLastName = lastName.trim().toUpperCase();

  // Take first 2 characters of last name (or all if less than 2)
  const lastNamePrefix = cleanLastName.substring(0, 2);

  return `${cleanFirstName} ${lastNamePrefix}`;
}

/**
 * Normalize a name for consistent storage
 * Capitalizes first letter of each word
 */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Generate full name from first and last name
 */
export function generateFullName(firstName: string, lastName: string): string {
  return `${normalizeName(firstName)} ${normalizeName(lastName)}`;
}
