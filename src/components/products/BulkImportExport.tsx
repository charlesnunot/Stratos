'use client'

import { useState, useRef } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Upload, Download, FileJson, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react'
import { useToast } from '@/lib/hooks/useToast'
import { useTranslations } from 'next-intl'

interface BulkImportExportProps {
  userId: string
  subscriptionTier: number
}

interface ImportResult {
  success: boolean
  totalAttempted: number
  imported: number
  failed: number
  errors: Array<{ row: number; error: string }>
}

export function BulkImportExport({ userId, subscriptionTier }: BulkImportExportProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const t = useTranslations('seller')
  const tCommon = useTranslations('common')
  
  const [activeTab, setActiveTab] = useState('import')
  const [importFormat, setImportFormat] = useState<'csv' | 'json'>('csv')
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validationResult, setValidationResult] = useState<any>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check if user has access (Growth or Scale tier)
  const hasAccess = subscriptionTier >= 50

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async ({ file, format, dryRun }: { file: File; format: string; dryRun: boolean }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('format', format)
      formData.append('dryRun', dryRun.toString())

      const response = await fetch('/api/seller/products/bulk-import', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Import failed')
      }

      return data
    },
    onSuccess: (data) => {
      if (data.dryRun) {
        setValidationResult(data)
      } else {
        toast({
          title: tCommon('success'),
          description: `成功导入 ${data.imported} 个商品，失败 ${data.failed} 个`,
        })
        setSelectedFile(null)
        setValidationResult(null)
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: tCommon('error'),
        description: error.message || tCommon('retry'),
      })
    },
  })

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async (format: string) => {
      const response = await fetch(`/api/seller/products/export?format=${format}`, {
        method: 'GET',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Export failed')
      }

      // Download file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `products-export-${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    },
    onSuccess: () => {
      toast({
        title: tCommon('success'),
        description: '商品导出成功',
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setValidationResult(null)
    }
  }

  const handleValidate = () => {
    if (!selectedFile) return
    importMutation.mutate({ file: selectedFile, format: importFormat, dryRun: true })
  }

  const handleImport = () => {
    if (!selectedFile) return
    importMutation.mutate({ file: selectedFile, format: importFormat, dryRun: false })
  }

  const downloadTemplate = () => {
    const csvTemplate = `name,description,price,currency,stock,category,condition,images,color_options,sizes,shipping_fee,sales_countries
示例商品,这是一个示例商品描述,99.99,USD,100,电子产品,new,https://example.com/image1.jpg;https://example.com/image2.jpg,红色;蓝色;黑色,S;M;L;XL,10,中国;美国;日本
示例商品2,这是第二个示例商品,199.99,USD,50,服装,like_new,https://example.com/image3.jpg,白色;灰色,M;L;XL,15,中国;英国`

    const blob = new Blob([csvTemplate], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'product-import-template.csv'
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  if (!hasAccess) {
    return (
      <Card className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            批量导入/导出功能仅对 Growth 和 Scale 档位卖家开放。
            请升级您的订阅以使用此功能。
          </AlertDescription>
        </Alert>
      </Card>
    )
  }

  return (
    <Card className="p-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="import">批量导入</TabsTrigger>
          <TabsTrigger value="export">批量导出</TabsTrigger>
        </TabsList>

        <TabsContent value="import" className="space-y-4">
          <div className="space-y-2">
            <Label>导入格式</Label>
            <div className="flex gap-2">
              <Button
                variant={importFormat === 'csv' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setImportFormat('csv')}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button
                variant={importFormat === 'json' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setImportFormat('json')}
              >
                <FileJson className="mr-2 h-4 w-4" />
                JSON
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>选择文件</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept={importFormat === 'csv' ? '.csv' : '.json'}
              onChange={handleFileSelect}
            />
            <p className="text-sm text-muted-foreground">
              支持 {importFormat.toUpperCase()} 格式，最大 10MB
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={downloadTemplate}
            >
              下载模板
            </Button>
            <Button
              onClick={handleValidate}
              disabled={!selectedFile || importMutation.isPending}
            >
              {importMutation.isPending && importMutation.variables?.dryRun ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              验证数据
            </Button>
            <Button
              onClick={handleImport}
              disabled={!selectedFile || importMutation.isPending || (validationResult && !validationResult.canImport)}
            >
              {importMutation.isPending && !importMutation.variables?.dryRun ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              开始导入
            </Button>
          </div>

          {validationResult && (
            <Alert variant={validationResult.canImport ? 'default' : 'destructive'}>
              <AlertDescription>
                <div className="space-y-1">
                  <p>总行数: {validationResult.totalRows}</p>
                  <p>有效行数: {validationResult.validRows}</p>
                  <p>无效行数: {validationResult.invalidRows}</p>
                  {validationResult.remainingSlots !== undefined && (
                    <p>剩余商品位: {validationResult.remainingSlots}</p>
                  )}
                  {validationResult.validationErrors?.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium">错误详情:</p>
                      <ul className="list-disc list-inside text-sm">
                        {validationResult.validationErrors.slice(0, 5).map((err: any, idx: number) => (
                          <li key={idx}>第 {err.row} 行: {err.errors.join(', ')}</li>
                        ))}
                        {validationResult.validationErrors.length > 5 && (
                          <li>...还有 {validationResult.validationErrors.length - 5} 个错误</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          <div className="space-y-2">
            <Label>导出格式</Label>
            <div className="flex gap-2">
              <Button
                variant={exportFormat === 'csv' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExportFormat('csv')}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button
                variant={exportFormat === 'json' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setExportFormat('json')}
              >
                <FileJson className="mr-2 h-4 w-4" />
                JSON
              </Button>
            </div>
          </div>

          <Button
            onClick={() => exportMutation.mutate(exportFormat)}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            导出所有商品
          </Button>

          <Alert>
            <AlertDescription>
              导出将包含您所有的商品信息，包括已上架、待审核和已下架的商品。
            </AlertDescription>
          </Alert>
        </TabsContent>
      </Tabs>
    </Card>
  )
}
