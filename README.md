# Chance Runner

Local, offline Electron game. Docs: [game design](docs/game-design.md) · [design system](docs/design-system.md) · [roadmap](docs/ROADMAP.md).

## Commands

| Command           | Purpose                                                                          |
| ----------------- | -------------------------------------------------------------------------------- |
| `pnpm dev`        | Run the app with hot reload (showcase: "Component showcase" on the start screen) |
| `pnpm build`      | Production build into `out/`                                                     |
| `pnpm check`      | Typecheck, lint, format check, i18n key check, tests                             |
| `pnpm test:watch` | Vitest in watch mode                                                             |

Keys in dev: `F11` fullscreen, `F12` DevTools.

## Troubleshooting

`TypeError: Cannot read properties of undefined (reading 'isPackaged')` on start means the environment variable `ELECTRON_RUN_AS_NODE` is set (some tools launched from VS Code set it). Start from a normal terminal or unset it first.
