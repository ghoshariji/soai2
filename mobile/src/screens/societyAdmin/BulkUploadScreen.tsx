import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import Icon from 'react-native-vector-icons/Ionicons';
import Toast from 'react-native-toast-message';

import { Colors, Spacing, Radius } from '@/theme';
import { uploadService, ExcelBulkImportResult } from '@/services/api';
import Header from '@/components/common/Header';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import EmptyState from '@/components/common/EmptyState';

const BulkUploadScreen: React.FC = () => {
  const [file, setFile] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ExcelBulkImportResult | null>(null);

  const pickFile = useCallback(async () => {
    try {
      const res = await DocumentPicker.pick({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyTo: 'cachesDirectory',
      });
      const f = Array.isArray(res) ? res[0] : res;
      const uri = f.fileCopyUri ?? f.uri;
      setFile({
        uri,
        name: f.name ?? 'users.xlsx',
        type: f.type ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      setResult(null);
      Toast.show({ type: 'info', text1: 'File selected', text2: f.name });
    } catch (e: unknown) {
      if (DocumentPicker.isCancel(e)) return;
      Toast.show({ type: 'error', text1: 'Could not pick file' });
    }
  }, []);

  const upload = useCallback(async () => {
    if (!file) {
      Toast.show({ type: 'error', text1: 'Select an Excel file first' });
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as unknown as Blob);

      const res = await uploadService.uploadExcel(form);
      const payload = res.data?.data as ExcelBulkImportResult | undefined;
      if (!payload) {
        throw new Error('Invalid server response');
      }
      setResult(payload);

      const { success, total, failed } = payload;
      if (success > 0) {
        Toast.show({
          type: 'success',
          text1: 'Import complete',
          text2: `${success} user(s) created of ${total} row(s).`,
        });
      } else if (failed?.length) {
        Toast.show({
          type: 'error',
          text1: 'No users created',
          text2: `${failed.length} row(s) failed validation.`,
        });
      } else {
        Toast.show({
          type: 'info',
          text1: 'Nothing to import',
          text2: 'No valid rows in this file.',
        });
      }
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String(
              (e as { response?: { data?: { message?: string } } }).response
                ?.data?.message ?? '',
            )
          : e instanceof Error
            ? e.message
            : 'Upload failed';
      Toast.show({ type: 'error', text1: 'Upload failed', text2: msg });
    } finally {
      setUploading(false);
    }
  }, [file]);

  return (
    <View style={styles.safe}>
      <Header title="Bulk upload" showBack subtitle="Excel (.xlsx)" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Spreadsheet format</Text>
          <Text style={styles.cardBody}>
            Row 1 must be headers. Columns:{' '}
            <Text style={styles.mono}>Name</Text>,{' '}
            <Text style={styles.mono}>Email</Text>,{' '}
            <Text style={styles.mono}>Phone</Text> (optional),{' '}
            <Text style={styles.mono}>FlatNumber</Text> (optional).
          </Text>
          <Text style={styles.hint}>
            Requires an active subscription with bulk upload enabled. New users
            receive a generated password by email when SMTP is configured.
          </Text>
        </Card>

        <TouchableOpacity style={styles.pickRow} onPress={pickFile} activeOpacity={0.85}>
          <View style={styles.pickIcon}>
            <Icon name="document-attach-outline" size={24} color={Colors.primary} />
          </View>
          <View style={styles.pickBody}>
            <Text style={styles.pickLabel}>
              {file ? file.name : 'Tap to choose .xlsx file'}
            </Text>
            <Text style={styles.pickSub}>Max 5 MB</Text>
          </View>
          <Icon name="chevron-forward" size={20} color={Colors.textMuted} />
        </TouchableOpacity>

        <Button
          title={uploading ? 'Uploading…' : 'Upload & create users'}
          onPress={upload}
          loading={uploading}
          disabled={uploading || !file}
          size="lg"
          style={styles.uploadBtn}
        />

        {result ? (
          <View style={styles.results}>
            <Text style={styles.resultsTitle}>Import result</Text>
            <View style={styles.statRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{result.total}</Text>
                <Text style={styles.statLbl}>Rows</Text>
              </View>
              <View style={[styles.statBox, styles.statOk]}>
                <Text style={styles.statVal}>{result.success}</Text>
                <Text style={styles.statLbl}>Created</Text>
              </View>
              <View style={[styles.statBox, styles.statBad]}>
                <Text style={styles.statVal}>{result.failed?.length ?? 0}</Text>
                <Text style={styles.statLbl}>Failed</Text>
              </View>
            </View>

            {result.failed && result.failed.length > 0 ? (
              <>
                <Text style={styles.failedTitle}>Failed rows</Text>
                <FlatList
                  data={result.failed}
                  keyExtractor={(_, i) => `f-${i}`}
                  scrollEnabled={false}
                  ListEmptyComponent={null}
                  renderItem={({ item }) => (
                    <View style={styles.failRow}>
                      <Text style={styles.failRowTitle}>
                        Row {item.row ?? '—'}{' '}
                        {item.email ? `· ${item.email}` : ''}
                      </Text>
                      <Text style={styles.failReason}>{item.reason}</Text>
                    </View>
                  )}
                />
              </>
            ) : (
              <EmptyState
                icon="checkmark-circle-outline"
                title="No row-level errors"
                message="All rows were processed successfully or duplicates were skipped in earlier steps."
              />
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  scroll: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  card: { marginBottom: Spacing.md },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  cardBody: { fontSize: 14, color: Colors.textSecondary, lineHeight: 21 },
  mono: { fontFamily: 'Menlo', color: Colors.primary, fontWeight: '600' },
  hint: {
    marginTop: Spacing.md,
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  pickIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(108,99,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickBody: { flex: 1 },
  pickLabel: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  pickSub: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  uploadBtn: { marginBottom: Spacing.lg },
  results: { marginTop: Spacing.sm },
  resultsTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  statRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.lg },
  statBox: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
  },
  statOk: { borderColor: 'rgba(16,185,129,0.35)' },
  statBad: { borderColor: 'rgba(239,68,68,0.35)' },
  statVal: { fontSize: 22, fontWeight: '800', color: Colors.textPrimary },
  statLbl: { fontSize: 11, color: Colors.textMuted, marginTop: 4 },
  failedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  failRow: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.error,
  },
  failRowTitle: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  failReason: { fontSize: 12, color: Colors.textSecondary, marginTop: 4 },
});

export default BulkUploadScreen;
