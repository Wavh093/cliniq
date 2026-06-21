import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../constants/theme';

type IconProps = { color: string; size: number; focused: boolean };

/** Swap between outline (inactive) and filled (active) icon variants. */
function tabIcon(base: string) {
  return ({ color, size, focused }: IconProps) => (
    <Ionicons
      name={(focused ? base : `${base}-outline`) as any}
      size={size - 1}
      color={color}
    />
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown:             false,
        tabBarShowLabel:         true,
        tabBarActiveTintColor:   C.sage,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle:        { fontSize: 10, fontWeight: '600', marginTop: -2 },
        tabBarItemStyle:         { paddingTop: 6 },
        tabBarStyle: {
          backgroundColor:  C.paper,
          borderTopWidth:   1,
          borderTopColor:   C.rule,
          height:           76,
          paddingBottom:    10,
          paddingTop:       4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarAccessibilityLabel: "Today's appointments",
          tabBarIcon: tabIcon('today'),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendar',
          tabBarAccessibilityLabel: 'Calendar',
          tabBarIcon: tabIcon('calendar'),
        }}
      />
      <Tabs.Screen
        name="patients"
        options={{
          title: 'Patients',
          tabBarAccessibilityLabel: 'Patient search',
          tabBarIcon: tabIcon('people'),
        }}
      />
      <Tabs.Screen
        name="plans"
        options={{
          title: 'Plans',
          tabBarAccessibilityLabel: 'Treatment plans',
          tabBarIcon: tabIcon('document-text'),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Stats',
          tabBarAccessibilityLabel: 'Practice analytics',
          tabBarIcon: tabIcon('bar-chart'),
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: 'Klara',
          tabBarAccessibilityLabel: 'Ask Klara AI assistant',
          tabBarIcon: tabIcon('sparkles'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
