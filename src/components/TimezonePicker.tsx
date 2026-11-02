import { useState } from 'react';
import { ChevronDown, Globe2, Search } from 'lucide-react';
import timezones from '../lib/timezones.json';
import type { MarketPayload } from '../lib/types';

export function TimezonePicker({ home, busy, error, onChange }: {
  home: MarketPayload['home']; busy: boolean; error: string | null;
  onChange: (zone: string) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const matches = timezones.filter(zone => zone.replaceAll('_', ' ').toLowerCase().includes(query.replaceAll('_', ' ').trim().toLowerCase()));

  async function select(zone: string) {
    if (!zone || busy) return;
    if (await onChange(zone)) { setExpanded(false); setQuery(''); }
  }

  return <section className="timezone-setting" aria-label="Home timezone">
    <label className="setting-label" htmlFor="home-timezone-trigger">Home timezone</label>
    <p className="setting-description">Opening and closing references in your region.</p>
    <button id="home-timezone-trigger" className="timezone-trigger" aria-label={`Home timezone: ${home.label}`} aria-expanded={expanded} aria-controls="timezone-options" disabled={busy} onClick={() => setExpanded(value => !value)}>
      <Globe2 size={15} /><span><strong>{home.label}</strong><small>{home.id} · {home.utc_offset}</small></span><ChevronDown size={15} />
    </button>
    {expanded && <div id="timezone-options" className="timezone-options">
      <div className="timezone-search"><Search size={14} /><input autoFocus type="search" aria-label="Search timezones" placeholder="Search city or timezone…" value={query} disabled={busy} onChange={event => setQuery(event.target.value)} /></div>
      {matches.length ? <select size={5} aria-label="Choose home timezone" value={matches.includes(home.id) ? home.id : ''} disabled={busy} onChange={event => void select(event.target.value)}>
        <option value="" disabled hidden>Choose a timezone</option>
        {matches.map(zone => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
      </select> : <p className="timezone-empty">No matching timezone. Try a city such as Dubai.</p>}
      <p className="timezone-count">{matches.length} of {timezones.length} timezones · includes UTC and aliases</p>
    </div>}
    {busy && <p className="timezone-count" role="status">Saving timezone…</p>}
    {error && <p className="timezone-error" role="alert">{error}</p>}
  </section>;
}
