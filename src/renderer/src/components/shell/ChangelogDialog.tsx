import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/misc';
import { CHANGELOG } from '@/lib/changelog';
import { useAppInfo } from '@/lib/queries';
import { parseLocalDate } from '@/lib/utils';
import { useUi } from '@/stores/ui';

const SECTION_TONE: Record<string, 'success' | 'brand' | 'warning' | 'danger' | 'default'> = {
  Added: 'success',
  Changed: 'brand',
  Fixed: 'warning',
  Removed: 'danger',
};

export function ChangelogDialog() {
  const open = useUi((s) => s.changelogOpen);
  const setOpen = useUi((s) => s.setChangelogOpen);
  const { data: info } = useAppInfo();

  return (
    <Dialog open={open} onOpenChange={setOpen} title="What's new in Cellar" side="right">
      <div className="space-y-6 py-1">
        {CHANGELOG.map((entry) => (
          <div key={entry.version}>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-medium">{entry.version}</span>
              {info?.version === entry.version && <Badge tone="brand">Current</Badge>}
              <span className="text-[12px] text-muted-foreground">{parseLocalDate(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
            {entry.tagline && <div className="mt-0.5 text-[13px] text-muted-foreground">{entry.tagline}</div>}
            <div className="mt-2 space-y-2.5">
              {entry.sections.map((section) => (
                <div key={section.label}>
                  <Badge tone={SECTION_TONE[section.label] ?? 'default'} className="mb-1">
                    {section.label}
                  </Badge>
                  <ul className="space-y-1 text-[13px] leading-relaxed text-fg-2">
                    {section.items.map((item, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-muted-foreground">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
