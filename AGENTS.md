# Development Guidelines

## Repository Scope
- This file applies to the entire repository unless a more specific `AGENTS.md` is added deeper in the tree.

## Code Style
- Prefer modern JavaScript syntax (`const`/`let`, arrow functions where appropriate) when editing web assets.
- Keep functions small and focused; factor shared behavior into helpers inside `app.js` rather than scattering global utilities.
- Document non-trivial logic with concise inline comments to aid future maintenance.

## HTML & CSS
- Ensure the UI remains functional on both desktop and tablet breakpoints; test changes at 1024px and 768px widths when modifying layout.
- When adding new styles, group related rules together and avoid redefining existing colors unless required for accessibility.
- Keep the **Live Data** sidebar focused on situational readouts; avoid duplicating control values such as range, alert distance, or volume that already live in the controls panel.

## Data & Configuration
- Validate user-supplied server details before issuing network requests, and surface clear error messages in the UI.
- Persist user-facing settings via `localStorage` so they survive page reloads unless there is a compelling reason not to.

## Testing & Verification
- Manually verify critical flows in a browser when feasible (e.g., connecting to a dump1090 server, toggling controls).
- Describe any manual or automated testing performed in the final summary so reviewers understand the validation performed.

## Documentation
- Update `README.md` when adding new user-visible capabilities or configuration requirements.
- Keep prose concise but actionable—favor bullet lists over dense paragraphs when outlining
  steps or requirements.
- Note any new development or build prerequisites introduced by your changes.
- When documenting commands, prefer fenced code blocks with explicit shells (e.g.
  `bash`) so syntax highlighting works across viewers.
- Maintain the **Future Improvements** section in `README.md` so it reflects the
  highest-priority follow-up ideas after each meaningful feature change.
- Call out meaningful interaction changes (like radar selection behaviors) in the
  **Features** section so operators immediately understand how to access them.
- Bump `APP_VERSION` in `app.js` whenever shipping user-facing changes and ensure the
  README references stay in sync with the current release number.
