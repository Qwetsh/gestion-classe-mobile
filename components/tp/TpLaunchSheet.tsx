/**
 * Lancer un TP, étapes 1 et 2 (maquettes 1b et 1c) : choisir le TP, puis régler son barème.
 * Aucune écriture en base ici : le résultat part dans onConfirm.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { FlaskConical, Search, X, ChevronLeft, Check } from 'lucide-react-native';
import { BottomSheet } from '../session/BottomSheet';
import { theme } from '../../constants/theme';
import type { TpTemplateWithCriteria } from '../../services/database';
import { levelOfClassName, sortTemplatesForClass, stepPoints } from '../../utils/tpGroups';

export interface TpLaunchResult {
  templateId: string | null;
  name: string;
  criteria: Array<{ label: string; maxPoints: number }>;
  /** Recopier le barème modifié dans le modèle (« Mes TP ») */
  updateTemplate: boolean;
}

interface Props {
  visible: boolean;
  className: string | null;
  templates: TpTemplateWithCriteria[];
  suggestedId: string | null;
  onClose: () => void;
  onConfirm: (result: TpLaunchResult) => void;
}

interface EditableCriterion {
  key: string;
  label: string;
  maxPoints: number;
}

let keySeq = 0;
const newKey = () => `c${++keySeq}`;

export function TpLaunchSheet({ visible, className, templates, suggestedId, onClose, onConfirm }: Props) {
  const [step, setStep] = useState<'tp' | 'bareme'>('tp');
  const [query, setQuery] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const [template, setTemplate] = useState<TpTemplateWithCriteria | null>(null);
  const [name, setName] = useState('');
  const [criteria, setCriteria] = useState<EditableCriterion[]>([]);
  const [updateTemplate, setUpdateTemplate] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep('tp');
    setQuery('');
    setShowOthers(false);
    setTemplate(null);
    setUpdateTemplate(false);
  }, [visible]);

  const classLevel = levelOfClassName(className);
  const { suggested, sameLevel, others } = useMemo(
    () => sortTemplatesForClass(templates, classLevel, suggestedId),
    [templates, classLevel, suggestedId]
  );

  const q = query.trim().toLocaleLowerCase('fr');
  const matches = (t: TpTemplateWithCriteria) => !q || t.name.toLocaleLowerCase('fr').includes(q);

  const chooseTemplate = (t: TpTemplateWithCriteria | null) => {
    setTemplate(t);
    setName(t?.name ?? '');
    setCriteria(
      t && t.criteria.length > 0
        ? t.criteria.map((c) => ({ key: newKey(), label: c.label, maxPoints: c.maxPoints }))
        : [
            { key: newKey(), label: 'Respect du protocole', maxPoints: 3 },
            { key: newKey(), label: 'Soin des gestes', maxPoints: 2 },
            { key: newKey(), label: 'Consignes de sécurité', maxPoints: 2 },
            { key: newKey(), label: 'Rangement et nettoyage', maxPoints: 2 },
            { key: newKey(), label: 'Calme du groupe', maxPoints: 1 },
          ]
    );
    setUpdateTemplate(false);
    setStep('bareme');
  };

  const total = criteria.reduce((s, c) => s + c.maxPoints, 0);
  const canConfirm = name.trim().length > 0 && criteria.length > 0 && criteria.every((c) => c.label.trim().length > 0 && c.maxPoints > 0);

  const confirm = () => {
    if (!canConfirm) return;
    onConfirm({
      templateId: template?.id ?? null,
      name: name.trim(),
      criteria: criteria.map((c) => ({ label: c.label.trim(), maxPoints: c.maxPoints })),
      updateTemplate: !!template && updateTemplate,
    });
  };

  const renderRow = (t: TpTemplateWithCriteria) => (
    <Pressable
      key={t.id}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => chooseTemplate(t)}
    >
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>{t.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[t.chapter, t.activity ? `Activité ${t.activity}` : null, `/${formatPts(t.totalPoints)}`].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={styles.chevron}>▶</Text>
    </Pressable>
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} avoidKeyboard>
      {step === 'tp' ? (
        <View style={styles.body}>
          <View style={styles.headRow}>
            <View style={styles.flex}>
              <Text style={styles.stepLabel}>Étape 1 sur 4</Text>
              <Text style={styles.title}>Quel TP aujourd'hui ?</Text>
            </View>
            <Pressable style={styles.iconBtn} onPress={onClose} accessibilityLabel="Fermer">
              <X size={20} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {suggested && matches(suggested) && (
              <>
                <Text style={styles.section}>Proposé (déjà fait dans une autre classe)</Text>
                <Pressable style={({ pressed }) => [styles.suggest, pressed && styles.pressed]} onPress={() => chooseTemplate(suggested)}>
                  <View style={styles.suggestIcon}>
                    <FlaskConical size={22} color="#FFFFFF" />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.suggestTitle}>{suggested.name}</Text>
                    <Text style={styles.suggestSub}>
                      {[suggested.level, suggested.chapter, `barème /${formatPts(suggested.totalPoints)}`].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                </Pressable>
              </>
            )}

            <View style={styles.search}>
              <Search size={18} color={theme.colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder={classLevel ? `Chercher un TP de ${classLevel}` : 'Chercher un TP'}
                placeholderTextColor={theme.colors.textTertiary}
                value={query}
                onChangeText={setQuery}
              />
            </View>

            {sameLevel.filter(matches).length > 0 && (
              <Text style={styles.section}>TP de {classLevel}</Text>
            )}
            {sameLevel.filter(matches).map(renderRow)}

            {others.filter(matches).length > 0 && (
              q || showOthers || sameLevel.length === 0 ? (
                <>
                  <Text style={styles.section}>{classLevel ? 'Autres niveaux' : 'Mes TP'}</Text>
                  {others.filter(matches).map(renderRow)}
                </>
              ) : (
                <Pressable style={styles.linkBtn} onPress={() => setShowOthers(true)}>
                  <Text style={styles.linkText}>Voir les TP des autres niveaux ({others.length})</Text>
                </Pressable>
              )
            )}
          </ScrollView>

          <Pressable style={({ pressed }) => [styles.dashedBtn, pressed && styles.pressed]} onPress={() => chooseTemplate(null)}>
            <Text style={styles.dashedText}>Un TP qui n'est pas dans Mes TP : barème sur place</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.body}>
          <View style={styles.headRow}>
            <Pressable style={styles.iconBtn} onPress={() => setStep('tp')} accessibilityLabel="Retour au choix du TP">
              <ChevronLeft size={20} color={theme.colors.text} />
            </Pressable>
            <View style={styles.flex}>
              <Text style={styles.stepLabel}>Étape 2 sur 4</Text>
              <Text style={styles.title}>Barème de la manipulation</Text>
            </View>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {template ? (
              <Text style={styles.tpName}>{template.name}</Text>
            ) : (
              <TextInput
                style={styles.nameInput}
                placeholder="Nom du TP"
                placeholderTextColor={theme.colors.textTertiary}
                value={name}
                onChangeText={setName}
              />
            )}

            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Total du TP</Text>
              <Text style={styles.totalValue}>{formatPts(total)} pts</Text>
            </View>

            {criteria.map((c, i) => (
              <View key={c.key} style={styles.crit}>
                <TextInput
                  style={styles.critInput}
                  value={c.label}
                  onChangeText={(text) => setCriteria((all) => all.map((x) => (x.key === c.key ? { ...x, label: text } : x)))}
                  placeholder={`Critère ${i + 1}`}
                  placeholderTextColor={theme.colors.textTertiary}
                />
                <Pressable
                  style={styles.step}
                  accessibilityLabel="Moins"
                  onPress={() => setCriteria((all) => all.map((x) => (x.key === c.key ? { ...x, maxPoints: Math.max(0.5, stepPoints(x.maxPoints, -0.5, 99)) } : x)))}
                >
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={styles.val}>{formatPts(c.maxPoints)}</Text>
                <Pressable
                  style={styles.step}
                  accessibilityLabel="Plus"
                  onPress={() => setCriteria((all) => all.map((x) => (x.key === c.key ? { ...x, maxPoints: stepPoints(x.maxPoints, 0.5, 40) } : x)))}
                >
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
                <Pressable
                  style={styles.remove}
                  accessibilityLabel={`Retirer ${c.label}`}
                  onPress={() => setCriteria((all) => all.filter((x) => x.key !== c.key))}
                >
                  <X size={16} color={theme.colors.textTertiary} />
                </Pressable>
              </View>
            ))}

            <Pressable
              style={({ pressed }) => [styles.dashedBtn, pressed && styles.pressed]}
              onPress={() => setCriteria((all) => [...all, { key: newKey(), label: '', maxPoints: 1 }])}
            >
              <Text style={styles.dashedText}>+ Ajouter un critère</Text>
            </Pressable>

            <View style={styles.note}>
              <Text style={styles.noteText}>
                Le malus conduite se règle par groupe pendant le TP et se retire de cette note. Les résultats (tableau, schéma) sont notés sur la fiche d'activité.
              </Text>
            </View>

            {template && (
              <Pressable style={styles.checkRow} onPress={() => setUpdateTemplate((v) => !v)}>
                <View style={[styles.checkbox, updateTemplate && styles.checkboxOn]}>
                  {updateTemplate && <Check size={16} color="#FFFFFF" strokeWidth={3} />}
                </View>
                <Text style={styles.checkLabel}>Mettre aussi à jour ce barème dans Mes TP</Text>
              </Pressable>
            )}
          </ScrollView>

          <Pressable
            style={({ pressed }) => [styles.primary, !canConfirm && styles.primaryOff, pressed && canConfirm && styles.pressed]}
            onPress={confirm}
          >
            <Text style={styles.primaryText}>{canConfirm ? 'Former les groupes' : 'Nommez le TP et ses critères'}</Text>
          </Pressable>
        </View>
      )}
    </BottomSheet>
  );
}

function formatPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}

const styles = StyleSheet.create({
  body: { gap: 12, maxHeight: 640 },
  flex: { flex: 1 },
  scroll: { flexGrow: 0 },
  pressed: { opacity: 0.7 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepLabel: { ...theme.typography.labelSmall, color: theme.colors.primary },
  title: { ...theme.typography.h2, color: theme.colors.text },
  iconBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  section: { ...theme.typography.labelSmall, color: theme.colors.textSecondary, marginTop: 12, marginBottom: 6 },
  suggest: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16,
    borderWidth: 2, borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft,
  },
  suggestIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: theme.colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  suggestTitle: { ...theme.typography.bodyMedium, fontFamily: theme.fonts.bodyBold, color: theme.colors.text },
  suggestSub: { ...theme.typography.caption, color: theme.colors.primaryDark },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 12, marginTop: 14,
    borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary,
  },
  searchInput: { flex: 1, ...theme.typography.bodySmall, color: theme.colors.text },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 12, marginBottom: 8,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.surface,
  },
  rowTitle: { ...theme.typography.label, color: theme.colors.text },
  rowSub: { ...theme.typography.caption, color: theme.colors.textSecondary },
  chevron: { color: theme.colors.textTertiary },
  linkBtn: { minHeight: 44, justifyContent: 'center' },
  linkText: { ...theme.typography.label, color: theme.colors.primary },
  dashedBtn: {
    minHeight: 48, borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.borderStrong, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 4,
  },
  dashedText: { ...theme.typography.label, color: theme.colors.primary, textAlign: 'center' },
  tpName: { ...theme.typography.h3, color: theme.colors.text, marginBottom: 8 },
  nameInput: {
    height: 48, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary, paddingHorizontal: 12,
    ...theme.typography.body, color: theme.colors.text, marginBottom: 8,
  },
  totalBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', padding: 12,
    borderRadius: 12, backgroundColor: theme.colors.primarySoft, marginBottom: 8,
  },
  totalLabel: { ...theme.typography.label, color: theme.colors.primaryDark },
  totalValue: { ...theme.typography.h2, color: theme.colors.primaryDark },
  crit: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 56, paddingLeft: 12, paddingRight: 4, marginBottom: 8,
    borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12,
  },
  critInput: { flex: 1, ...theme.typography.label, color: theme.colors.text, paddingVertical: 8 },
  step: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  stepText: { fontSize: 20, fontFamily: theme.fonts.bodySemibold, color: theme.colors.text },
  val: { minWidth: 34, textAlign: 'center', ...theme.typography.bodyMedium, fontFamily: theme.fonts.bodyBold, color: theme.colors.text },
  remove: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  note: { padding: 12, borderRadius: 12, backgroundColor: theme.colors.bavardageSoft, marginTop: 8 },
  noteText: { ...theme.typography.caption, color: theme.colors.bavardageText, lineHeight: 17 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, marginTop: 4 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: theme.colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkLabel: { flex: 1, ...theme.typography.bodySmall, color: theme.colors.text },
  primary: { height: 52, borderRadius: 14, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryOff: { backgroundColor: theme.colors.primaryLight },
  primaryText: { ...theme.typography.bodyMedium, fontFamily: theme.fonts.bodySemibold, color: '#FFFFFF' },
});
