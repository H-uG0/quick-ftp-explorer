# Product

## Register

product

## Users

Staff of Dessaud Alarme Service, a family-run security company in the
Alpes-de-Haute-Provence (intrusion alarms, video surveillance, fire safety,
remote monitoring): technicians and remote-monitoring operators. They open
the camera clips and snapshots that client sites upload to a central FTP
server, to check an alarm, confirm an intrusion or verify an installation.

They work at office desks and on phones in the field, in daylight and
sometimes in a hurry. Some are older and not tech-minded. Most speak French:
the interface follows the browser's language, French or English.

## Product Purpose

A self-hosted web app that replaced a Windows HTA blocked by corporate
security policies: open a URL, sign in, pick a site, open its recordings,
with nothing to install. Admins manage the shared site shortcuts; everyone
else browses.

Success: the right clip is found and playing within seconds, on any device,
without anyone thinking about FTP, codecs or file formats.

## Brand Personality

Vigilant, reliable, sober. The tool of a security professional: calm and
precise, confident without flourish. It carries the Dessaud Alarme Service
identity, a deep ink navy and a signal red, so staff recognise it as their
company's tool. The red signals; it never shouts.

## Anti-references

- Generic SaaS dashboards: cards everywhere, gradients, a purple-blue sheen,
  hero metrics.
- Dark "hacker" security consoles: black screens, neon green or cyan.
- Cluttered alarm-company websites: stock photos, banners, flashing red, an
  alarmist tone.
- An unfamiliar layout. Users know the File-Explorer model (tree on the
  left, table on the right, breadcrumb, search); keep it.

## Design Principles

1. **Footage first.** Everything serves finding and opening the right clip
   fast. The chrome stays quiet.
2. **Familiar over novel.** Keep the File-Explorer model people already
   know; refine it, don't replace it.
3. **Red means something.** Brand red marks identity and the few things that
   need attention, never decoration.
4. **Calm under pressure.** An operator may be checking a live alarm: clear
   states, plain words, no surprises.
5. **Works for everyone, everywhere.** A phone in daylight or an office
   monitor, young or older eyes.

## Accessibility & Inclusion

- WCAG 2.2 AA: text contrast of at least 4.5:1 (3:1 for large text and
  control boundaries), a visible focus indicator on every control, full
  keyboard use.
- Readable sizes for older eyes; touch targets of at least 44 px on phones.
- Never information by colour alone: red always comes with words or an icon.
- Respect `prefers-reduced-motion`.
