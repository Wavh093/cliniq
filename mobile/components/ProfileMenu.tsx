import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, Alert,
  Dimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import Avatar from './Avatar';
import { C } from '../constants/theme';

interface ProfileMenuProps {
  name: string | null;
  initials?: string;
  size?: number;
}

export default function ProfileMenu({ name, initials, size = 40 }: ProfileMenuProps) {
  const [visible, setVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 20 });
  const anchorRef = useRef<View>(null);

  const handleOpen = () => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      const screenW = Dimensions.get('window').width;
      setMenuPos({
        top: y + height + 6,
        right: Math.max(12, screenW - (x + width)),
      });
      setVisible(true);
    });
  };

  const handleSettings = () => {
    setVisible(false);
    router.push('/settings');
  };

  const handleLogout = () => {
    setVisible(false);
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: () => supabase.auth.signOut(),
        },
      ],
    );
  };

  return (
    <>
      <TouchableOpacity
        onPress={handleOpen}
        activeOpacity={0.8}
        accessibilityLabel="Profile menu"
        accessibilityRole="button"
      >
        <View ref={anchorRef} collapsable={false}>
          <Avatar
            name={name ?? 'Doctor'}
            initials={initials ?? (name || 'Dr')[0].toUpperCase()}
            size={size}
          />
        </View>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <View style={[s.menu, { top: menuPos.top, right: menuPos.right }]}>
            <TouchableOpacity style={s.menuItem} onPress={handleSettings} activeOpacity={0.7}>
              <Ionicons name="settings-outline" size={18} color={C.ink} />
              <Text style={s.menuItemText}>Settings</Text>
            </TouchableOpacity>
            <View style={s.menuDivider} />
            <TouchableOpacity style={s.menuItem} onPress={handleLogout} activeOpacity={0.7}>
              <Ionicons name="log-out-outline" size={18} color={C.danger} />
              <Text style={[s.menuItemText, { color: C.danger }]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  menu: {
    position: 'absolute',
    backgroundColor: C.paper,
    borderRadius: 14,
    paddingVertical: 4,
    minWidth: 180,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
    }),
    borderWidth: 1,
    borderColor: C.rule,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: C.ink,
  },
  menuDivider: {
    height: 1,
    backgroundColor: C.rule,
    marginHorizontal: 12,
  },
});
