/**
 * Fiche d'un groupe (maquette 3c) : points pour tout le groupe, barème du TP, malus conduite,
 * commentaire, photos et membres. Ouverte d'un tap sur l'en-tête de l'îlot.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Camera } from 'lucide-react-native';
import { BottomSheet } from '../session/BottomSheet';
import { theme } from '../../constants/theme';
import type { GradingCriteria, GroupSessionPhoto } from '../../types';
import type { SessionGroupWithDetails } from '../../stores/groupSessionStore';
import { groupScore, stepPoints, tpGroupColor } from '../../utils/tpGroups';
import { TpPhotoThumb } from './TpPhotoThumb';

export interface SheetMember {
  id: string;
  label: string;
  absent: boolean;
  out: boolean;
}

interface Props {
  visible: boolean;
  group: SessionGroupWithDetails | null;
  criteria: GradingCriteria[];
  maxScore: number;
  members: SheetMember[];
  photos: GroupSessionPhoto[];
  photoLabel: (photo: GroupSessionPhoto) => string;
  groupPoints: { plus: number; minus: number };
  onGroupPoint: (type: 'participation' | 'bavardage') => void;
  onGrade: (criteriaId: string, points: number) => void;
  onMalus: (delta: number) => void;
  onComment: (text: string) => void;
  onTakePhoto: () => void;
  onPhotoPress: (photo: GroupSessionPhoto) => void;
  onMemberPress: (studentId: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','));

export function GroupSheet({
  visible, group, criteria, maxScore, members, photos, photoLabel, groupPoints,
  onGroupPoint, onGrade, onMalus, onComment, onTakePhoto, onPhotoPress, onMemberPress, onPrev, onNext, onClose,
}: Props) {
  const [comment, setComment] = useState(group?.comment ?? '');
  const savedComment = useRef(group?.comment ?? '');

  useEffect(() => {
    setComment(group?.comment ?? '');
    savedComment.current = group?.comment ?? '';
  }, [group?.id, visible]);

  const flushComment = () => {
    if (!group) return;
    if (comment.trim() !== (savedComment.current ?? '').trim()) {
      savedComment.current = comment;
      onComment(comment);
    }
  };

  if (!group) return null;
  const c = tpGroupColor(group.displayOrder);
  const pointsOf = (criteriaId: string) => group.grades.find((g) => g.criteriaId === criteriaId)?.pointsAwarded;
  const score = groupScore(group.grades.map((g) => g.pointsAwarded), group.conductMalus);
  const recipients = members.filter((m) => !m.absent && !m.out);
  const excluded = members.filter((m) => m.absent || m.out);

  const close = () => {
    flushComment();
    onClose();
  };
  const go = (fn: () => void) => () => {
    flushComment();
    fn();
  };

  return (
    <BottomSheet visible={visible} onClose={close} avoidKeyboard>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.head, { backgroundColor: c.soft, borderColor: c.border }]}>
          <View style={styles.flex}>
            <Text style={[styles.headName, { color: c.text }]}>{group.name}</Text>
            <Text style={[styles.headMembers, { color: c.text }]} numberOfLines={2}>
              {members.length === 0
                ? 'Aucun élève'
                : members.map((m) => `${m.label}${m.absent ? ' (absent)' : m.out ? ' (sorti)' : ''}`).join(', ')}
            </Text>
          </View>
          <Pressable style={styles.nav} onPress={go(onPrev)} accessibilityLabel="Groupe précédent">
            <Text style={[styles.navText, { color: c.text }]}>◀</Text>
          </Pressable>
          <Pressable style={styles.nav} onPress={go(onNext)} accessibilityLabel="Groupe suivant">
            <Text style={[styles.navText, { color: c.text }]}>▶</Text>
          </Pressable>
        </View>

        <View style={styles.row}>
          <Pressable
            style={({ pressed }) => [styles.pointBtn, styles.plusBtn, pressed && styles.pressed]}
            onPress={() => onGroupPoint('participation')}
            disabled={recipients.length === 0}
          >
            <Text style={styles.plusText}>+ Implication</Text>
            <Text style={styles.plusSub}>groupe : +{groupPoints.plus}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.pointBtn, styles.minusBtn, pressed && styles.pressed]}
            onPress={() => onGroupPoint('bavardage')}
            disabled={recipients.length === 0}
          >
            <Text style={styles.minusText}>− Malus</Text>
            <Text style={styles.minusSub}>groupe : −{groupPoints.minus}</Text>
          </Pressable>
        </View>
        <Text style={styles.small}>
          {recipients.length === 0
            ? 'Personne de présent dans ce groupe.'
            : `Compte pour ${recipients.map((m) => m.label).join(', ')}.${excluded.length > 0 ? ` ${excluded.map((m) => m.label).join(', ')} ne reçoi${excluded.length > 1 ? 'vent' : 't'} rien.` : ''}`}
        </Text>

        <View style={styles.secRow}>
          <Text style={styles.sec}>BARÈME DU TP</Text>
          <Text style={styles.score}>{fmt(score)} / {fmt(maxScore)}</Text>
        </View>
        <View>
          {criteria.map((cr) => {
            const pts = pointsOf(cr.id);
            return (
              <View key={cr.id} style={styles.crit}>
                <Text style={styles.critLabel} numberOfLines={2}>{cr.label}</Text>
                {/* Critère pas encore noté : premier « + » = tous les points, premier « − » = zéro */}
                <Pressable style={styles.step} onPress={() => onGrade(cr.id, pts === undefined ? 0 : stepPoints(pts, -0.5, cr.maxPoints))} accessibilityLabel={`${cr.label}, moins`}>
                  <Text style={styles.stepText}>−</Text>
                </Pressable>
                <Text style={[styles.val, pts === undefined && styles.valEmpty]}>
                  {pts === undefined ? '–' : fmt(pts)} / {fmt(cr.maxPoints)}
                </Text>
                <Pressable style={styles.step} onPress={() => onGrade(cr.id, pts === undefined ? cr.maxPoints : stepPoints(pts, 0.5, cr.maxPoints))} accessibilityLabel={`${cr.label}, plus`}>
                  <Text style={styles.stepText}>+</Text>
                </Pressable>
              </View>
            );
          })}
          <View style={[styles.crit, styles.critLast]}>
            <Text style={[styles.critLabel, styles.malusLabel]}>Malus conduite (retiré de la note)</Text>
            <Pressable style={styles.step} onPress={() => group.conductMalus > 0 && onMalus(-1)} accessibilityLabel="Malus conduite, moins">
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Text style={[styles.val, styles.malusLabel]}>{group.conductMalus > 0 ? `−${fmt(group.conductMalus)}` : '0'}</Text>
            <Pressable style={styles.step} onPress={() => onMalus(1)} accessibilityLabel="Malus conduite, plus">
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sec}>COMMENTAIRE AU GROUPE</Text>
        <TextInput
          style={styles.comment}
          value={comment}
          onChangeText={setComment}
          onEndEditing={flushComment}
          onBlur={flushComment}
          placeholder="Ce que le groupe doit retenir de sa manipulation"
          placeholderTextColor={theme.colors.textTertiary}
          multiline
          maxLength={500}
        />

        <View style={styles.secRow}>
          <Text style={styles.sec}>PHOTOS · VISIBLES PAR LE GROUPE</Text>
          <Text style={styles.small}>{photos.length}</Text>
        </View>
        <View style={styles.photos}>
          {photos.map((p) => (
            <TpPhotoThumb key={p.id} photo={p} size={72} label={photoLabel(p)} onPress={go(() => onPhotoPress(p))} />
          ))}
          <Pressable style={styles.addPhoto} onPress={go(onTakePhoto)} accessibilityLabel={`Prendre une photo pour ${group.name}`}>
            <Camera size={26} color={theme.colors.primary} />
          </Pressable>
        </View>

        <Text style={styles.sec}>MEMBRES · TOUCHER POUR CHANGER DE GROUPE</Text>
        <View style={styles.members}>
          {members.map((m) => (
            <Pressable key={m.id} style={({ pressed }) => [styles.member, pressed && styles.pressed]} onPress={go(() => onMemberPress(m.id))}>
              <Text style={[styles.memberText, m.absent && styles.memberAbsent]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  body: { gap: 12, paddingBottom: 8 },
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, paddingLeft: 14, borderRadius: 14, borderWidth: 1.5 },
  headName: { fontSize: 18, fontFamily: theme.fonts.bodyBold },
  headMembers: { fontSize: 12, fontFamily: theme.fonts.body },
  nav: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 14 },
  row: { flexDirection: 'row', gap: 8 },
  pointBtn: { flex: 1, height: 60, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  plusBtn: { backgroundColor: theme.colors.participationSoft, borderColor: '#A7E3C9' },
  minusBtn: { backgroundColor: theme.colors.bavardageSoft, borderColor: '#FCD9A0' },
  plusText: { fontSize: 15, fontFamily: theme.fonts.bodyBold, color: '#047857' },
  plusSub: { fontSize: 11, fontFamily: theme.fonts.bodySemibold, color: '#047857' },
  minusText: { fontSize: 15, fontFamily: theme.fonts.bodyBold, color: theme.colors.bavardageText },
  minusSub: { fontSize: 11, fontFamily: theme.fonts.bodySemibold, color: theme.colors.bavardageText },
  small: { ...theme.typography.caption, color: theme.colors.textSecondary },
  secRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  sec: { ...theme.typography.labelSmall, color: theme.colors.textSecondary, letterSpacing: 0.3 },
  score: { fontSize: 18, fontFamily: theme.fonts.bodyBold, color: theme.colors.text },
  crit: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  critLast: { borderBottomWidth: 0 },
  critLabel: { flex: 1, ...theme.typography.bodySmall, color: theme.colors.text },
  malusLabel: { color: theme.colors.bavardageText },
  step: { width: 44, height: 44, borderRadius: 10, backgroundColor: theme.colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontFamily: theme.fonts.bodySemibold, color: theme.colors.text },
  val: { minWidth: 56, textAlign: 'center', fontSize: 14, fontFamily: theme.fonts.bodyBold, color: theme.colors.text },
  valEmpty: { color: theme.colors.textTertiary },
  comment: {
    minHeight: 64, borderRadius: 12, backgroundColor: theme.colors.surfaceSecondary, paddingHorizontal: 12, paddingVertical: 10,
    ...theme.typography.bodySmall, color: theme.colors.text, textAlignVertical: 'top',
  },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addPhoto: {
    width: 72, height: 72, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: theme.colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  member: { minHeight: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center' },
  memberText: { ...theme.typography.label, color: theme.colors.text },
  memberAbsent: { color: theme.colors.absentText, textDecorationLine: 'line-through' },
});
