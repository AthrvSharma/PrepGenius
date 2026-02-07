import React from 'react'
import { Button } from '../components/ui/button'
import { blink } from '../lib/blink'
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  Layers,
  MessagesSquare,
  Sparkles,
  Zap
} from 'lucide-react'
import LiquidEther from '../components/react-bits/LiquidEther'
import AnimatedList from '../components/react-bits/AnimatedList'
import MagicBento, { MagicBentoCard } from '../components/react-bits/MagicBento'
import ScrollStack, { ScrollStackItem } from '../components/react-bits/ScrollStack'
import StaggeredMenu from '../components/react-bits/StaggeredMenu'
import ProfileCard from '../components/react-bits/ProfileCard'
import PixelSnow from '../components/react-bits/PixelSnow'
import brandMark from '../assets/prepgenius-mark.svg'
import { motion } from 'framer-motion'

export function LandingPage() {
  const handleLogin = () => {
    blink.auth.login(window.location.href)
  }
  const scrollToSection = (id: string) => {
    const el = document.querySelector(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [canRenderFx, setCanRenderFx] = React.useState(false)

  React.useEffect(() => {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
      setCanRenderFx(Boolean(gl))
    } catch {
      setCanRenderFx(false)
    }
  }, [])

  const menuItems = [
    { label: 'Features', ariaLabel: 'Features', link: '#features' },
    { label: 'How It Works', ariaLabel: 'How It Works', link: '#how-it-works' },
    { label: 'Learning Hub', ariaLabel: 'Learning Hub', link: '#learning-hub' },
    { label: 'Pricing', ariaLabel: 'Pricing', link: '#pricing' },
  ]

  const heroSignals = [
    'System Design mock completed · 84 score',
    'Resume ATS analysis improved · +12',
    'AI feedback: clarity +8, depth +6',
    'Coding practice: 3/4 tests passed',
    'Weekly goal on track · 5h focus',
    'Interview readiness up to 78%'
  ]

  const bentoCards: MagicBentoCard[] = [
    {
      color: '#0B0B1F',
      title: 'Adaptive Mock Interviews',
      description: 'Live questioning that adjusts to your performance and fills gaps.',
      label: 'Mock AI'
    },
    {
      color: '#0B0B1F',
      title: 'Resume + ATS Intelligence',
      description: 'Detailed breakdowns, ATS fit, and role alignment suggestions.',
      label: 'Resume Lab'
    },
    {
      color: '#0B0B1F',
      title: 'Coding Practice Suite',
      description: 'Structured practice, hidden tests, and interview-ready templates.',
      label: 'Code Arena'
    },
    {
      color: '#0B0B1F',
      title: 'Roadmap Generator',
      description: 'Personalized learning plan that adapts with your progress.',
      label: 'Roadmap'
    },
    {
      color: '#0B0B1F',
      title: 'Skill Analytics',
      description: 'Score breakdowns by concept with actionable insights.',
      label: 'Insights'
    },
    {
      color: '#0B0B1F',
      title: 'Learning Hub',
      description: 'Complete curriculum across CS topics and interview domains.',
      label: 'Curriculum'
    }
  ]

  return (
    <div className="min-h-screen bg-[#05060f] text-white selection:bg-primary/40">
      <div className="fixed inset-0 z-50 pointer-events-none">
        <StaggeredMenu
          isFixed={false}
          position="right"
          items={menuItems}
          logoUrl={brandMark}
          socialItems={[
            { label: 'Docs', link: '#features' },
            { label: 'Contact', link: '#pricing' }
          ]}
          accentColor="#7C3AED"
          colors={['#1B0B3A', '#0B0B1F']}
          menuButtonColor="#ffffff"
          openMenuButtonColor="#111111"
          onMenuOpen={() => setMenuOpen(true)}
          onMenuClose={() => setMenuOpen(false)}
          className="pointer-events-none"
        />
      </div>

      <section className="relative overflow-hidden pt-28 lg:pt-36">
        <div className="absolute inset-0 pointer-events-none">
          {canRenderFx && (
            <LiquidEther
              className={`absolute inset-0 transition-opacity duration-300 ${menuOpen ? 'opacity-20' : 'opacity-70'}`}
              colors={['#7C3AED', '#2563EB', '#EC4899']}
              autoDemo
              autoSpeed={0.6}
              autoIntensity={2.4}
              cursorSize={130}
              mouseForce={18}
              resolution={0.7}
            />
          )}
          {canRenderFx && !menuOpen && (
            <div className="absolute inset-0 opacity-60">
              <PixelSnow
                color="#ffffff"
                flakeSize={0.01}
                minFlakeSize={1.25}
                pixelResolution={200}
                speed={1.25}
                density={0.3}
                direction={125}
                brightness={0.9}
                depthFade={8}
                farPlane={20}
                gamma={0.4545}
                variant="square"
              />
            </div>
          )}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#11152a,transparent_60%)]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#05060f]/40 via-[#05060f]/90 to-[#05060f]" />
        </div>

        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-16 px-6 pb-20 lg:flex-row lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="flex-1 space-y-8"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70">
              <Sparkles className="h-3 w-3 text-purple-300" />
              Interview prep reimagined
            </div>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl lg:text-6xl">
              The AI-powered interview studio that adapts to{' '}
              <span className="bg-gradient-to-r from-purple-300 via-blue-300 to-pink-300 bg-clip-text text-transparent">
                your ambition
              </span>
            </h1>
            <p className="text-base text-white/70 sm:text-lg">
              PrepGenius AI brings mock interviews, ATS-ready resume analysis, and guided learning into one intelligent
              platform. Train like you are already in the room.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={handleLogin}
                size="lg"
                className="h-12 rounded-full bg-white text-[#05060f] hover:bg-white/90"
              >
                Start training now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="lg"
                onClick={() => scrollToSection('#learning-hub')}
                className="h-12 rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
              >
                Explore curriculum
              </Button>
            </div>
            <div className="text-sm text-white/60">
              Already have an account?{' '}
              <button onClick={handleLogin} className="text-white underline underline-offset-4 hover:text-white/90">
                Log in
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-white/60">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                ATS-accurate resume scoring
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Adaptive AI interview engine
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
            className="flex-1"
          >
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-2xl shadow-purple-500/10 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/50">Live signals</p>
                  <h3 className="text-xl font-semibold">AI Activity Feed</h3>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                  Real-time
                </span>
              </div>
              <div className="mt-6 flex justify-center">
                <AnimatedList
                  items={heroSignals}
                  className="w-full"
                  itemClassName="bg-[#0c1022] border border-white/5"
                  showGradients
                  displayScrollbar={false}
                  enableArrowNavigation
                />
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-7xl px-6 py-24">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Platform architecture</p>
            <h2 className="text-3xl font-semibold sm:text-4xl">Everything you need to land the role</h2>
            <p className="mt-4 max-w-2xl text-white/65">
              From deep skill analytics to resume intelligence, every module is built to mimic real interview pressure
              while coaching you forward.
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-white/60">
            <Cpu className="h-4 w-4 text-purple-300" />
            Powered by adaptive AI models
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="mt-12"
        >
          <MagicBento cards={bentoCards} enableTilt enableMagnetism glowColor="124, 58, 237" />
        </motion.div>
      </section>

      <section id="how-it-works" className="bg-[#0A0B1A] py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="flex flex-col gap-4 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">How it works</p>
            <h2 className="text-3xl font-semibold sm:text-4xl">Your interview workflow, stacked for momentum</h2>
            <p className="mx-auto max-w-2xl text-white/60">
              Each step is optimized for clarity: assess, iterate, and build interview muscle with guided repetition.
            </p>
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-6xl px-6">
          <div className="h-[540px] rounded-[36px] border border-white/10 bg-[#0B0D1F]">
            <ScrollStack className="h-full" useWindowScroll={false} itemDistance={80} itemStackDistance={20}>
              {[
                {
                  icon: BrainCircuit,
                  title: 'Assess your baseline',
                  text: 'Start with an AI mock interview tailored to your target role and timeline.'
                },
                {
                  icon: Layers,
                  title: 'Refine your fundamentals',
                  text: 'Use curated learning tracks and coding practice aligned with your weaknesses.'
                },
                {
                  icon: MessagesSquare,
                  title: 'Get actionable feedback',
                  text: 'Receive detailed scoring, rubric coverage, and suggestions for improvement.'
                },
                {
                  icon: Zap,
                  title: 'Iterate with confidence',
                  text: 'Each session adapts to your progress so every attempt feels real.'
                }
              ].map(step => (
                <ScrollStackItem key={step.title} itemClassName="bg-[#121428] border border-white/10 text-white">
                  <div className="flex h-full flex-col justify-between">
                    <div className="flex items-center gap-3 text-lg font-semibold">
                      <step.icon className="h-5 w-5 text-purple-300" />
                      {step.title}
                    </div>
                    <p className="mt-4 text-white/65">{step.text}</p>
                    <div className="mt-6 text-xs uppercase tracking-[0.3em] text-white/40">PrepGenius Loop</div>
                  </div>
                </ScrollStackItem>
              ))}
            </ScrollStack>
          </div>
        </div>
      </section>

      <section id="learning-hub" className="mx-auto w-full max-w-7xl px-6 py-24">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Learning hub</p>
            <h2 className="text-3xl font-semibold sm:text-4xl">AI coach that feels human, with a plan</h2>
            <p className="text-white/65">
              The platform stores your progress, revisits weak spots, and tells you exactly what to practice next. No
              guesswork, no generic advice.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                'Domain-wise score analytics',
                'Adaptive learning paths',
                'Resume improvement loop',
                'Mock interview transcripts'
              ].map(item => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  {item}
                </div>
              ))}
            </div>
          </div>
          <ProfileCard
            name="Ariana Holt"
            role="Senior Interview Coach"
            subtitle="AI Mentor · Product & Eng Roles"
            stats={[
              { label: 'Sessions', value: '312' },
              { label: 'Avg Score', value: '89' },
              { label: 'Feedback', value: '98%' }
            ]}
            tags={['Behavioral', 'System Design', 'Leadership', 'Product Sense']}
          />
        </div>
      </section>

      <section id="pricing" className="bg-[#0A0B1A] py-20">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-6 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Ready to start?</p>
          <h2 className="text-3xl font-semibold sm:text-4xl">Train with the AI you will meet in interviews</h2>
          <p className="max-w-2xl text-white/60">
            Activate your interview environment, build momentum, and measure real progress with PrepGenius AI.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={handleLogin}
              size="lg"
              className="h-12 rounded-full bg-white text-[#05060f] hover:bg-white/90"
            >
              Launch PrepGenius
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => scrollToSection('#features')}
              className="h-12 rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10"
            >
              Explore features
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-xs text-white/40">
        © 2026 PrepGenius AI. Crafted for modern interview readiness.
      </footer>
    </div>
  )
}
