'use client'

import { useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import Image from 'next/image'
import { 
  Tag, 
  MessageCircle, 
  Zap, 
  Globe, 
  Shield, 
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Package,
  Users,
  CreditCard,
  Sparkles,
  Target,
  Heart,
  Rocket
} from 'lucide-react'

// Unsplash 图片配置
const UNSPLASH_IMAGES = {
  // Hero 区域 - 电商/销售主题
  hero: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&h=600&fit=crop',
  // 特性区域 - 团队协作/商业
  features: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&h=400&fit=crop',
  // 步骤区域 - 包装/物流
  steps: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&h=400&fit=crop',
  // 权益区域 - 成功/增长
  benefits: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&h=400&fit=crop',
  // 平台功能 - 科技/数据
  platform: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=400&fit=crop',
  // CTA 区域 - 创业/开始
  cta: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&h=400&fit=crop',
}

// 图片卡片组件
function ImageCard({ 
  src, 
  alt, 
  className = '',
  overlay = false 
}: { 
  src: string
  alt: string
  className?: string
  overlay?: boolean
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover transition-transform duration-500 hover:scale-105"
        sizes="(max-width: 768px) 100vw, 50vw"
      />
      {overlay && (
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
      )}
    </div>
  )
}

// 装饰性背景组件
function GridPattern({ className }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
    </div>
  )
}

function FloatingShape({ 
  className, 
  delay = 0 
}: { 
  className?: string
  delay?: number 
}) {
  return (
    <div 
      className={`absolute rounded-full blur-3xl opacity-30 animate-pulse ${className}`}
      style={{ animationDelay: `${delay}s`, animationDuration: '4s' }}
    />
  )
}

// 特性卡片组件
function FeatureCard({ 
  icon, 
  title, 
  description, 
  gradient = 'from-primary/10 to-primary/5'
}: { 
  icon: React.ReactNode
  title: string
  description: string
  gradient?: string
}) {
  return (
    <Card className="group p-6 hover:shadow-xl transition-all duration-300 border-0 shadow-md bg-gradient-to-br from-card to-card/50 overflow-hidden relative">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
      <div className="relative z-10">
        <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <h3 className="text-xl font-semibold mb-3 group-hover:text-primary transition-colors">{title}</h3>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </Card>
  )
}

// 步骤卡片组件
function StepCard({ 
  icon, 
  title, 
  description, 
  step,
  isLast 
}: { 
  icon: React.ReactNode
  title: string
  description: string
  step: number
  isLast: boolean
}) {
  return (
    <div className="relative text-center group">
      {/* 步骤编号背景 */}
      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center z-10 shadow-lg">
        {step}
      </div>
      
      {/* 图标容器 */}
      <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground mx-auto mb-5 shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 relative overflow-hidden">
        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="relative z-10">{icon}</div>
      </div>
      
      <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[200px] mx-auto">{description}</p>
      
      {/* 连接线 - 仅桌面端显示，使用固定宽度避免溢出 */}
      {!isLast && (
        <div className="hidden lg:block absolute top-10 left-[70%] w-16 xl:w-24 h-0.5">
          <div className="h-full bg-gradient-to-r from-primary/50 to-primary/20 rounded-full" />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary/50" />
        </div>
      )}
    </div>
  )
}

// 统计数据卡片
function StatCard({ 
  value, 
  label, 
  icon: Icon,
  color = 'primary'
}: { 
  value: string
  label: string
  icon: React.ElementType
  color?: 'primary' | 'green' | 'blue' | 'purple'
}) {
  const colorClasses = {
    primary: 'from-primary/20 to-primary/5 text-primary',
    green: 'from-green-500/20 to-green-500/5 text-green-600',
    blue: 'from-blue-500/20 to-blue-500/5 text-blue-600',
    purple: 'from-purple-500/20 to-purple-500/5 text-purple-600',
  }

  return (
    <div className="bg-card rounded-2xl p-3 sm:p-5 shadow-lg border border-border/50 hover:shadow-xl transition-shadow flex-1 max-w-[160px] sm:max-w-none">
      <div className="flex items-center gap-2 sm:gap-4">
        <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br ${colorClasses[color]} flex items-center justify-center flex-shrink-0`}>
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-xl sm:text-2xl font-bold">{value}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{label}</p>
        </div>
      </div>
    </div>
  )
}

export default function SellerLandingPage() {
  const t = useTranslations('sellerLanding')

  const features = [
    {
      icon: <Heart className="h-7 w-7" />,
      title: t('features.zeroCommission.title'),
      description: t('features.zeroCommission.description'),
      gradient: 'from-rose-500/10 to-rose-500/5',
    },
    {
      icon: <MessageCircle className="h-7 w-7" />,
      title: t('features.instantChat.title'),
      description: t('features.instantChat.description'),
      gradient: 'from-blue-500/10 to-blue-500/5',
    },
    {
      icon: <Sparkles className="h-7 w-7" />,
      title: t('features.aiAssist.title'),
      description: t('features.aiAssist.description'),
      gradient: 'from-amber-500/10 to-amber-500/5',
    },
    {
      icon: <Globe className="h-7 w-7" />,
      title: t('features.globalSales.title'),
      description: t('features.globalSales.description'),
      gradient: 'from-cyan-500/10 to-cyan-500/5',
    },
    {
      icon: <Shield className="h-7 w-7" />,
      title: t('features.securePayment.title'),
      description: t('features.securePayment.description'),
      gradient: 'from-emerald-500/10 to-emerald-500/5',
    },
    {
      icon: <TrendingUp className="h-7 w-7" />,
      title: t('features.growthTools.title'),
      description: t('features.growthTools.description'),
      gradient: 'from-violet-500/10 to-violet-500/5',
    },
  ]

  const steps = [
    { icon: <Package className="h-8 w-8" />, title: t('steps.create.title'), description: t('steps.create.description') },
    { icon: <Tag className="h-8 w-8" />, title: t('steps.list.title'), description: t('steps.list.description') },
    { icon: <MessageCircle className="h-8 w-8" />, title: t('steps.chat.title'), description: t('steps.chat.description') },
    { icon: <CreditCard className="h-8 w-8" />, title: t('steps.sell.title'), description: t('steps.sell.description') },
  ]

  const benefits = [
    t('benefits.item1'),
    t('benefits.item2'),
    t('benefits.item3'),
    t('benefits.item4'),
    t('benefits.item5'),
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 lg:py-32">
        {/* 背景装饰 */}
        <GridPattern />
        <FloatingShape className="w-96 h-96 bg-primary/30 -top-48 -right-48" delay={0} />
        <FloatingShape className="w-64 h-64 bg-secondary/40 top-1/2 -left-32" delay={1} />
        <FloatingShape className="w-80 h-80 bg-primary/20 bottom-0 right-1/4" delay={2} />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-8 items-center">
            <div className="space-y-8">

              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl leading-tight">
                {t('hero.title')}
              </h1>
              <p className="text-xl text-muted-foreground max-w-lg leading-relaxed">
                {t('hero.subtitle')}
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="text-lg px-8 shadow-lg hover:shadow-xl transition-shadow">
                  <Link href="/subscription/seller">
                    {t('hero.ctaPrimary')}
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="text-lg px-8 backdrop-blur-sm">
                  <Link href="#pricing">
                    {t('hero.ctaSecondary')}
                  </Link>
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 bg-card/50 px-3 py-1.5 rounded-full">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>{t('hero.stats.noCommission')}</span>
                </div>
                <div className="flex items-center gap-2 bg-card/50 px-3 py-1.5 rounded-full">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>{t('hero.stats.instantPayout')}</span>
                </div>
              </div>
            </div>
            
            {/* Hero 右侧视觉区域 - Unsplash 图片 */}
            <div className="relative w-full max-w-full overflow-hidden">
              {/* 主图片卡片 */}
              <div className="relative rounded-3xl overflow-hidden shadow-2xl border">
                <ImageCard 
                  src={UNSPLASH_IMAGES.hero}
                  alt="Seller success"
                  className="aspect-[4/3] w-full"
                  overlay
                />
                {/* 图片上的文字叠加 */}
                <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg flex-shrink-0">
                      <Rocket className="h-5 w-5 sm:h-6 sm:w-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base sm:text-lg font-semibold text-black truncate">
                        {t('hero.imageText')}
                      </p>
                      <p className="text-xs sm:text-sm text-black/80 truncate">Join 10,000+ successful sellers</p>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* 浮动统计卡片 - 图片下方 */}
              <div className="flex justify-center gap-3 sm:gap-4 mt-6 px-4 sm:px-0">
                <StatCard 
                  value="10K+" 
                  label={t('hero.stats.sellers')} 
                  icon={Users}
                  color="blue"
                />
                <StatCard 
                  value="$2M+" 
                  label={t('hero.stats.revenue')} 
                  icon={TrendingUp}
                  color="green"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 lg:py-32 relative">
        <FloatingShape className="w-72 h-72 bg-primary/10 top-0 right-0" delay={1.5} />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              {t('features.title')}
            </h2>
            <p className="text-xl text-muted-foreground">
              {t('features.subtitle')}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <FeatureCard 
                key={index} 
                icon={feature.icon}
                title={feature.title}
                description={feature.description}
                gradient={feature.gradient}
              />
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="py-20 lg:py-32 bg-muted/30 relative overflow-hidden">
        <GridPattern className="opacity-50" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              {t('steps.title')}
            </h2>
            <p className="text-xl text-muted-foreground">
              {t('steps.subtitle')}
            </p>
          </div>
          <div className="grid gap-8 sm:gap-12 grid-cols-2 md:grid-cols-4 max-w-5xl mx-auto px-4 sm:px-0">
            {steps.map((step, index) => (
              <StepCard 
                key={index}
                icon={step.icon}
                title={step.title}
                description={step.description}
                step={index + 1}
                isLast={index === steps.length - 1}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 lg:py-32 relative">
        <FloatingShape className="w-96 h-96 bg-secondary/20 -bottom-48 -left-48" delay={2} />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid gap-12 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-6">
                {t('benefits.title')}
              </h2>
              <p className="text-xl text-muted-foreground mb-8">
                {t('benefits.subtitle')}
              </p>
              <ul className="space-y-4">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start gap-3 group">
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      <CheckCircle2 className="h-4 w-4 text-primary group-hover:text-primary-foreground" />
                    </div>
                    <span className="text-lg">{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            {/* 右侧图片展示 */}
            <div className="relative mt-8 lg:mt-0">
              <div className="rounded-3xl overflow-hidden shadow-2xl border">
                <ImageCard 
                  src={UNSPLASH_IMAGES.benefits}
                  alt="Business growth"
                  className="aspect-square w-full"
                />
              </div>
              {/* 浮动数据卡片 - 移动端调整位置避免溢出 */}
              <div className="absolute -bottom-2 -left-2 sm:-bottom-4 sm:-left-4 bg-card rounded-xl shadow-lg p-3 sm:p-4 border">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-lg sm:text-xl font-bold">0%</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{t('benefits.stats.commission')}</p>
                  </div>
                </div>
              </div>
              <div className="absolute -top-2 -right-2 sm:-top-4 sm:-right-4 bg-card rounded-xl shadow-lg p-3 sm:p-4 border">
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <Globe className="h-4 w-4 sm:h-5 sm:w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-lg sm:text-xl font-bold">30+</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{t('benefits.stats.currencies')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Features Section */}
      <section id="pricing" className="py-20 lg:py-32 bg-muted/30 relative">
        <GridPattern className="opacity-30" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              {t('platform.title')}
            </h2>
            <p className="text-xl text-muted-foreground">
              {t('platform.subtitle')}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
            {[
              { icon: <Package className="h-8 w-8" />, title: t('platform.features.products.title'), desc: t('platform.features.products.description'), color: 'from-blue-500/20 to-blue-500/5' },
              { icon: <MessageCircle className="h-8 w-8" />, title: t('platform.features.communication.title'), desc: t('platform.features.communication.description'), color: 'from-green-500/20 to-green-500/5' },
              { icon: <Shield className="h-8 w-8" />, title: t('platform.features.security.title'), desc: t('platform.features.security.description'), color: 'from-amber-500/20 to-amber-500/5' },
              { icon: <Globe className="h-8 w-8" />, title: t('platform.features.global.title'), desc: t('platform.features.global.description'), color: 'from-cyan-500/20 to-cyan-500/5' },
              { icon: <Zap className="h-8 w-8" />, title: t('platform.features.ai.title'), desc: t('platform.features.ai.description'), color: 'from-violet-500/20 to-violet-500/5' },
              { icon: <TrendingUp className="h-8 w-8" />, title: t('platform.features.analytics.title'), desc: t('platform.features.analytics.description'), color: 'from-rose-500/20 to-rose-500/5' },
            ].map((item, index) => (
              <Card key={index} className="p-8 text-center hover:shadow-xl transition-all duration-300 border-0 shadow-md group">
                <div className={`h-16 w-16 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  <div className="text-primary">{item.icon}</div>
                </div>
                <h3 className="text-xl font-semibold mb-3 group-hover:text-primary transition-colors">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </Card>
            ))}
          </div>
          <div className="text-center mt-12">
            <Button asChild size="lg" className="text-lg px-8 shadow-lg hover:shadow-xl transition-shadow">
              <Link href="/subscription/seller">
                {t('platform.cta')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 lg:py-32 relative">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              {t('faq.title')}
            </h2>
            <p className="text-xl text-muted-foreground">
              {t('faq.subtitle')}
            </p>
          </div>
          <div className="max-w-3xl mx-auto space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6 hover:shadow-md transition-shadow border-0 shadow-sm">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-sm flex items-center justify-center flex-shrink-0">
                    Q
                  </span>
                  {t(`faq.question${i}`)}
                </h3>
                <p className="text-muted-foreground pl-8">{t(`faq.answer${i}`)}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-32 relative overflow-hidden">
        {/* 背景图片 */}
        <div className="absolute inset-0">
          <Image
            src={UNSPLASH_IMAGES.cta}
            alt="Start your journey"
            fill
            className="object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-primary/85" />
        </div>
        <GridPattern className="opacity-10" />
        
        <div className="container mx-auto px-4 text-center relative z-10">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4 text-primary-foreground">
              {t('cta.title')}
            </h2>
            <p className="text-xl opacity-90 mb-8 text-primary-foreground/90">
              {t('cta.subtitle')}
            </p>
            <Button asChild size="lg" variant="secondary" className="text-lg px-8 shadow-xl hover:shadow-2xl transition-shadow bg-white text-primary hover:bg-white/90">
              <Link href="/subscription/seller">
                {t('cta.button')}
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
