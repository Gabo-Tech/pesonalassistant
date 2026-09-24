import { usePathname, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useT } from '../i18n';
import { Chip, PAGE_MARGIN } from '../ui/Bento';

const LINKS = [
  { href: '/agenda', key: 'agenda.navAgenda' },
  { href: '/agenda/calendar', key: 'agenda.navCalendar' },
  { href: '/agenda/tasks', key: 'agenda.navTasks' },
  { href: '/agenda/reminders', key: 'agenda.navReminders' },
] as const;

function isAgendaHome(pathname: string): boolean {
  return pathname === '/agenda' || pathname === '/agenda/' || pathname === '/agenda/index';
}

export function AgendaNav() {
  const tr = useT();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <View style={{ paddingHorizontal: PAGE_MARGIN, paddingTop: 8, paddingBottom: 4 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {LINKS.map((item) => {
          const active =
            item.href === '/agenda' ? isAgendaHome(pathname) : pathname === item.href;
          return (
            <Chip
              key={item.href}
              label={tr(item.key)}
              active={active}
              onPress={() => {
                if (!active) router.replace(item.href);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}
