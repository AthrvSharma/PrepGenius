import React from 'react'
import { motion } from 'framer-motion'
import { BadgeCheck, Sparkles, Star } from 'lucide-react'

interface ProfileCardProps {
  name: string
  role: string
  subtitle?: string
  avatarUrl?: string
  stats?: { label: string; value: string }[]
  tags?: string[]
  className?: string
}

const defaultStats = [
  { label: 'Sessions', value: '128' },
  { label: 'Avg Score', value: '86' },
  { label: 'Streak', value: '21d' }
]

const defaultTags = ['Behavioral', 'System Design', 'DSA', 'Leadership']

const ProfileCard: React.FC<ProfileCardProps> = ({
  name,
  role,
  subtitle,
  avatarUrl,
  stats = defaultStats,
  tags = defaultTags,
  className = ''
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-[#0F172A] via-[#0B1020] to-[#14162D] p-8 text-white shadow-2xl ${className}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.2),transparent_55%),radial-gradient(circle_at_80%_10%,rgba(236,72,153,0.18),transparent_55%)]" />
      <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl" />
      <div className="absolute -bottom-28 -left-24 h-56 w-56 rounded-full bg-indigo-500/20 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-14 w-14 overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xl font-bold">
                    {name
                      .split(' ')
                      .map(part => part[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/90 shadow-lg">
                <BadgeCheck className="h-4 w-4 text-white" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{name}</h3>
                <Sparkles className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-sm text-white/70">{role}</p>
              {subtitle && <p className="text-xs text-white/50">{subtitle}</p>}
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <Star className="h-3 w-3 text-yellow-400" />
            Elite Coach
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {stats.map(stat => (
            <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-xs text-white/60">{stat.label}</div>
              <div className="text-lg font-semibold">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

export default ProfileCard
