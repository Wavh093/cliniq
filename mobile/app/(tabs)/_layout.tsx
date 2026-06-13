import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../constants/theme';

type IconProps = { color: string; size: number };

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:             false,
        tabBarShowLabel:         false,
        tabBarActiveTintColor:   '#ffffff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.40)',
        tabBarStyle: {
          backgroundColor: C.sage,
          borderTopWidth:  0,
          height:          72,
          paddingBottom:   8,
          paddingTop:      6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarAccessibilityLabel: "Today's appointments",
          tabBarIcon: ({ color, size }: IconProps) => (
            <Ionicons name="today-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarAccessibilityLabel: 'Calendar',
          tabBarIcon: ({ color, size }: IconProps) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          title: 'Patients',
          tabBarAccessibilityLabel: 'Patient search',
          tabBarIcon: ({ color, size }: IconProps) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarAccessibilityLabel: 'Treatment plans',
          tabBarIcon: ({ color, size }: IconProps) => (
            <Ionicons name="document-text-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarAccessibilityLabel: 'Practice analytics',
          tabBarIcon: ({ color, size }: IconProps) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: 'Klara',
          tabBarAccessibilityLabel: 'Ask Klara AI assistant',
          tabBarIcon: ({ color, size }: IconProps) => (
            <Ionicons name="sparkles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarAccessibilityLabel: 'Settings',
          tabBarIcon: ({ color, size }: IconProps) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
