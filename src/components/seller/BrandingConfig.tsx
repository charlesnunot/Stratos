'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { 
  Palette, 
  Image, 
  Type, 
  Link, 
  Phone, 
  Mail,
  AlertCircle,
  Save,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react'
import { useToast } from '@/lib/hooks/useToast'
import { useTranslations } from 'next-intl'

interface BrandingConfigProps {
  userId: string
  subscriptionTier: number
}

interface BrandingData {
  brand_name?: string
  brand_description?: string
  brand_logo_url?: string
  brand_favicon_url?: string
  primary_color?: string
  secondary_color?: string
  accent_color?: string
  background_color?: string
  text_color?: string
  heading_font?: string
  body_font?: string
  hero_image_url?: string
  hero_title?: string
  hero_subtitle?: string
  show_social_links?: boolean
  show_contact_info?: boolean
  website_url?: string
  instagram_url?: string
  twitter_url?: string
  facebook_url?: string
  youtube_url?: string
  contact_email?: string
  contact_phone?: string
  business_hours?: string
  is_published?: boolean
}

export function BrandingConfig({ userId, subscriptionTier }: BrandingConfigProps) {
  const { toast } = useToast()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  const queryClient = useQueryClient()
  
  const [activeTab, setActiveTab] = useState('brand')
  const [formData, setFormData] = useState<BrandingData>({})

  // Check if user has access (Scale tier only)
  const hasAccess = subscriptionTier >= 100

  // Fetch branding data
  const { data: brandingData, isLoading } = useQuery({
    queryKey: ['seller-branding', userId],
    queryFn: async () => {
      const response = await fetch('/api/seller/branding')
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch branding')
      }
      return response.json()
    },
    enabled: hasAccess,
  })

  // Handle data change with useEffect
  useEffect(() => {
    if (brandingData?.branding) {
      setFormData(brandingData.branding)
    }
  }, [brandingData])

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: BrandingData) => {
      const response = await fetch('/api/seller/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save branding')
      }
      
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-branding', userId] })
      toast({
        title: tCommon('success'),
        description: '品牌配置已保存',
      })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: error.message || tCommon('retry'),
      })
    },
  })

  const handleChange = (field: keyof BrandingData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    saveMutation.mutate(formData)
  }

  if (!hasAccess) {
    return (
      <Card className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            自定义品牌功能仅对 Scale 档位卖家开放。
            请升级您的订阅以使用此功能。
          </AlertDescription>
        </Alert>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">品牌定制</h2>
          <p className="text-muted-foreground">自定义您的店铺品牌形象</p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.is_published || false}
              onCheckedChange={(checked: boolean) => handleChange('is_published', checked)}
            />
            <Label>{formData.is_published ? '已发布' : '未发布'}</Label>
          </div>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            保存
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="brand">
            <Type className="mr-2 h-4 w-4" />
            品牌信息
          </TabsTrigger>
          <TabsTrigger value="colors">
            <Palette className="mr-2 h-4 w-4" />
            颜色配置
          </TabsTrigger>
          <TabsTrigger value="hero">
            <Image className="mr-2 h-4 w-4" />
            首页横幅
          </TabsTrigger>
          <TabsTrigger value="contact">
            <Phone className="mr-2 h-4 w-4" />
            联系方式
          </TabsTrigger>
        </TabsList>

        <TabsContent value="brand" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>品牌基本信息</CardTitle>
              <CardDescription>设置您的品牌名称和描述</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>品牌名称</Label>
                <Input
                  value={formData.brand_name || ''}
                  onChange={(e) => handleChange('brand_name', e.target.value)}
                  placeholder="您的品牌名称"
                />
              </div>
              <div className="space-y-2">
                <Label>品牌描述</Label>
                <Textarea
                  value={formData.brand_description || ''}
                  onChange={(e) => handleChange('brand_description', e.target.value)}
                  placeholder="描述您的品牌..."
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>品牌 Logo URL</Label>
                <Input
                  value={formData.brand_logo_url || ''}
                  onChange={(e) => handleChange('brand_logo_url', e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
              </div>
              <div className="space-y-2">
                <Label>网站图标 URL</Label>
                <Input
                  value={formData.brand_favicon_url || ''}
                  onChange={(e) => handleChange('brand_favicon_url', e.target.value)}
                  placeholder="https://example.com/favicon.ico"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="colors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>颜色配置</CardTitle>
              <CardDescription>自定义您的品牌色彩</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>主色调</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.primary_color || '#3B82F6'}
                      onChange={(e) => handleChange('primary_color', e.target.value)}
                      className="w-16"
                    />
                    <Input
                      value={formData.primary_color || '#3B82F6'}
                      onChange={(e) => handleChange('primary_color', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>次色调</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.secondary_color || '#10B981'}
                      onChange={(e) => handleChange('secondary_color', e.target.value)}
                      className="w-16"
                    />
                    <Input
                      value={formData.secondary_color || '#10B981'}
                      onChange={(e) => handleChange('secondary_color', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>强调色</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.accent_color || '#F59E0B'}
                      onChange={(e) => handleChange('accent_color', e.target.value)}
                      className="w-16"
                    />
                    <Input
                      value={formData.accent_color || '#F59E0B'}
                      onChange={(e) => handleChange('accent_color', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>背景色</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={formData.background_color || '#FFFFFF'}
                      onChange={(e) => handleChange('background_color', e.target.value)}
                      className="w-16"
                    />
                    <Input
                      value={formData.background_color || '#FFFFFF'}
                      onChange={(e) => handleChange('background_color', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hero" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>首页横幅</CardTitle>
              <CardDescription>设置店铺首页的横幅展示</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>横幅图片 URL</Label>
                <Input
                  value={formData.hero_image_url || ''}
                  onChange={(e) => handleChange('hero_image_url', e.target.value)}
                  placeholder="https://example.com/hero.jpg"
                />
              </div>
              <div className="space-y-2">
                <Label>横幅标题</Label>
                <Input
                  value={formData.hero_title || ''}
                  onChange={(e) => handleChange('hero_title', e.target.value)}
                  placeholder="欢迎来到我们的店铺"
                />
              </div>
              <div className="space-y-2">
                <Label>横幅副标题</Label>
                <Input
                  value={formData.hero_subtitle || ''}
                  onChange={(e) => handleChange('hero_subtitle', e.target.value)}
                  placeholder="发现优质商品..."
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contact" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>联系方式</CardTitle>
              <CardDescription>设置客户可以联系您的方式</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.show_contact_info || false}
                  onCheckedChange={(checked: boolean) => handleChange('show_contact_info', checked)}
                />
                <Label>显示联系信息</Label>
              </div>
              <div className="space-y-2">
                <Label>联系邮箱</Label>
                <Input
                  type="email"
                  value={formData.contact_email || ''}
                  onChange={(e) => handleChange('contact_email', e.target.value)}
                  placeholder="contact@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>联系电话</Label>
                <Input
                  value={formData.contact_phone || ''}
                  onChange={(e) => handleChange('contact_phone', e.target.value)}
                  placeholder="+86 123 4567 8900"
                />
              </div>
              <div className="space-y-2">
                <Label>营业时间</Label>
                <Input
                  value={formData.business_hours || ''}
                  onChange={(e) => handleChange('business_hours', e.target.value)}
                  placeholder="周一至周五 9:00-18:00"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>社交媒体</CardTitle>
              <CardDescription>链接到您的社交媒体账号</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.show_social_links || false}
                  onCheckedChange={(checked: boolean) => handleChange('show_social_links', checked)}
                />
                <Label>显示社交媒体链接</Label>
              </div>
              <div className="space-y-2">
                <Label>网站</Label>
                <Input
                  value={formData.website_url || ''}
                  onChange={(e) => handleChange('website_url', e.target.value)}
                  placeholder="https://your-website.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Instagram</Label>
                <Input
                  value={formData.instagram_url || ''}
                  onChange={(e) => handleChange('instagram_url', e.target.value)}
                  placeholder="https://instagram.com/your-handle"
                />
              </div>
              <div className="space-y-2">
                <Label>Twitter</Label>
                <Input
                  value={formData.twitter_url || ''}
                  onChange={(e) => handleChange('twitter_url', e.target.value)}
                  placeholder="https://twitter.com/your-handle"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
