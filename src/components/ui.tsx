import type { ButtonHTMLAttributes, ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Switch from '@radix-ui/react-switch';

export function IconButton({ label, children, active, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string; children: ReactNode; active?: boolean;
}) {
  return <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <button type="button" aria-label={label} className={`icon-button ${active ? 'is-active' : ''}`} {...props}>{children}</button>
    </Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={8}>{label}<Tooltip.Arrow className="fill-[#293343]" /></Tooltip.Content></Tooltip.Portal>
  </Tooltip.Root>;
}

export function SettingSwitch({ label, description, checked, onChange, disabled }: {
  label: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean;
}) {
  return <label className="setting-row">
    <span><span className="setting-label">{label}</span><span className="setting-description">{description}</span></span>
    <Switch.Root aria-label={label} checked={checked} onCheckedChange={onChange} disabled={disabled} className="switch">
      <Switch.Thumb className="switch-thumb" />
    </Switch.Root>
  </label>;
}
