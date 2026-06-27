import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, FlatList, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../constants/theme';

export interface KliniqDropProps {
  label?: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  error?: string;
}

export default function KliniqDrop({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select...',
  required = false,
  error,
}: KliniqDropProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find(o => o.value === value)?.label;

  return (
    <View>
      {label ? (
        <Text style={s.triggerLabel}>
          {label}
          {required ? <Text style={s.asterisk}> *</Text> : null}
        </Text>
      ) : null}

      <TouchableOpacity style={s.field} onPress={() => setOpen(true)} activeOpacity={0.8}>
        <Text style={[s.fieldText, !selectedLabel && s.placeholder]} numberOfLines={1}>
          {selectedLabel ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={C.muted} />
      </TouchableOpacity>

      {error ? <Text style={s.errorText}>{error}</Text> : null}

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View style={s.overlay}>
          <View style={s.card}>
            {/* Header */}
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Select {label ?? ''}</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Text style={s.doneBtn}>Done</Text>
              </TouchableOpacity>
            </View>

            {/* Option list */}
            <FlatList
              data={options}
              keyExtractor={item => item.value}
              renderItem={({ item, index }) => {
                const isSelected = item.value === value;
                const isLast     = index === options.length - 1;
                return (
                  <TouchableOpacity
                    style={[
                      s.optionRow,
                      isSelected && s.optionRowSelected,
                      isLast     && s.optionRowLast,
                    ]}
                    onPress={() => { onChange(item.value); setOpen(false); }}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.optionText, isSelected && s.optionTextSelected]}>
                      {item.label}
                    </Text>
                    {isSelected
                      ? <Ionicons name="checkmark" size={18} color={C.sage} />
                      : null}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Label above field
  triggerLabel: {
    fontSize: 13,
    color: C.muted,
    marginBottom: 4,
    fontWeight: '500',
  },
  asterisk: {
    color: C.danger,
  },

  // Trigger field
  field: {
    backgroundColor: C.rule,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldText: {
    flex: 1,
    fontSize: 15,
    color: C.ink,
    marginRight: 8,
  },
  placeholder: {
    color: C.muted,
  },

  // Error
  errorText: {
    color: C.danger,
    fontSize: 12,
    marginTop: 4,
  },

  // Modal overlay (bottom sheet)
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: C.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },

  // Modal header bar
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: C.ink,
  },
  doneBtn: {
    fontSize: 15,
    fontWeight: '600',
    color: C.sage,
  },

  // Option rows
  optionRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  optionRowSelected: {
    backgroundColor: C.bg,
  },
  optionRowLast: {
    borderBottomWidth: 0,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: C.ink,
  },
  optionTextSelected: {
    fontWeight: '600',
    color: C.ink,
  },
});
