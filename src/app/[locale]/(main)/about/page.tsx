'use client'

import { useTranslations } from 'next-intl'
import { Card } from '@/components/ui/card'
import { 
  Users, 
  FileText, 
  ShoppingBag, 
  MessageCircle,
  TrendingUp,
  Shield,
  Heart,
  Award,
  Globe,
  CheckCircle2
} from 'lucide-react'

export default function AboutPage() {
  const t = useTranslations('about')

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-4">
      {/* Hero 区域 */}
      <section className="py-12 md:py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4 md:mb-6">
          {t('hero.title')}
        </h1>
        <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
          {t('hero.subtitle')}
        </p>
      </section>

      {/* 主要介绍区域 */}
      <section className="py-8 md:py-12 space-y-6">
        <div className="space-y-4">
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            {t('intro.paragraph1')}
          </p>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            {t('intro.paragraph2')}
          </p>
        </div>
      </section>

      {/* "我们是谁"区域 */}
      <section className="py-8 md:py-12 bg-muted/50 rounded-lg p-6 md:p-8 space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6">
          {t('whoWeAre.title')}
        </h2>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          {t('whoWeAre.description')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="flex gap-4">
            <Users className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
            <div>
              <p className="text-base md:text-lg font-medium">
                {t('whoWeAre.point1')}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <FileText className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
            <div>
              <p className="text-base md:text-lg font-medium">
                {t('whoWeAre.point2')}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <ShoppingBag className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
            <div>
              <p className="text-base md:text-lg font-medium">
                {t('whoWeAre.point3')}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <MessageCircle className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
            <div>
              <p className="text-base md:text-lg font-medium">
                {t('whoWeAre.point4')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* "我们在解决什么问题"区域 */}
      <section className="py-8 md:py-12 space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6">
          {t('problemsWeSolve.title')}
        </h2>
        <div className="space-y-4">
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            {t('problemsWeSolve.problem1')}
          </p>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            {t('problemsWeSolve.problem2')}
          </p>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            {t('problemsWeSolve.problem3')}
          </p>
        </div>
        <p className="text-base md:text-lg font-medium mt-6">
          {t('problemsWeSolve.solution')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className="p-6 space-y-3">
            <TrendingUp className="h-8 w-8 text-primary mb-2" />
            <p className="text-base md:text-lg font-medium">
              {t('problemsWeSolve.point1')}
            </p>
          </Card>
          <Card className="p-6 space-y-3">
            <CheckCircle2 className="h-8 w-8 text-primary mb-2" />
            <p className="text-base md:text-lg font-medium">
              {t('problemsWeSolve.point2')}
            </p>
          </Card>
          <Card className="p-6 space-y-3">
            <Shield className="h-8 w-8 text-primary mb-2" />
            <p className="text-base md:text-lg font-medium">
              {t('problemsWeSolve.point3')}
            </p>
          </Card>
        </div>
      </section>

      {/* "我们的平台理念"区域 */}
      <section className="py-8 md:py-12 bg-muted/50 rounded-lg p-6 md:p-8 space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6">
          {t('platformPhilosophy.title')}
        </h2>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          {t('platformPhilosophy.description')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          <Card className="p-6 space-y-3 bg-background">
            <Award className="h-8 w-8 text-primary mb-2" />
            <p className="text-base md:text-lg font-medium">
              {t('platformPhilosophy.point1')}
            </p>
          </Card>
          <Card className="p-6 space-y-3 bg-background">
            <Heart className="h-8 w-8 text-primary mb-2" />
            <p className="text-base md:text-lg font-medium">
              {t('platformPhilosophy.point2')}
            </p>
          </Card>
          <Card className="p-6 space-y-3 bg-background">
            <Users className="h-8 w-8 text-primary mb-2" />
            <p className="text-base md:text-lg font-medium">
              {t('platformPhilosophy.point3')}
            </p>
          </Card>
        </div>
        <p className="text-base md:text-lg text-muted-foreground mt-6 italic">
          {t('platformPhilosophy.footer')}
        </p>
      </section>

      {/* "我们希望成为的样子"区域 */}
      <section className="py-8 md:py-12 space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6">
          {t('ourVision.title')}
        </h2>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
          {t('ourVision.description')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
          <Card className="p-6 text-center space-y-3">
            <MessageCircle className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-base md:text-lg font-medium">
              {t('ourVision.point1')}
            </p>
          </Card>
          <Card className="p-6 text-center space-y-3">
            <FileText className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-base md:text-lg font-medium">
              {t('ourVision.point2')}
            </p>
          </Card>
          <Card className="p-6 text-center space-y-3">
            <Shield className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-base md:text-lg font-medium">
              {t('ourVision.point3')}
            </p>
          </Card>
          <Card className="p-6 text-center space-y-3">
            <ShoppingBag className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="text-base md:text-lg font-medium">
              {t('ourVision.point4')}
            </p>
          </Card>
        </div>
        <div className="mt-6 space-y-2">
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            {t('ourVision.footer1')}
          </p>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            {t('ourVision.footer2')}
          </p>
        </div>
      </section>

      {/* 结尾区域 */}
      <section className="py-8 md:py-12 text-center space-y-6">
        <h2 className="text-3xl md:text-4xl font-bold mb-4 md:mb-6">
          {t('weAreMovingForward.title')}
        </h2>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-3xl mx-auto">
          {t('weAreMovingForward.description')}
        </p>
      </section>
    </div>
  )
}
