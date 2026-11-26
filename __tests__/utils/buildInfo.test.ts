import { formatBuildLabel } from '../../utils/buildInfo';

describe('formatBuildLabel', () => {
  it('donne la version et le commit d’un APK de production', () => {
    expect(formatBuildLabel('1.1.0', { commit: 'd04f405', profile: 'production' })).toBe('Version 1.1.0 · d04f405');
  });

  it('signale un APK qui n’est pas de production', () => {
    expect(formatBuildLabel('1.1.0', { commit: 'd1b583d', profile: 'preview' })).toBe('Version 1.1.0 · d1b583d · preview');
  });

  it('raccourcit un commit complet', () => {
    expect(formatBuildLabel('1.1.0', { commit: 'd1b583d0123456789abcdef', profile: 'production' })).toBe('Version 1.1.0 · d1b583d');
  });

  it('dit « développement » quand l’app ne vient pas d’un APK construit', () => {
    expect(formatBuildLabel('1.1.0', null)).toBe('Version 1.1.0 · développement');
    expect(formatBuildLabel('1.1.0', { commit: '', profile: 'development' })).toBe('Version 1.1.0 · développement');
  });

  it('tient sans numéro de version', () => {
    expect(formatBuildLabel(undefined, { commit: 'abc1234' })).toBe('Version inconnue · abc1234');
  });
});
