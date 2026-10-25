'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const tabs = [
  { id: 'mine', label: 'My notes' },
  { id: 'shared', label: 'Shared with me' },
] as const

type TabId = (typeof tabs)[number]['id']

interface NotesTabsProps {
  myNotes: ReactNode
  sharedNotes: ReactNode
}

export function NotesTabs({ myNotes, sharedNotes }: NotesTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>('mine')

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Notes"
        className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`notes-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`notes-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
                selected
                  ? 'border-black text-zinc-900 dark:border-white dark:text-zinc-100'
                  : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div
        role="tabpanel"
        id="notes-panel-mine"
        aria-labelledby="notes-tab-mine"
        hidden={activeTab !== 'mine'}
      >
        {myNotes}
      </div>
      <div
        role="tabpanel"
        id="notes-panel-shared"
        aria-labelledby="notes-tab-shared"
        hidden={activeTab !== 'shared'}
      >
        {sharedNotes}
      </div>
    </div>
  )
}
