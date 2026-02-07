import React from 'react'
import { useBlinkAuth } from '@blinkdotnew/react'
import { Button } from '../ui/button'
import { 
  LayoutDashboard, 
  PlayCircle, 
  History, 
  FileText, 
  TrendingUp, 
  Settings, 
  ShieldCheck,
  LogOut,
  BrainCircuit,
  Briefcase,
  ClipboardCheck,
  Map,
  Code,
  BookOpen,
  Sun,
  Moon
} from 'lucide-react'
import { blink } from '../../lib/blink'

interface ShellProps {
  children: React.ReactNode
  activeTab: string
  setActiveTab: (tab: string) => void
}

export function Shell({ children, activeTab, setActiveTab }: ShellProps) {
  const { user } = useBlinkAuth()
  const [isDark, setIsDark] = React.useState(false)

  const toggleTheme = () => {
    setIsDark(!isDark)
    document.documentElement.classList.toggle('dark')
  }

  const menuItems = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'interviews', label: 'Mock Interviews', icon: PlayCircle },
    { id: 'history', label: 'Session History', icon: History },
    { id: 'resume', label: 'Resume Analyzer', icon: FileText },
    { id: 'job-match', label: 'Job Match', icon: Briefcase },
    { id: 'question-lab', label: 'Question Lab', icon: ClipboardCheck },
    { id: 'coding-practice', label: 'Coding Practice', icon: Code },
    { id: 'learning', label: 'Learning Hub', icon: BookOpen },
    { id: 'roadmap', label: 'Roadmap', icon: Map },
    { id: 'analytics', label: 'Skill Analytics', icon: TrendingUp },
    ...(user?.role === 'admin' ? [{ id: 'admin', label: 'Admin Console', icon: ShieldCheck }] : []),
  ]

  return (
    <div className="relative flex h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(124,58,237,0.12),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(56,189,248,0.12),transparent_40%),radial-gradient(circle_at_20%_80%,rgba(236,72,153,0.12),transparent_50%)] opacity-70" />
      {/* Sidebar */}
      <aside className="relative hidden lg:flex w-72 flex-col border-r border-border/40 bg-card/70 backdrop-blur-xl">
        <div className="h-20 flex items-center px-8 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <BrainCircuit className="text-primary-foreground w-5 h-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">PrepGenius<span className="text-primary italic">AI</span></span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-8 px-4 space-y-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200 group ${
                activeTab === item.id 
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-primary transition-colors'}`} />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border/40 space-y-4">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-muted-foreground hover:bg-secondary transition-colors"
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-sm font-medium">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
          
          <div className="p-4 rounded-2xl bg-secondary/50 border border-border/40">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-bold">{user?.email?.[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{user?.email}</p>
                <p className="text-[10px] text-muted-foreground">{user?.role === 'admin' ? 'Admin' : 'Free Plan'}</p>
              </div>
            </div>
            <button 
              onClick={() => blink.auth.logout()}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold bg-background border border-border/40 hover:bg-destructive hover:text-destructive-foreground transition-all duration-200"
            >
              <LogOut className="w-3 h-3" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden h-16 flex items-center px-4 border-b border-border/40 justify-between bg-background/80 backdrop-blur">
          <div className="flex items-center gap-2">
            <BrainCircuit className="text-primary w-6 h-6" />
            <span className="font-bold">PrepGeniusAI</span>
          </div>
          <button onClick={() => blink.auth.logout()}><LogOut className="w-5 h-5" /></button>
        </header>
        <main className="flex-1 overflow-y-auto custom-scrollbar relative">
          {children}
        </main>
      </div>
    </div>
  )
}
