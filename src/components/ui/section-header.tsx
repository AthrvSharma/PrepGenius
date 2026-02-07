import React from 'react'
import { motion } from 'framer-motion'

interface SectionHeaderProps {
  title: string
  subtitle?: string
  kicker?: string
  align?: 'left' | 'center'
  children?: React.ReactNode
}

export function SectionHeader({ title, subtitle, kicker, align = 'left', children }: SectionHeaderProps) {
  const isCenter = align === 'center'
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`flex flex-col gap-3 ${isCenter ? 'items-center text-center' : 'items-start text-left'}`}
    >
      {kicker && (
        <div className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">{kicker}</div>
      )}
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground max-w-2xl">{subtitle}</p>}
      {children}
    </motion.div>
  )
}
