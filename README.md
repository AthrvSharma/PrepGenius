# PrepGenius

PrepGenius is an AI-powered interview prep platform with mock interviews, coding practice, analytics, and a structured learning hub. The app includes a Vite + React frontend and an optional Express-based AI service for code execution and interview intelligence.

## Features
- AI mock interviews with session history and analytics
- Coding practice workspace with test runner integration
- Learning Hub with subject-first browsing and topic detail pages
- Resume analyzer and job match insights
- Guided learning roadmap and progress tracking

## Tech Stack
- Vite + React + TypeScript
- Tailwind CSS + Radix UI + Framer Motion
- Express (AI service)
- Blink SDK

## Getting Started
### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment
Copy the example and fill in the values you need.
```bash
cp .env.example .env
```

Key variables:
- `OPENAI_API_KEY` for the AI service
- `VITE_AI_BASE_URL` for the frontend to reach the AI service

### 3) Run the frontend
```bash
npm run dev
```

### 4) Run the AI service (optional but required for AI features)
```bash
npm run dev:ai
```
The AI service reads from `.env` and defaults to port `8787`.

## Build
```bash
npm run build
npm run preview
```

## Lint
```bash
npm run lint
```

## Project Structure
- `src/` – React app and UI components
- `server/` – Express-based AI service
- `public/` – Static assets
- `dist/` – Production build output

## Notes
- `.env` is intentionally excluded from git.
- AI features require valid API keys and network access.

## License
MIT
