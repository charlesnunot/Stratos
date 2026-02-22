'use client'

import { Card } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Mail, Phone, Clock, Globe, User } from 'lucide-react'

interface AccountManager {
  id: string
  name: string
  email: string
  phone?: string
  avatar_url?: string
  title?: string
  working_hours?: string
  languages?: string[]
}

interface AccountManagerCardProps {
  manager: AccountManager
  assignedAt?: string
  showContactButtons?: boolean
}

export function AccountManagerCard({
  manager,
  assignedAt,
  showContactButtons = true,
}: AccountManagerCardProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <Card className="p-6">
      <div className="flex items-start gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={manager.avatar_url} alt={manager.name} />
          <AvatarFallback className="text-lg bg-primary text-primary-foreground">
            {getInitials(manager.name)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold">{manager.name}</h3>
            <span className="text-sm text-muted-foreground">
              {manager.title || '客户经理'}
            </span>
          </div>

          {assignedAt && (
            <p className="text-sm text-muted-foreground mb-3">
              自 {formatDate(assignedAt)} 成为您的专属客户经理
            </p>
          )}

          <div className="space-y-2 text-sm">
            {manager.working_hours && (
              <div className="flex items-center text-muted-foreground">
                <Clock size={16} className="mr-2 flex-shrink-0" />
                <span>工作时间: {manager.working_hours}</span>
              </div>
            )}

            {manager.languages && manager.languages.length > 0 && (
              <div className="flex items-center text-muted-foreground">
                <Globe size={16} className="mr-2 flex-shrink-0" />
                <span>语言: {manager.languages.join(', ')}</span>
              </div>
            )}
          </div>

          {showContactButtons && (
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" asChild>
                <a href={`mailto:${manager.email}`}>
                  <Mail size={16} className="mr-2" />
                  发邮件
                </a>
              </Button>

              {manager.phone && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${manager.phone}`}>
                    <Phone size={16} className="mr-2" />
                    打电话
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
