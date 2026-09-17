/**
 * Vue « Répartition » : groupes de classe (demi-groupes durables) d'une classe.
 *
 * Gestes :
 *  - tap sur un élève : passe dans l'autre groupe (2 groupes), sinon choix de la cible
 *  - appui long : mode sélection (déplacer plusieurs, échanger 1 <-> 1)
 *  - annulation après chaque geste (UndoBanner)
 * Distinct des groupes de TP (écran group-session/).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeftRight, ChevronLeft, MoreHorizontal, Plus, Scale, Shuffle } from 'lucide-react-native';
import {
  useAuthStore,
  useClassGroupStore,
  useClassStore,
  useRoomStore,
  useStudentStore,
  type StudentWithMapping,
} from '../../../../stores';
import { BottomSheet, UndoBanner } from '../../../../components/session';
import { theme } from '../../../../constants/theme';
import { CLASS_GROUP_COLORS, classGroupColor } from '../../../../constants/classGroupColors';
import type { ClassGroup } from '../../../../types';
import type { AutoSplitMode } from '../../../../utils/sessionRoster';

const UNASSIGNED = '__unassigned__';

type SheetKind =
  | { kind: 'none' }
  | { kind: 'target'; studentIds: string[] }
  | { kind: 'create' }
  | { kind: 'group'; group: ClassGroup }
  | { kind: 'autosplit' }
  | { kind: 'fromRoom'; groupId: string | null }
  | { kind: 'more' };

interface UndoState {
  message: string;
  run: () => Promise<void>;
}

export default function ClassGroupsScreen() {
  const { id: classId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthStore();
  const { classes } = useClassStore();
  const { studentsByClass, loadStudentsForClass } = useStudentStore();
  const { rooms, loadRooms } = useRoomStore();
  const {
    groupsByClass,
    membersByClass,
    isLoading,
    error,
    clearError,
    loadForClass,
    createGroup,
    updateGroup,
    deleteGroup,
    moveStudent,
    moveStudents,
    swapStudents,
    applyAutoSplit,
    createDefaultPair,
    fillGroupFromRoomPlan,
    balance,
  } = useClassGroupStore();

  const [sheet, setSheet] = useState<SheetKind>({ kind: 'none' });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [busy, setBusy] = useState(false);

  // Formulaires des sheets
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<string>(CLASS_GROUP_COLORS[0].key);

  const currentClass = classes.find(c => c.id === classId) ?? null;
  const students: StudentWithMapping[] = classId ? studentsByClass[classId] ?? [] : [];
  const groups = classId ? groupsByClass[classId] ?? [] : [];
  const members = classId ? membersByClass[classId] ?? [] : [];

  useEffect(() => {
    if (!classId || !user?.id) return;
    loadForClass(classId);
    loadStudentsForClass(classId);
    loadRooms(user.id);
  }, [classId, user?.id, loadForClass, loadStudentsForClass, loadRooms]);

  useEffect(() => {
    if (error) {
      Alert.alert('Erreur', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  // studentId -> groupes auxquels il appartient (peut etre > 1 apres une fusion hors ligne)
  const groupsOfStudent = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of members) {
      const list = map.get(m.student_id) ?? [];
      list.push(m.group_id);
      map.set(m.student_id, list);
    }
    return map;
  }, [members]);

  const sortedStudents = useMemo(
    () => [...students].sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr')),
    [students]
  );

  const columns = useMemo(() => {
    const byGroup = new Map<string, StudentWithMapping[]>();
    for (const g of groups) byGroup.set(g.id, []);
    const unassigned: StudentWithMapping[] = [];
    for (const s of sortedStudents) {
      const gids = (groupsOfStudent.get(s.id) ?? []).filter(gid => byGroup.has(gid));
      if (gids.length === 0) unassigned.push(s);
      for (const gid of gids) byGroup.get(gid)!.push(s);
    }
    return { byGroup, unassigned };
  }, [groups, sortedStudents, groupsOfStudent]);

  const groupName = useCallback(
    (groupId: string | null) => (groupId ? groups.find(g => g.id === groupId)?.name ?? '?' : 'Non affecté'),
    [groups]
  );

  const displayName = (s: StudentWithMapping) => s.fullName || s.pseudo;

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  const runWithUndo = useCallback(
    async (action: () => Promise<void>, message: string, undoRun: () => Promise<void>) => {
      setBusy(true);
      try {
        await action();
        setUndo({ message, run: undoRun });
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const doMove = useCallback(
    async (studentIds: string[], toGroupId: string | null) => {
      if (!classId || studentIds.length === 0) return;
      // Etat precedent pour l'annulation : premier groupe connu de chaque eleve
      const previous = studentIds.map(sid => ({ sid, from: (groupsOfStudent.get(sid) ?? [null])[0] ?? null }));
      const label =
        studentIds.length === 1
          ? `${displayName(students.find(s => s.id === studentIds[0])!)} → ${groupName(toGroupId)}`
          : `${studentIds.length} élèves → ${groupName(toGroupId)}`;
      await runWithUndo(
        () => moveStudents(classId, studentIds, toGroupId),
        label,
        async () => {
          for (const p of previous) await moveStudent(classId, p.sid, p.from);
        }
      );
      setSelected(new Set());
      setSelectionMode(false);
      setSheet({ kind: 'none' });
    },
    [classId, groupsOfStudent, students, groupName, moveStudents, moveStudent, runWithUndo]
  );

  const handleStudentPress = useCallback(
    (student: StudentWithMapping, fromGroupId: string | null) => {
      if (selectionMode) {
        setSelected(prev => {
          const next = new Set(prev);
          if (next.has(student.id)) next.delete(student.id);
          else next.add(student.id);
          return next;
        });
        return;
      }
      const memberOf = groupsOfStudent.get(student.id) ?? [];
      // Conflit (dans plusieurs groupes) : un tap dans une colonne = on garde cette colonne
      if (fromGroupId && memberOf.length > 1) {
        doMove([student.id], fromGroupId);
        return;
      }
      if (groups.length === 2 && fromGroupId) {
        const other = groups.find(g => g.id !== fromGroupId);
        if (other) {
          doMove([student.id], other.id);
          return;
        }
      }
      if (groups.length === 1 && !fromGroupId) {
        doMove([student.id], groups[0].id);
        return;
      }
      setSheet({ kind: 'target', studentIds: [student.id] });
    },
    [selectionMode, groupsOfStudent, groups, doMove]
  );

  const handleStudentLongPress = useCallback((student: StudentWithMapping) => {
    setSelectionMode(true);
    setSelected(prev => new Set(prev).add(student.id));
  }, []);

  const selectedList = useMemo(() => [...selected], [selected]);
  const canSwap = useMemo(() => {
    if (selectedList.length !== 2) return false;
    const [a, b] = selectedList.map(sid => (groupsOfStudent.get(sid) ?? [null])[0] ?? null);
    return a !== b;
  }, [selectedList, groupsOfStudent]);

  const handleSwap = useCallback(async () => {
    if (!classId || !canSwap) return;
    const [a, b] = selectedList;
    const ga = (groupsOfStudent.get(a) ?? [null])[0] ?? null;
    const gb = (groupsOfStudent.get(b) ?? [null])[0] ?? null;
    const sa = students.find(s => s.id === a)!;
    const sb = students.find(s => s.id === b)!;
    await runWithUndo(
      () => swapStudents(classId, a, ga, b, gb),
      `${displayName(sa)} ⇄ ${displayName(sb)}`,
      () => swapStudents(classId, a, gb, b, ga)
    );
    setSelected(new Set());
    setSelectionMode(false);
  }, [classId, canSwap, selectedList, groupsOfStudent, students, swapStudents, runWithUndo]);

  const handleUndo = useCallback(async () => {
    const u = undo;
    setUndo(null);
    if (!u) return;
    setBusy(true);
    try {
      await u.run();
    } finally {
      setBusy(false);
    }
  }, [undo]);

  const openCreate = () => {
    setDraftName(`Groupe ${groups.length + 1}`);
    const used = new Set(groups.map(g => g.color));
    setDraftColor((CLASS_GROUP_COLORS.find(c => !used.has(c.key)) ?? CLASS_GROUP_COLORS[0]).key);
    setSheet({ kind: 'create' });
  };

  const handleCreate = async () => {
    if (!classId || !user?.id || !draftName.trim()) return;
    setBusy(true);
    try {
      await createGroup(user.id, classId, draftName, draftColor);
    } finally {
      setBusy(false);
      setSheet({ kind: 'none' });
    }
  };

  const openGroupSheet = (group: ClassGroup) => {
    setDraftName(group.name);
    setDraftColor(group.color ?? classGroupColor(null, groups.indexOf(group)).key);
    setSheet({ kind: 'group', group });
  };

  const handleSaveGroup = async () => {
    if (sheet.kind !== 'group' || !classId) return;
    const updates: { name?: string; color?: string } = {};
    if (draftName.trim() && draftName.trim() !== sheet.group.name) updates.name = draftName;
    if (draftColor !== sheet.group.color) updates.color = draftColor;
    if (Object.keys(updates).length > 0) {
      setBusy(true);
      try {
        await updateGroup(classId, sheet.group.id, updates);
      } finally {
        setBusy(false);
      }
    }
    setSheet({ kind: 'none' });
  };

  const handleDeleteGroup = (group: ClassGroup) => {
    if (!classId) return;
    const count = columns.byGroup.get(group.id)?.length ?? 0;
    Alert.alert(
      `Supprimer « ${group.name} » ?`,
      `${count} élève(s) redeviendront non affectés. Les séances passées de ce groupe redeviendront « classe entière ». Les plans de ce groupe seront supprimés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteGroup(classId, group.id);
            } finally {
              setBusy(false);
              setSheet({ kind: 'none' });
            }
          },
        },
      ]
    );
  };

  const handleAutoSplit = async (mode: AutoSplitMode) => {
    if (!classId) return;
    setBusy(true);
    try {
      await applyAutoSplit(classId, students, mode);
    } finally {
      setBusy(false);
      setSheet({ kind: 'none' });
      setUndo(null);
    }
  };

  const handleCreateDefaultPair = async () => {
    if (!classId || !user?.id) return;
    setBusy(true);
    try {
      await createDefaultPair(user.id, classId, students);
    } finally {
      setBusy(false);
    }
  };

  const handleFromRoom = async (roomId: string) => {
    if (!classId || !user?.id || sheet.kind !== 'fromRoom') return;
    const roomName = rooms.find(r => r.id === roomId)?.name ?? 'salle';
    setBusy(true);
    try {
      let groupId = sheet.groupId;
      if (!groupId) {
        const created = await createGroup(user.id, classId, roomName);
        if (!created) return;
        groupId = created.id;
      }
      const n = await fillGroupFromRoomPlan(classId, groupId, roomId);
      Alert.alert('Import terminé', `${n} élève(s) placés dans « ${roomName} » ont rejoint « ${groupName(groupId)} ».`);
    } finally {
      setBusy(false);
      setSheet({ kind: 'none' });
      setUndo(null);
    }
  };

  const handleBalance = async () => {
    if (!classId) return;
    setBusy(true);
    try {
      const n = await balance(classId, students);
      if (n === 0) Alert.alert('Rien à équilibrer', 'Tous les élèves sont déjà affectés.');
    } finally {
      setBusy(false);
      setUndo(null);
    }
  };

  // ------------------------------------------------------------------
  // Rendu
  // ------------------------------------------------------------------

  const renderChip = (student: StudentWithMapping, groupId: string | null, colorMain: string) => {
    const isSelected = selected.has(student.id);
    const conflict = (groupsOfStudent.get(student.id) ?? []).length > 1;
    return (
      <Pressable
        key={`${groupId ?? UNASSIGNED}:${student.id}`}
        onPress={() => handleStudentPress(student, groupId)}
        onLongPress={() => handleStudentLongPress(student)}
        delayLongPress={350}
        disabled={busy}
        style={({ pressed }) => [
          styles.chip,
          { borderColor: isSelected ? theme.colors.primary : theme.colors.border },
          isSelected && styles.chipSelected,
          pressed && styles.chipPressed,
        ]}
      >
        {selectionMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
            {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
          </View>
        )}
        <View style={[styles.chipDot, { backgroundColor: groupId ? colorMain : theme.colors.textTertiary }]} />
        <Text style={styles.chipText} numberOfLines={1}>
          {displayName(student)}
        </Text>
        {conflict && <Text style={styles.chipWarn}>!</Text>}
      </Pressable>
    );
  };

  const renderColumn = (title: string, groupId: string | null, list: StudentWithMapping[], index: number, group?: ClassGroup) => {
    const color = groupId ? classGroupColor(group?.color, index) : null;
    const main = color?.main ?? theme.colors.textTertiary;
    return (
      <View key={groupId ?? UNASSIGNED} style={[styles.column, groupId ? { borderLeftColor: main } : styles.columnUnassigned]}>
        <View style={styles.columnHeader}>
          <View style={styles.columnTitleRow}>
            <View style={[styles.columnDot, { backgroundColor: main }]} />
            <Text style={styles.columnTitle}>{title}</Text>
            <View style={[styles.countBadge, groupId ? { backgroundColor: color?.soft } : null]}>
              <Text style={[styles.countText, groupId ? { color: main } : null]}>{list.length}</Text>
            </View>
          </View>
          {group ? (
            <Pressable onPress={() => openGroupSheet(group)} hitSlop={8} style={styles.iconButton}>
              <MoreHorizontal size={18} color={theme.colors.textSecondary} />
            </Pressable>
          ) : list.length > 0 && groups.length > 0 ? (
            <Pressable onPress={handleBalance} hitSlop={8} style={styles.balanceButton} disabled={busy}>
              <Scale size={14} color={theme.colors.primary} />
              <Text style={styles.balanceText}>Équilibrer</Text>
            </Pressable>
          ) : null}
        </View>
        {list.length === 0 ? (
          <Text style={styles.columnEmpty}>{groupId ? 'Aucun élève. Touchez un élève pour l’envoyer ici.' : 'Tous les élèves sont affectés.'}</Text>
        ) : (
          <View style={styles.chipsWrap}>{list.map(s => renderChip(s, groupId, main))}</View>
        )}
      </View>
    );
  };

  const hasConflicts = useMemo(
    () => [...groupsOfStudent.values()].some(gids => gids.filter(gid => columns.byGroup.has(gid)).length > 1),
    [groupsOfStudent, columns.byGroup]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <UndoBanner
        visible={undo !== null}
        message={undo?.message ?? ''}
        canUndo
        onUndo={handleUndo}
        onDismiss={() => setUndo(null)}
      />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <ChevronLeft size={22} color={theme.colors.text} strokeWidth={2} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Groupes</Text>
          {currentClass && <Text style={styles.headerSubtitle}>{currentClass.name}</Text>}
        </View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => setSheet({ kind: 'more' })} style={styles.iconButton} hitSlop={8}>
            <MoreHorizontal size={22} color={theme.colors.text} />
          </Pressable>
          <Pressable onPress={openCreate} style={styles.iconButton} hitSlop={8}>
            <Plus size={22} color={theme.colors.primary} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      {isLoading && groups.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : groups.length === 0 ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyTitle}>Aucun groupe</Text>
            <Text style={styles.emptyHint}>
              Des groupes durables pour cette classe : demi-classe une semaine sur deux, latinistes, groupe de besoin…
            </Text>
            <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={handleCreateDefaultPair} disabled={busy || students.length === 0}>
              <Text style={styles.primaryButtonText}>Créer des demi-groupes (G1 / G2)</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={openCreate} disabled={busy}>
              <Text style={styles.ghostButtonText}>Créer un groupe vide</Text>
            </Pressable>
            {rooms.length > 0 && (
              <Pressable style={styles.ghostButton} onPress={() => setSheet({ kind: 'fromRoom', groupId: null })} disabled={busy}>
                <Text style={styles.ghostButtonText}>Créer depuis un plan de salle</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.help}>
            {selectionMode
              ? 'Sélectionnez des élèves puis choisissez une action.'
              : groups.length === 2
                ? 'Touchez un élève pour le faire changer de groupe. Appui long pour en sélectionner plusieurs.'
                : 'Touchez un élève pour choisir son groupe. Appui long pour en sélectionner plusieurs.'}
          </Text>
          {hasConflicts && (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                Certains élèves (marqués « ! ») sont dans plusieurs groupes après une synchronisation. Touchez-les dans la colonne à garder.
              </Text>
            </View>
          )}
          {groups.map((g, i) => renderColumn(g.name, g.id, columns.byGroup.get(g.id) ?? [], i, g))}
          {renderColumn('Non affecté', null, columns.unassigned, groups.length)}
          <View style={{ height: selectionMode ? 96 : 24 }} />
        </ScrollView>
      )}

      {selectionMode && (
        <View style={styles.actionBar}>
          <Text style={styles.actionCount}>{selected.size} sélectionné(s)</Text>
          <View style={styles.actionButtons}>
            <Pressable
              style={[styles.actionButton, styles.actionGhost]}
              onPress={() => { setSelectionMode(false); setSelected(new Set()); }}
            >
              <Text style={styles.actionGhostText}>Annuler</Text>
            </Pressable>
            {canSwap && (
              <Pressable style={[styles.actionButton, styles.actionGhost]} onPress={handleSwap} disabled={busy}>
                <ArrowLeftRight size={16} color={theme.colors.primary} />
                <Text style={styles.actionGhostText}>Échanger</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.actionButton, styles.actionPrimary, (selected.size === 0 || busy) && styles.disabled]}
              onPress={() => setSheet({ kind: 'target', studentIds: selectedList })}
              disabled={selected.size === 0 || busy}
            >
              <Text style={styles.actionPrimaryText}>Déplacer vers…</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Sheet : cible d'un deplacement */}
      <BottomSheet visible={sheet.kind === 'target'} onClose={() => setSheet({ kind: 'none' })}>
        <Text style={styles.sheetTitle}>
          {sheet.kind === 'target' && sheet.studentIds.length === 1
            ? displayName(students.find(s => s.id === sheet.studentIds[0]) ?? students[0])
            : `Déplacer ${sheet.kind === 'target' ? sheet.studentIds.length : 0} élèves`}
        </Text>
        {groups.map((g, i) => {
          const c = classGroupColor(g.color, i);
          return (
            <Pressable key={g.id} style={styles.sheetRow} onPress={() => sheet.kind === 'target' && doMove(sheet.studentIds, g.id)}>
              <View style={[styles.columnDot, { backgroundColor: c.main }]} />
              <Text style={styles.sheetRowText}>{g.name}</Text>
              <Text style={styles.sheetRowCount}>{columns.byGroup.get(g.id)?.length ?? 0}</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.sheetRow} onPress={() => sheet.kind === 'target' && doMove(sheet.studentIds, null)}>
          <View style={[styles.columnDot, { backgroundColor: theme.colors.textTertiary }]} />
          <Text style={styles.sheetRowText}>Non affecté</Text>
        </Pressable>
      </BottomSheet>

      {/* Sheet : creation / edition d'un groupe */}
      <BottomSheet
        visible={sheet.kind === 'create' || sheet.kind === 'group'}
        onClose={() => setSheet({ kind: 'none' })}
        avoidKeyboard
      >
        <Text style={styles.sheetTitle}>{sheet.kind === 'create' ? 'Nouveau groupe' : 'Modifier le groupe'}</Text>
        <TextInput
          style={styles.input}
          value={draftName}
          onChangeText={setDraftName}
          placeholder="Nom du groupe"
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus={sheet.kind === 'create'}
          maxLength={40}
        />
        <Text style={styles.fieldLabel}>Couleur</Text>
        <View style={styles.swatches}>
          {CLASS_GROUP_COLORS.map(c => (
            <Pressable
              key={c.key}
              onPress={() => setDraftColor(c.key)}
              style={[styles.swatch, { backgroundColor: c.main }, draftColor === c.key && styles.swatchOn]}
              accessibilityLabel={c.label}
            />
          ))}
        </View>
        {sheet.kind === 'group' && rooms.length > 0 && (
          <Pressable style={styles.sheetRow} onPress={() => setSheet({ kind: 'fromRoom', groupId: sheet.group.id })}>
            <Text style={styles.sheetRowText}>Remplir depuis un plan de salle…</Text>
          </Pressable>
        )}
        <View style={styles.sheetActions}>
          {sheet.kind === 'group' && (
            <Pressable style={[styles.actionButton, styles.actionDanger]} onPress={() => handleDeleteGroup(sheet.group)}>
              <Text style={styles.actionDangerText}>Supprimer</Text>
            </Pressable>
          )}
          <View style={{ flex: 1 }} />
          <Pressable
            style={[styles.actionButton, styles.actionPrimary, (!draftName.trim() || busy) && styles.disabled]}
            onPress={sheet.kind === 'create' ? handleCreate : handleSaveGroup}
            disabled={!draftName.trim() || busy}
          >
            <Text style={styles.actionPrimaryText}>{sheet.kind === 'create' ? 'Créer' : 'Enregistrer'}</Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* Sheet : plus d'actions */}
      <BottomSheet visible={sheet.kind === 'more'} onClose={() => setSheet({ kind: 'none' })}>
        <Text style={styles.sheetTitle}>Actions</Text>
        <Pressable style={styles.sheetRow} onPress={() => setSheet({ kind: 'autosplit' })} disabled={groups.length === 0}>
          <Shuffle size={18} color={groups.length === 0 ? theme.colors.textTertiary : theme.colors.text} />
          <Text style={[styles.sheetRowText, groups.length === 0 && { color: theme.colors.textTertiary }]}>Répartir automatiquement…</Text>
        </Pressable>
        <Pressable style={styles.sheetRow} onPress={() => setSheet({ kind: 'fromRoom', groupId: null })} disabled={rooms.length === 0}>
          <Plus size={18} color={rooms.length === 0 ? theme.colors.textTertiary : theme.colors.text} />
          <Text style={[styles.sheetRowText, rooms.length === 0 && { color: theme.colors.textTertiary }]}>Créer un groupe depuis un plan de salle…</Text>
        </Pressable>
        <Pressable style={styles.sheetRow} onPress={() => { setSheet({ kind: 'none' }); handleBalance(); }} disabled={groups.length === 0}>
          <Scale size={18} color={groups.length === 0 ? theme.colors.textTertiary : theme.colors.text} />
          <Text style={[styles.sheetRowText, groups.length === 0 && { color: theme.colors.textTertiary }]}>Équilibrer les non affectés</Text>
        </Pressable>
      </BottomSheet>

      {/* Sheet : repartition automatique */}
      <BottomSheet visible={sheet.kind === 'autosplit'} onClose={() => setSheet({ kind: 'none' })}>
        <Text style={styles.sheetTitle}>Répartir automatiquement</Text>
        <Text style={styles.sheetHint}>
          Remplace la répartition actuelle des {groups.length} groupe(s) avec les {students.length} élèves de la classe.
        </Text>
        <Pressable style={styles.sheetRow} onPress={() => handleAutoSplit('alphabetical')}>
          <Text style={styles.sheetRowText}>Moitié alphabétique</Text>
          <Text style={styles.sheetRowCount}>A–L / M–Z</Text>
        </Pressable>
        <Pressable style={styles.sheetRow} onPress={() => handleAutoSplit('alternate')}>
          <Text style={styles.sheetRowText}>Alternée</Text>
          <Text style={styles.sheetRowCount}>1 sur {groups.length}</Text>
        </Pressable>
        <Pressable style={styles.sheetRow} onPress={() => handleAutoSplit('random')}>
          <Text style={styles.sheetRowText}>Aléatoire</Text>
        </Pressable>
      </BottomSheet>

      {/* Sheet : import depuis un plan de salle */}
      <BottomSheet visible={sheet.kind === 'fromRoom'} onClose={() => setSheet({ kind: 'none' })}>
        <Text style={styles.sheetTitle}>Depuis quel plan de salle ?</Text>
        <Text style={styles.sheetHint}>
          Les élèves placés dans le plan de cette classe pour la salle choisie rejoignent le groupe
          {sheet.kind === 'fromRoom' && sheet.groupId ? ` « ${groupName(sheet.groupId)} »` : ' (nouveau groupe au nom de la salle)'}.
        </Text>
        <ScrollView style={{ maxHeight: 320 }}>
          {rooms.map(r => (
            <Pressable key={r.id} style={styles.sheetRow} onPress={() => handleFromRoom(r.id)} disabled={busy}>
              <Text style={styles.sheetRowText}>{r.name}</Text>
              <Text style={styles.sheetRowCount}>{r.grid_rows} × {r.grid_cols}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
  },
  backButton: { width: 38, height: 38, borderRadius: theme.radius.full, justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: theme.fonts.bodySemibold, fontSize: 19, color: theme.colors.text },
  headerSubtitle: { fontFamily: theme.fonts.body, fontSize: 12.5, color: theme.colors.textSecondary },
  headerActions: { flexDirection: 'row', gap: 2 },
  iconButton: { width: 38, height: 38, borderRadius: theme.radius.full, justifyContent: 'center', alignItems: 'center' },
  content: { padding: theme.spacing.md, paddingTop: theme.spacing.xs, gap: theme.spacing.md },
  help: { fontFamily: theme.fonts.body, fontSize: 12.5, color: theme.colors.textSecondary, paddingHorizontal: 2 },
  warnBox: { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.md, padding: theme.spacing.sm + 2 },
  warnText: { fontFamily: theme.fonts.body, fontSize: 12.5, color: theme.colors.bavardageText },

  column: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    padding: theme.spacing.md,
    gap: theme.spacing.sm + 2,
  },
  columnUnassigned: { borderLeftColor: theme.colors.borderStrong, borderStyle: 'dashed' },
  columnHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  columnTitleRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, flex: 1 },
  columnDot: { width: 10, height: 10, borderRadius: 5 },
  columnTitle: { fontFamily: theme.fonts.bodySemibold, fontSize: 15.5, color: theme.colors.text },
  countBadge: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: theme.radius.full, paddingHorizontal: 8, paddingVertical: 1 },
  countText: { fontFamily: theme.fonts.bodySemibold, fontSize: 12.5, color: theme.colors.textSecondary },
  columnEmpty: { fontFamily: theme.fonts.body, fontSize: 12.5, color: theme.colors.textTertiary },
  balanceButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  balanceText: { fontFamily: theme.fonts.bodySemibold, fontSize: 12.5, color: theme.colors.primary },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderRadius: theme.radius.full,
    paddingVertical: 7,
    paddingHorizontal: 11,
    maxWidth: '100%',
  },
  chipSelected: { backgroundColor: theme.colors.primarySoft },
  chipPressed: { backgroundColor: theme.colors.surfaceHover },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontFamily: theme.fonts.bodyMedium, fontSize: 13.5, color: theme.colors.text, flexShrink: 1 },
  chipWarn: { fontFamily: theme.fonts.bodyBold, fontSize: 12, color: theme.colors.warning },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: theme.colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkboxTick: { color: theme.colors.textInverse, fontSize: 10, fontWeight: '700', lineHeight: 12 },

  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { fontFamily: theme.fonts.bodySemibold, fontSize: 17, color: theme.colors.text },
  emptyHint: { fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: theme.spacing.sm },
  primaryButton: { alignSelf: 'stretch', backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, paddingVertical: 13, alignItems: 'center' },
  primaryButtonText: { fontFamily: theme.fonts.bodySemibold, fontSize: 15, color: theme.colors.textInverse },
  ghostButton: { alignSelf: 'stretch', paddingVertical: 10, alignItems: 'center' },
  ghostButtonText: { fontFamily: theme.fonts.bodySemibold, fontSize: 14, color: theme.colors.primary },
  disabled: { opacity: 0.5 },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  actionCount: { fontFamily: theme.fonts.bodySemibold, fontSize: 12.5, color: theme.colors.textSecondary },
  actionButtons: { flexDirection: 'row', gap: theme.spacing.sm },
  actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: theme.radius.md, paddingVertical: 11, paddingHorizontal: 14 },
  actionPrimary: { flex: 1, backgroundColor: theme.colors.primary },
  actionPrimaryText: { fontFamily: theme.fonts.bodySemibold, fontSize: 14, color: theme.colors.textInverse },
  actionGhost: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  actionGhostText: { fontFamily: theme.fonts.bodySemibold, fontSize: 14, color: theme.colors.primary },
  actionDanger: { backgroundColor: theme.colors.dangerSoft },
  actionDangerText: { fontFamily: theme.fonts.bodySemibold, fontSize: 14, color: theme.colors.danger },

  sheetTitle: { fontFamily: theme.fonts.bodySemibold, fontSize: 17, color: theme.colors.text, marginBottom: theme.spacing.sm + 2 },
  sheetHint: { fontFamily: theme.fonts.body, fontSize: 12.5, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm + 2, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  sheetRowText: { flex: 1, fontFamily: theme.fonts.bodyMedium, fontSize: 15, color: theme.colors.text },
  sheetRowCount: { fontFamily: theme.fonts.body, fontSize: 13, color: theme.colors.textTertiary },
  sheetActions: { flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.md, gap: theme.spacing.sm },
  input: {
    fontFamily: theme.fonts.body,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
  },
  fieldLabel: { fontFamily: theme.fonts.bodySemibold, fontSize: 12.5, color: theme.colors.textSecondary, marginTop: theme.spacing.md, marginBottom: theme.spacing.sm },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm + 2 },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 3, borderColor: 'transparent' },
  swatchOn: { borderColor: theme.colors.text },
});
