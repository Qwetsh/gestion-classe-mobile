import {
  generatePseudonym,
  normalizeName,
  generateFullName,
} from '../../utils/pseudonymize';

describe('generatePseudonym', () => {
  it('should create pseudonym from first name + 2 uppercase letters of last name', () => {
    expect(generatePseudonym('Marie', 'Dupont')).toBe('Marie DU');
  });

  it('should handle lowercase last name', () => {
    expect(generatePseudonym('Thomas', 'martin')).toBe('Thomas MA');
  });

  it('should handle already uppercase last name', () => {
    expect(generatePseudonym('Aurélie', 'BERNARD')).toBe('Aurélie BE');
  });

  it('should handle single-character last name', () => {
    expect(generatePseudonym('Jean', 'O')).toBe('Jean O');
  });

  it('should handle empty last name', () => {
    expect(generatePseudonym('Jean', '')).toBe('Jean ');
  });

  it('should trim whitespace', () => {
    expect(generatePseudonym('  Marie  ', '  Dupont  ')).toBe('Marie DU');
  });

  it('should preserve accented characters in first name', () => {
    expect(generatePseudonym('Éloïse', 'Lefèvre')).toBe('Éloïse LE');
  });

  it('should handle compound first names', () => {
    expect(generatePseudonym('Jean-Pierre', 'Duval')).toBe('Jean-Pierre DU');
  });

  it('should handle hyphenated last names (takes first 2 chars)', () => {
    expect(generatePseudonym('Marie', 'De-La-Fontaine')).toBe('Marie DE');
  });

  it('should handle last name with apostrophe', () => {
    expect(generatePseudonym('Patrick', "d'Artagnan")).toBe("Patrick D'");
  });
});

describe('normalizeName', () => {
  it('should capitalize first letter of each word', () => {
    expect(normalizeName('marie dupont')).toBe('Marie Dupont');
  });

  it('should handle all uppercase input', () => {
    expect(normalizeName('JEAN MARTIN')).toBe('Jean Martin');
  });

  it('should handle mixed case', () => {
    expect(normalizeName('jEaN-pIeRRe')).toBe('Jean-pierre');
  });

  it('should trim extra whitespace', () => {
    expect(normalizeName('  marie   dupont  ')).toBe('Marie Dupont');
  });

  it('should handle single word', () => {
    expect(normalizeName('marie')).toBe('Marie');
  });

  it('should handle empty string', () => {
    expect(normalizeName('')).toBe('');
  });
});

describe('generateFullName', () => {
  it('should combine normalized first and last name', () => {
    expect(generateFullName('marie', 'DUPONT')).toBe('Marie Dupont');
  });

  it('should handle already normalized names', () => {
    expect(generateFullName('Thomas', 'Martin')).toBe('Thomas Martin');
  });
});
