import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { askAI, getAIUsage } from '../../lib/api';
import { C } from '../../constants/theme';

// ── Types ────────────────────────────────────────────────────────

interface Message {
  id:   string;
  role: 'user' | 'ai';
  text: string;
}

// ── Suggested starter questions ──────────────────────────────────

const SUGGESTED: { q: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { q: 'Max lidocaine dose for a 70 kg adult?',                              icon: 'fitness-outline' },
  { q: 'Antibiotic prophylaxis for a patient with a prosthetic joint?',     icon: 'shield-checkmark-outline' },
  { q: 'Managing a patient on warfarin before extraction?',                 icon: 'water-outline' },
  { q: 'Signs and management of local anaesthetic toxicity?',               icon: 'warning-outline' },
];

// ── Screen ───────────────────────────────────────────────────────

export default function AIScreen() {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [usage,     setUsage]     = useState({ used: 0, limit: 10, remaining: 10 });
  const [showUsage, setShowUsage] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Refresh usage whenever the tab is focused
  useFocusEffect(useCallback(() => {
    getAIUsage().then(setUsage).catch(() => {});
  }, []));

  const scrollToBottom = () =>
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

  // ── Send message ───────────────────────────────────────────────

  const send = useCallback(async (question?: string) => {
    const q = (question ?? input).trim();
    if (!q || loading) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
      const data = await askAI(q);
      setUsage({ used: data.used, limit: data.limit, remaining: data.remaining });
      setMessages(prev => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'ai', text: data.answer },
      ]);
    } catch (e: any) {
      setMessages(prev => [
        ...prev,
        { id: `e-${Date.now()}`, role: 'ai', text: `⚠️ ${e.message ?? 'Something went wrong. Please try again.'}` },
      ]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  }, [input, loading]);

  // ── Derived ───────────────────────────────────────────────────

  const rateLimited  = usage.remaining <= 0;
  const inputDisabled = loading || rateLimited;

  // ── Render ────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Ask Klara</Text>
          <Text style={s.subtitle}>Your AI clinical assistant</Text>
          {(showUsage || rateLimited) && (
            <Text style={[s.usageLine, rateLimited && s.usageWarn]}>
              {rateLimited
                ? `Hourly limit reached (${usage.limit})`
                : `${usage.remaining} of ${usage.limit} questions left this hour`}
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[s.usageBtn, rateLimited && s.usagePillWarn]}
          onPress={() => setShowUsage(v => !v)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel="Usage this hour"
          accessibilityRole="button"
        >
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={rateLimited ? C.danger : C.muted}
          />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={66}
      >
        {/* ── Messages ─────────────────────────────────────── */}
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            messages.length > 0 && scrollRef.current?.scrollToEnd({ animated: false })
          }
        >
          {/* Welcome card — shown when no messages yet */}
          {messages.length === 0 && (
            <>
              <View style={s.welcomeCard}>
                <View style={s.welcomeIconWrap}>
                  <Ionicons name="sparkles" size={24} color={C.sage} />
                </View>
                <Text style={s.welcomeTitle}>Hi, I'm Klara 👋</Text>
                <Text style={s.welcomeBody}>
                  Ask me about procedures, drug dosages, pharmacology, patient management, and clinical guidelines.
                </Text>
                <View style={s.welcomeDivider} />
                <Text style={s.disclaimer}>
                  AI provides general clinical guidance only. Always apply professional judgment and verify against current SADA / AHA guidelines before treating.
                </Text>
              </View>

              {/* Suggested questions — horizontally scrollable */}
              <Text style={s.suggestedLabel}>QUICK QUESTIONS</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.chipScroll}
                keyboardShouldPersistTaps="handled"
              >
                {SUGGESTED.map((item, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[s.suggestedChip, inputDisabled && { opacity: 0.4 }]}
                    onPress={() => send(item.q)}
                    disabled={inputDisabled}
                    activeOpacity={0.7}
                  >
                    <View style={s.chipIcon}>
                      <Ionicons name={item.icon} size={16} color={C.sage} />
                    </View>
                    <Text style={s.suggestedText} numberOfLines={3}>{item.q}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Conversation bubbles */}
          {messages.map(msg => (
            <View
              key={msg.id}
              style={[s.bubbleWrap, msg.role === 'user' ? s.bubbleWrapUser : s.bubbleWrapAI]}
            >
              {msg.role === 'ai' && (
                <View style={s.aiTag}>
                  <Ionicons name="sparkles" size={10} color={C.sage} />
                  <Text style={s.aiTagText}>Klara</Text>
                </View>
              )}
              <View style={[s.bubble, msg.role === 'user' ? s.bubbleUser : s.bubbleAI]}>
                <Text style={[s.bubbleText, msg.role === 'user' ? s.bubbleTextUser : s.bubbleTextAI]}>
                  {msg.text}
                </Text>
              </View>
            </View>
          ))}

          {/* Loading bubble */}
          {loading && (
            <View style={[s.bubbleWrap, s.bubbleWrapAI]}>
              <View style={s.aiTag}>
                <Ionicons name="sparkles" size={10} color={C.sage} />
                <Text style={s.aiTagText}>Klara</Text>
              </View>
              <View style={[s.bubble, s.bubbleAI, { paddingVertical: 12 }]}>
                <ActivityIndicator size="small" color={C.sage} />
              </View>
            </View>
          )}

          <View style={{ height: 8 }} />
        </ScrollView>

        {/* ── Rate limit bar ────────────────────────────────── */}
        {rateLimited && (
          <View style={s.rateLimitBanner}>
            <Ionicons name="time-outline" size={15} color={C.danger} />
            <Text style={s.rateLimitText}>
              Hourly limit reached ({usage.limit} requests). Resets within the next hour.
            </Text>
          </View>
        )}

        {/* ── Input bar ─────────────────────────────────────── */}
        <View style={s.inputBar}>
          {/* Clear conversation button — only when there are messages */}
          {messages.length > 0 && !loading && (
            <TouchableOpacity
              style={s.clearBtn}
              onPress={() => setMessages([])}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={19} color={C.muted} />
            </TouchableOpacity>
          )}

          <TextInput
            style={[s.input, inputDisabled && s.inputDim]}
            value={input}
            onChangeText={setInput}
            placeholder={
              rateLimited
                ? 'Limit reached — try again later…'
                : 'Ask a clinical question…'
            }
            placeholderTextColor={C.muted}
            multiline
            maxLength={1500}
            editable={!inputDisabled}
            returnKeyType="send"
            onSubmitEditing={() => send()}
            blurOnSubmit
            autoCapitalize="sentences"
            autoCorrect={false}
            accessibilityLabel="Clinical question input"
          />

          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || inputDisabled) && s.sendBtnDim]}
            onPress={() => send()}
            disabled={!input.trim() || inputDisabled}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="send" size={17} color="#fff" />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  title:    { fontSize: 22, fontWeight: '700', color: C.ink },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 1 },

  usageBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  usagePillWarn: { backgroundColor: '#FEF2F2' },
  usageLine:  { fontSize: 12, color: C.muted, marginTop: 4 },
  usageWarn:  { color: C.danger },

  // Messages
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 14, gap: 10 },

  // Welcome
  welcomeCard: {
    backgroundColor: C.paper, borderRadius: 18,
    padding: 20, marginBottom: 4,
    borderWidth: 1, borderColor: C.rule,
  },
  welcomeIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  welcomeTitle:   { fontSize: 16, fontWeight: '700', color: C.ink, marginBottom: 6 },
  welcomeBody:    { fontSize: 14, color: C.inkSoft, lineHeight: 21 },
  welcomeDivider: { height: 1, backgroundColor: C.rule, marginVertical: 14 },
  disclaimer:     { fontSize: 11, color: C.muted, lineHeight: 17 },

  // Suggested chips
  suggestedLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.8,
    color: C.muted, marginBottom: 10,
  },
  chipScroll: { gap: 10, paddingRight: 16, paddingBottom: 2 },
  suggestedChip: {
    width: 190,
    backgroundColor: C.paper, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: C.rule,
    gap: 10,
  },
  chipIcon: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: C.sageSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  suggestedText: { fontSize: 13, color: C.ink, lineHeight: 18, fontWeight: '500' },

  // Bubbles
  bubbleWrap:     { gap: 4 },
  bubbleWrapUser: { alignItems: 'flex-end' },
  bubbleWrapAI:   { alignItems: 'flex-start' },

  aiTag:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 2 },
  aiTagText: { fontSize: 10, fontWeight: '700', color: C.sage, letterSpacing: 0.5 },

  bubble: {
    maxWidth: '88%', borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14,
  },
  bubbleUser: {
    backgroundColor:       C.sage,
    borderBottomRightRadius: 4,
  },
  bubbleAI: {
    backgroundColor:      C.paper,
    borderWidth:          1,
    borderColor:          C.rule,
    borderBottomLeftRadius: 4,
  },
  bubbleText:     { fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextAI:   { color: C.ink },

  // Rate limit banner
  rateLimitBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FEF2F2',
    borderTopWidth: 1, borderTopColor: '#fca5a5',
    paddingVertical: 10, paddingHorizontal: 16,
  },
  rateLimitText: { flex: 1, fontSize: 13, color: C.danger, lineHeight: 18 },

  // Input bar
  inputBar: {
    flexDirection:   'row',
    alignItems:      'flex-end',
    gap:             8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: C.paper,
    borderTopWidth:  1,
    borderTopColor:  C.rule,
  },
  clearBtn: { paddingBottom: 10, paddingHorizontal: 2 },
  input: {
    flex:              1,
    minHeight:         42,
    maxHeight:         120,
    backgroundColor:   C.bg,
    borderRadius:      21,
    borderWidth:       1,
    borderColor:       C.rule,
    paddingHorizontal: 16,
    paddingVertical:   10,
    fontSize:          15,
    color:             C.ink,
  },
  inputDim: { opacity: 0.5 },
  sendBtn: {
    width:          42,
    height:         42,
    borderRadius:   21,
    backgroundColor: C.sage,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  sendBtnDim: { opacity: 0.35 },
});
