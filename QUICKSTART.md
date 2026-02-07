# PrepGenius - Quick Start Guide

## Project Setup

This is a React + Vite + TypeScript project with a modern structure optimized for scalability and maintainability.

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Starts the development server at `http://localhost:5173`

## Build

```bash
npm run build
```

Creates an optimized production build.

## Project Structure

```
src/
├── components/
│   ├── layout/          # Layout components (Shell, Navigation, etc.)
│   └── ui/              # Reusable UI components
├── features/
│   └── dashboard/       # Dashboard feature components
├── hooks/               # Custom React hooks
├── lib/                 # Utility functions and helpers
├── pages/               # Page components for routes
├── App.tsx              # Root component with routing
├── main.tsx             # React entry point
└── index.css            # Global styles
```

## Import Paths

**Use the `@/` alias for all internal imports:**

```typescript
// ✅ Correct
import { Button } from '@/components/ui'
import { useProfile } from '@/hooks'
import { Shell } from '@/components/layout/Shell'
import { DashboardPage } from '@/pages/DashboardPage'

// ❌ Avoid
import Button from '../../../components/ui/button'
```

## Available Routes

- `/` - Landing page
- `/onboarding` - Onboarding page
- `/dashboard` - Dashboard page

## Barrel Exports

Import multiple items cleanly:

```typescript
// Components UI
import { Button, Card, Dialog } from '@/components/ui'

// Hooks
import { useProfile, useInterviewer, useMobile } from '@/hooks'

// Utilities
import { blink, utils } from '@/lib'
```

## TypeScript Configuration

- **Target:** ES2020
- **Strict Mode:** Enabled
- **Path Alias:** `@/*` → `src/*`
- **JSX:** React 18+

## Key Files

| File | Purpose |
|------|---------|
| `src/main.tsx` | React entry point |
| `src/App.tsx` | Root component & routing |
| `index.html` | HTML template |
| `tsconfig.json` | TypeScript configuration |
| `vite.config.ts` | Vite build configuration |
| `package.json` | Project dependencies |

## Adding New Components

### UI Component
```typescript
// src/components/ui/my-component.tsx
export const MyComponent = () => {
  return <div>My Component</div>
}
```

### Custom Hook
```typescript
// src/hooks/useMyHook.ts
export const useMyHook = () => {
  return {}
}
```

Then export from the barrel file:
- `src/components/ui/index.ts`
- `src/hooks/index.ts`

## Development Tips

1. **Use `@/` paths** - Easier refactoring and cleaner imports
2. **Keep components small** - Single responsibility principle
3. **Extract hooks** - Share state logic across components
4. **Organize by feature** - Group related features together
5. **Type everything** - Leverage TypeScript's type system

## Troubleshooting

**Import path not resolving?**
- Ensure you're using `@/` prefix
- Check tsconfig.json has the path alias configured
- Restart the dev server

**Components not appearing?**
- Verify export syntax (named vs default export)
- Check barrel export includes the component
- Check file exists in the correct directory

## Next Steps

1. Set up Tailwind CSS styling
2. Add state management (Context API, Redux, Zustand, etc.)
3. Set up API client for backend integration
4. Add testing framework (Vitest, Jest)
5. Configure ESLint & Prettier for code quality

---

**Happy coding! 🚀**
